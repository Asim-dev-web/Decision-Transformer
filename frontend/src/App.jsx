import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Rocket,
  Radar,
  Activity,
  Zap,
  Terminal,
  Satellite,
  Gauge,
  CircleDot,
} from "lucide-react";
import Starfield from "./components/Starfield";
import SimCanvas from "./components/SimCanvas";
import MissionLog from "./components/MissionLog";
import Telemetry from "./components/Telemetry";
import { METERS_PER_UNIT } from "./constants";

const API_URL = "https://decision-transformer-api.onrender.com/simulate";
const MIN_TARGET = -200;
const MAX_TARGET = 250;
const SPEEDS = [0.5, 1, 2, 4];

const PUBLISH_MS = 140;

const LOG_MS = 320;

const MAX_TRAIL = 1200;

const SCALE_TICKS = Array.from({ length: 19 }, (_, i) => i);

const BOOT_LINES = [
  { text: "DT AGENT INFERENCE: ACTIVE", level: "info" },
  { text: "PHYSICS SYNC: OK", level: "" },
  { text: "TELEMETRY UPLINK: ESTABLISHED", level: "" },
  { text: "GYRO CALIBRATION: OK", level: "" },
  { text: "AWAITING LAUNCH COMMAND...", level: "warn" },
];

let logClock = 0;

