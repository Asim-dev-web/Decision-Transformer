import { useEffect, useRef } from "react";

const STATUS_META = {
  idle: { label: "STANDBY", cls: "status-idle" },
  calculating: { label: "DESCENT IN PROGRESS", cls: "status-progress" },
  playing: { label: "DESCENT IN PROGRESS", cls: "status-progress" },
  landed: { label: "LANDED", cls: "status-landed" },
  crashed: { label: "CRASHED", cls: "status-crashed" },
  completed: { label: "COMPLETED", cls: "status-completed" },
  timeout: { label: "TIMEOUT", cls: "status-timeout" },
};

function CountUp({ value, decimals = 0, duration = 500 }) {
  const ref = useRef(null);
  const raf = useRef(0);
  const shownRef = useRef(value);

  useEffect(() => {
    const from = shownRef.current;
    const to = value;
    if (from === to) return;
    const start = performance.now();

    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const cur = from + (to - from) * eased;
      shownRef.current = cur;
      const el = ref.current;
      if (el) el.textContent = cur.toFixed(decimals);
      if (t < 1) raf.current = requestAnimationFrame(tick);
      else shownRef.current = to;
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, duration, decimals]);

  return <span ref={ref}>{value.toFixed(decimals)}</span>;
}

export default function Telemetry({ status, targetReturn, totalReward }) {
  const meta = STATUS_META[status] || STATUS_META.idle;

  return (
    <div className="section">
      <div className="section-label">
        <span>TELEMETRY · SCORECARD</span>
      </div>

      <div className="stats-grid">
        <div className="stat-card orange">
          <div className="stat-label">TARGET RETURN</div>
          <div className="stat-value">
            <CountUp value={targetReturn} decimals={1} />
          </div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">TOTAL REWARD</div>
          <div className="stat-value">
            <CountUp value={totalReward} decimals={1} />
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <div className={`status-badge ${meta.cls}`}>
          <span className="led" />
          {meta.label}
        </div>
      </div>
    </div>
  );
}