export default function App() {
  const [targetReturn, setTargetReturn] = useState(250);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [totalReward, setTotalReward] = useState(0);
  const [speed, setSpeed] = useState(2);
  const [logs, setLogs] = useState(() =>
    BOOT_LINES.map((l) => ({ ...l, t: ++logClock }))
  );

  const dataRef = useRef(null);
  const trailRef = useRef([]);
  const idxRef = useRef(0);
  const rewardRef = useRef(0);
  const speedRef = useRef(speed);
  const runningRef = useRef(false);
  const rafRef = useRef(0);
  const accRef = useRef(0);
  const lastRef = useRef(0);

  const liveRef = useRef({ frame: null, trail: [] });
  const lastPublishRef = useRef(0);
  const lastLogRef = useRef(0);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  const pushLog = useCallback((text, level = "") => {
    setLogs((prev) => {
      const next = [...prev, { text, level, t: ++logClock }];
      return next.length > 120 ? next.slice(next.length - 120) : next;
    });
  }, []);

  const trajectory = dataRef.current?.trajectory || [];
  const currentFrame = trajectory[idxRef.current] || null;
  const totalSteps = trajectory.length || 1;

  const finish = useCallback(() => {
    runningRef.current = false;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;

    setFrameIndex(idxRef.current);
    setTotalReward(rewardRef.current);
    const data = dataRef.current;
    const reward = rewardRef.current;
    let finalStatus = data?.status || "completed";
    if (finalStatus === "completed") {
      if (reward >= 100) finalStatus = "landed";
      else if (reward <= -100) finalStatus = "crashed";
      else finalStatus = "completed";
    }
    setStatus(finalStatus);
    if (finalStatus === "landed") {
      pushLog(">> TOUCHDOWN CONFIRMED. PAD 01 SECURED.", "info");
      pushLog(`FINAL REWARD: ${reward.toFixed(2)} · MISSION SUCCESS`, "info");
    } else if (finalStatus === "crashed") {
      pushLog("!! HULL INTEGRITY FAILURE. LANDER DESTROYED.", "err");
      pushLog(`FINAL REWARD: ${reward.toFixed(2)}`, "err");
    } else {
      pushLog("SIMULATION COMPLETE. EPISODE ENDED.", "warn");
      pushLog(`FINAL REWARD: ${reward.toFixed(2)}`, "warn");
    }
  }, [pushLog]);

  const startPlayback = useCallback(() => {
    const data = dataRef.current;
    if (!data || !data.trajectory?.length) return;

    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    runningRef.current = false;
    idxRef.current = 0;
    rewardRef.current = 0;
    trailRef.current = [];
    liveRef.current.frame = null;
    liveRef.current.trail = trailRef.current;
    accRef.current = 0;
    lastRef.current = performance.now();
    lastPublishRef.current = performance.now();
    lastLogRef.current = performance.now();
    runningRef.current = true;
    setFrameIndex(0);
    setTotalReward(0);
    setStatus("playing");

    const N = data.trajectory.length;
    const tick = (now) => {
      if (!runningRef.current) return;
      const dt = Math.min(120, now - lastRef.current);
      lastRef.current = now;
      accRef.current += dt;
      const frameMs = 1000 / (60 * (speedRef.current || 1));

      let advanced = false;
      while (accRef.current >= frameMs && idxRef.current < N - 1) {
        accRef.current -= frameMs;
        idxRef.current += 1;
        advanced = true;
        const f = data.trajectory[idxRef.current];
        rewardRef.current += f.reward || 0;
        const trail = trailRef.current;
        trail.push({ x: f.x, y: f.y });

        if (trail.length > MAX_TRAIL + 300) {
          trail.splice(0, trail.length - MAX_TRAIL);
        }
      }

      if (advanced) {
        liveRef.current.frame = data.trajectory[idxRef.current];
        liveRef.current.trail = trailRef.current;

        if (now - lastPublishRef.current >= PUBLISH_MS) {
          lastPublishRef.current = now;
          setFrameIndex(idxRef.current);
          setTotalReward(rewardRef.current);
        }

        if (now - lastLogRef.current >= LOG_MS) {
          lastLogRef.current = now;
          const f = data.trajectory[idxRef.current];

          const alt = (Math.max(0, f.y) * METERS_PER_UNIT).toFixed(0);
          const main = (f.main_thrust || 0).toFixed(2);
          if (Math.abs(f.vx) > 0.5)
            pushLog(`LATERAL CORRECTION: ACTIVATED (hvel ${f.vx.toFixed(2)})`, "info");
          else pushLog(`MAIN ENGINE: ${main} · ALT: ${alt}m`, "");
        }
      }

      if (idxRef.current >= N - 1) {
        finish();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [finish, pushLog]);

  const launch = useCallback(async () => {
    cancelAnimationFrame(rafRef.current);
    runningRef.current = false;
    setError(null);
    dataRef.current = null;
    trailRef.current = [];
    liveRef.current.frame = null;
    liveRef.current.trail = trailRef.current;
    idxRef.current = 0;
    rewardRef.current = 0;
    setFrameIndex(0);
    setTotalReward(0);
    setStatus("calculating");

    pushLog(`LAUNCH SEQUENCE INITIATED · TARGET RETURN ${targetReturn.toFixed(1)}`, "info");
    pushLog("REQUESTING DECISION TRANSFORMER TRAJECTORY...", "warn");
    pushLog("DT AGENT INFERENCE: ACTIVE", "info");

    const armTimer = setInterval(() => {
      const opts = [
        "PHYSICS SYNC: OK",
        "TRAJECTORY ACQUIRED",
        "ACTUATOR ARRAY: READY",
        "THRUST VECTORING: NOMINAL",
        "AWAITING DATASTREAM...",
      ];
      pushLog(opts[Math.floor(Math.random() * opts.length)], "");
    }, 320);

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_return: targetReturn }),
      });
      if (!res.ok) throw new Error(`SERVER RESPONSE ${res.status}`);
      const data = await res.json();
      clearInterval(armTimer);

      if (!data.trajectory || !data.trajectory.length) {
        throw new Error("EMPTY TRAJECTORY RETURNED");
      }

      dataRef.current = data;
      pushLog(`DATASET RECEIVED · ${data.steps} STEPS · STREAMING`, "info");
      pushLog("DESCENT IN PROGRESS — ENGAGING AUTO-PILOT", "warn");
      startPlayback();
    } catch (e) {
      clearInterval(armTimer);
      runningRef.current = false;
      setError(e?.message || "UNKNOWN UPLINK ERROR");
      setStatus("error");
      pushLog(`!! UPLINK FAILURE: ${e?.message || "UNKNOWN ERROR"}`, "err");
      pushLog("CHECK FASTAPI SERVER @ 127.0.0.1:8000", "err");
    }
  }, [targetReturn, pushLog, startPlayback]);

  useEffect(
    () => () => {
      runningRef.current = false;
      cancelAnimationFrame(rafRef.current);
    },
    []
  );

  const isBusy = status === "calculating" || status === "playing";
  const progressPct = useMemo(() => {
    if (status === "calculating") return 30;
    if (status === "playing") return Math.round(((frameIndex + 1) / totalSteps) * 100);
    if (status === "landed" || status === "crashed" || status === "completed")
      return 100;
    return 0;
  }, [status, frameIndex, totalSteps]);

  const armLabel =
    status === "calculating"
      ? "CALCULATING TRAJECTORY..."
      : status === "playing"
      ? `DESCENT IN PROGRESS · ${progressPct}%`
      : status === "landed"
      ? "STABLE ON SURFACE"
      : status === "crashed"
      ? "MISSION FAILED"
      : status === "completed"
      ? "EPISODE COMPLETE"
      : "SYSTEMS NOMINAL · READY";

  const handleSlider = (e) => {
    const v = Number(e.target.value);
    setTargetReturn(v);
  };

  const statusForTelemetry =
    status === "error" ? "idle" : status;

  return (
    <>
      <Starfield />
      <div className="crt-sweep" />
      <div className="crt-overlay" />

      <div className="app-shell">

        <header className="topbar">
          <div className="topbar-title">
            <Satellite size={15} style={{ verticalAlign: "-2px", marginRight: 8 }} />
            LUNAR LANDER —{" "}
            <span className="accent">DECISION TRANSFORMER MISSION CONTROL</span>
          </div>
          <div className="topbar-right">
            <span>RUNNING ON BROWSER</span>
            <span className="browser-tag">LIVE</span>
          </div>
        </header>

        <div className="split">

          <section className="panel">
            <div className="panel-header">
              <span>FLIGHT INPUTS & TELEMETRY</span>
              <span className="hdr-dot" />
            </div>

            <div className="panel-body">

              <div className="section">
                <div className="section-label center">
                  <span>CHOOSE TARGET RETURN</span>
                </div>

                <div className="slider-wrap">
                  <div className="slider-track-outer">
                    <input
                      type="range"
                      className="arcade-range"
                      min={MIN_TARGET}
                      max={MAX_TARGET}
                      step={0.5}
                      value={targetReturn}
                      onChange={handleSlider}
                      disabled={isBusy}
                      style={{ width: "100%" }}
                    />
                    <div className="slider-scale">
                      {SCALE_TICKS.map((i) => (
                        <span
                          key={i}
                          className={`slider-tick ${i % 3 === 0 ? "major" : ""}`}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="slider-ends">
                    <span className="end-crash">
                      {MIN_TARGET} · CRASH
                    </span>
                    <span className="end-perfect">
                      +{MAX_TARGET} · PERFECT FLIGHT
                    </span>
                  </div>

                  <div className="target-readout">
                    {targetReturn >= 0 ? "+" : ""}
                    {targetReturn.toFixed(1)}
                    <span className="unit">RTG</span>
                  </div>
                </div>
              </div>

              <div className="section launch-zone">
                <button
                  className="launch-btn"
                  onClick={launch}
                  disabled={isBusy}
                >
                  {isBusy ? (
                    "ARMING…"
                  ) : (
                    <>
                      <Rocket
                        size={20}
                        style={{ verticalAlign: "-3px", marginRight: 10 }}
                      />
                      LAUNCH SIMULATOR
                    </>
                  )}
                  <span className="sub">
                    {isBusy ? "IGNITION LOCKED" : "IGNITION"}
                  </span>
                </button>

                <div className="armbar">
                  <div
                    className="armbar-fill"
                    style={{ width: `${progressPct}%` }}
                  />
                  <div className="armbar-label">
                    {isBusy ? `${progressPct}%` : "100%"}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: 2,
                    color: "var(--text-dim)",
                    textAlign: "center",
                  }}
                >
                  {armLabel}
                </div>
              </div>

              <Telemetry
                status={statusForTelemetry}
                targetReturn={targetReturn}
                totalReward={totalReward}
              />

              <MissionLog lines={logs} />

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 9,
                  letterSpacing: 2,
                  color: "var(--text-faint)",
                }}
              >
                <span>
                  <Terminal size={10} style={{ verticalAlign: "-1px" }} /> DT-LUNAR-V3
                </span>
                <span>
                  <Activity size={10} style={{ verticalAlign: "-1px" }} /> CTX 20
                </span>
                <span>
                  <Zap size={10} style={{ verticalAlign: "-1px" }} /> CPU
                </span>
              </div>
            </div>
          </section>

          <section className="panel sim-panel">
            <div className="panel-header">
              <span>SIMULATOR & VISUAL FEED</span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Gauge size={13} />
                <span style={{ letterSpacing: 1 }}>
                  {status === "idle" ? "IDLE" : "LIVE"}
                </span>
                <span className="hdr-dot" />
              </span>
            </div>

            <div className="panel-body">
              <div className="canvas-stage">

                <div className="hud-corner tl">
                  <Radar size={10} style={{ verticalAlign: "-1px" }} /> SECTOR 07
                  · LUNAR SURFACE
                </div>
                <div className="hud-corner tr">
                  LAT 00.00 · LON 00.00 · GRID REF A1
                </div>
                <div className="hud-corner bl">
                  <CircleDot size={10} style={{ verticalAlign: "-1px" }} />{" "}
                  {currentFrame
                    ? `X ${currentFrame.x.toFixed(3)} · Y ${currentFrame.y.toFixed(3)}`
                    : "X 0.000 · Y 0.000"}
                </div>
                <div className="hud-corner br">
                  ANG{" "}
                  {currentFrame
                    ? `${(currentFrame.angle * (180 / Math.PI)).toFixed(0)}°`
                    : "0°"}{" "}
                  · STEP {currentFrame ? currentFrame.step : 0}
                </div>

                <SimCanvas
                  frame={currentFrame}
                  trail={trailRef.current}
                  sample={liveRef}
                  status={status}
                  launched={status !== "idle"}
                />

                {status === "calculating" && !error && (
                  <div className="loading-overlay">
                    <div className="radar-rings" />
                    <div className="loading-title">
                      CALCULATING TRAJECTORY...
                    </div>
                    <div className="loading-sub">
                      DECISION TRANSFORMER AGENT · INFERENCE ACTIVE
                    </div>
                  </div>
                )}

                {error && (
                  <div className="loading-overlay">
                    <div className="error-box">
                      !! UPLINK FAILURE
                      <br />
                      {error}
                      <br />
                      <span style={{ opacity: 0.75 }}>
                        ENSURE FASTAPI IS RUNNING @ 127.0.0.1:8000
                      </span>
                    </div>
                  </div>
                )}

                {status === "idle" && !error && (
                  <div className="loading-overlay" style={{ background: "rgba(2,8,16,0.55)" }}>
                    <div className="loading-title" style={{ fontSize: 15 }}>
                      SYSTEM STANDBY
                    </div>
                    <div className="loading-sub">
                      SET TARGET RETURN · PRESS LAUNCH SIMULATOR
                    </div>
                  </div>
                )}
              </div>

              <div className="playback-strip">
                <span>
                  {currentFrame ? `STEP ${currentFrame.step}` : "STEP 0"} /{" "}
                  {dataRef.current ? dataRef.current.steps : 0}
                </span>
                <div className="step-bar">
                  <div
                    className="step-bar-fill"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div className="speed-toggle">
                  {SPEEDS.map((s) => (
                    <button
                      key={s}
                      className={speed === s ? "active" : ""}
                      onClick={() => setSpeed(s)}
                    >
                      {s}×
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
