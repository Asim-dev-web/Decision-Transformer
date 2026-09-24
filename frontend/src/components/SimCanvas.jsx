import { useEffect, useRef } from "react";
import { METERS_PER_UNIT } from "../constants";

const WORLD_H = 1.9;
const GROUND_FRAC = 0.9;
const PAD_HALF_W = 0.182;
const ALT_GUIDES = [50, 100, 150];

const MAIN_THRUST_COLOR = "#ff6600";
const SIDE_THRUST_COLOR = "#00ccff";
const NEON = "#00f0ff";
const NEON_WHITE = "#eaffff";
const HULL_FILL = "rgba(3, 20, 34, 0.88)";
const PAD_COLOR = "#39ff8b";
const GLOW = 8;
const SPARK_COLORS = ["#fff0b4", "#ffaa32", "#ff6a2a", "#ff3b52"];

const SHIP_SCALE = 1.45;
const FEET_DROP = 0.09;
const D = SHIP_SCALE;
const FOOT_Y = FEET_DROP / D;

const HULL = [
  [-0.044, -0.014],
  [0.044, -0.014],
  [0.05, -0.004],
  [0.05, 0.02],
  [0.04, 0.034],
  [-0.04, 0.034],
  [-0.05, 0.02],
  [-0.05, -0.004],
];

const CABIN = [
  [-0.036, -0.014],
  [-0.034, -0.04],
  [-0.022, -0.072],
  [-0.018, -0.08],
  [0.018, -0.08],
  [0.022, -0.072],
  [0.034, -0.04],
  [0.036, -0.014],
];

const BELL = [
  [-0.02, 0.033],
  [-0.03, 0.056],
  [0.03, 0.056],
  [0.02, 0.033],
];
const BELL_RING = [
  [-0.0252, 0.045],
  [0.0252, 0.045],
];
const NOZZLE_Y = 0.056;

const WINDOW = [
  [-0.004, -0.07],
  [0.014, -0.062],
  [-0.004, -0.05],
];
const HATCH = [
  [-0.008, -0.046],
  [0.012, -0.046],
  [0.012, -0.03],
  [-0.008, -0.03],
];

const RCS = [
  [-0.036, -0.041],
  [-0.047, -0.037],
  [-0.047, -0.025],
  [-0.036, -0.021],
];
const RCS_X = 0.048;
const RCS_Y = -0.031;

const LEG_MAIN = [
  [-0.046, 0.002],
  [-0.056, 0.03],
  [-0.058, FOOT_Y - 0.006],
];
const LEG_BRACE = [
  [-0.03, 0.023],
  [-0.055, 0.046],
];
const FOOT_PAD = [
  [-0.0642, FOOT_Y],
  [-0.05, FOOT_Y],
];
const FOOT_TICKS = [
  [
    [-0.0642, FOOT_Y],
    [-0.0642, FOOT_Y - 0.007],
  ],
  [
    [-0.05, FOOT_Y],
    [-0.05, FOOT_Y - 0.005],
  ],
];

const LADDER_RAIL = [
  [-0.038, 0.014],
  [-0.046, 0.05],
];
const LADDER_RUNGS = (() => {
  const [x0, y0] = LADDER_RAIL[0];
  const [x1, y1] = LADDER_RAIL[1];
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const half = 0.0055;
  return [0.15, 0.45, 0.75].map((t) => {
    const cx = x0 + dx * t;
    const cy = y0 + dy * t;
    return [
      [cx - px * half, cy - py * half],
      [cx + px * half, cy + py * half],
    ];
  });
})();

const MAST = [
  [0.012, -0.08],
  [0.014, -0.104],
];
const DISH = { x: 0.014, y: -0.105, r: 0.009 };

function withAlpha(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function tracePath(ctx, pts, close) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i];
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  if (close) ctx.closePath();
}

const mirrorX = (pts) => pts.map(([x, y]) => [-x, y]);

const RCS_QUADS = [RCS, mirrorX(RCS)];
const LEGS = [
  {
    main: LEG_MAIN,
    brace: LEG_BRACE,
    pad: FOOT_PAD,
    ticks: FOOT_TICKS,
    ladder: true,
  },
  {
    main: mirrorX(LEG_MAIN),
    brace: mirrorX(LEG_BRACE),
    pad: mirrorX(FOOT_PAD),
    ticks: FOOT_TICKS.map(mirrorX),
    ladder: false,
  },
];

export default function SimCanvas({
  frame,
  trail,
  sample,
  status,
  launched,
  finished,
  progress,
}) {
  const canvasRef = useRef(null);
  const latest = useRef({
    frame,
    trail,
    sample,
    status,
    launched,
    finished,
    progress,
  });
  const particles = useRef([]);
  const sideParticles = useRef([]);
  const debris = useRef([]);
  const rings = useRef([]);
  const stars = useRef([]);
  const sweepAngle = useRef(0);
  const prevStatus = useRef(status);

  latest.current = {
    frame,
    trail,
    sample,
    status,
    launched,
    finished,
    progress,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf = 0;

    let idleTimer = 0;
    let w = 0;
    let h = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildStars();
    }

    function buildStars() {
      const count = Math.max(70, Math.min(240, Math.round((w * h) / 9000)));
      stars.current = new Array(count).fill(0).map(() => ({
        x: Math.random(),
        y: Math.random(),
        r: 0.4 + Math.random() * 1.2,
        a: 0.16 + Math.random() * 0.62,
        drift: 0.004 + Math.random() * 0.013,
        tw: Math.random() * Math.PI * 2,
        tws: 0.6 + Math.random() * 1.9,
        tint: Math.random(),
      }));
    }

    function drawStars(dt) {
      for (const s of stars.current) {
        s.y -= s.drift * dt;
        s.tw += s.tws * dt;
        if (s.y < -0.02) {
          s.y = 1.02;
          s.x = Math.random();
        }
        const alpha = s.a * (0.55 + 0.45 * Math.sin(s.tw));
        let color;
        if (s.tint > 0.9) color = `rgba(255, 206, 140, ${alpha})`;
        else if (s.tint > 0.76) color = `rgba(140, 235, 255, ${alpha})`;
        else color = `rgba(226, 246, 255, ${alpha * 0.9})`;

        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function drawAltitudeGuides(project, surfaceY) {
      ctx.save();
      ctx.setLineDash([2, 8]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(0, 240, 255, 0.14)";
      ctx.font = "10px 'Share Tech Mono', monospace";
      ctx.textAlign = "right";
      for (const metres of ALT_GUIDES) {
        const y = project(0, metres / METERS_PER_UNIT).y;
        if (!Number.isFinite(y) || y < 12 || y > surfaceY - 8) continue;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        ctx.fillStyle = "rgba(0, 240, 255, 0.3)";
        ctx.fillText(`${metres} M`, w - 12, y - 4);
      }
      ctx.restore();
    }

    function groundY(x) {
      const ax = Math.abs(x);
      const ramp = (span) => Math.min(1, Math.max(0, (ax - PAD_HALF_W) / span));
      const drop = ramp(0.34) * 0.06;
      const ridge =
        ramp(0.26) *
        (Math.sin(x * 2.7) * 0.02 +
          Math.sin(x * 6.1 + 1.2) * 0.011 +
          Math.sin(x * 12.3 + 0.4) * 0.006);
      return -(drop + ridge);
    }

    function drawTerrain(project, x0, x1, surfaceY) {
      if (!Number.isFinite(surfaceY) || !Number.isFinite(x0) || !Number.isFinite(x1)) return;
      const segments = 240;

      ctx.beginPath();
      for (let i = 0; i <= segments; i++) {
        const wx = x0 + (i / segments) * (x1 - x0);
        const p = project(wx, groundY(wx));
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();

      const plate = Number.isFinite(surfaceY) && Number.isFinite(h)
        ? ctx.createLinearGradient(0, surfaceY, 0, h)
        : null;
      if (plate) {
        plate.addColorStop(0, "rgba(6, 30, 46, 0.72)");
        plate.addColorStop(0.55, "rgba(3, 14, 26, 0.88)");
        plate.addColorStop(1, "rgba(1, 4, 12, 0.96)");
        ctx.fillStyle = plate;
      } else {
        ctx.fillStyle = "rgba(3, 14, 26, 0.9)";
      }
      ctx.fill();

      ctx.beginPath();
      ctx.strokeStyle = "rgba(0, 240, 255, 0.1)";
      ctx.lineWidth = 1;
      for (let wx = Math.ceil(x0 / 0.08) * 0.08; wx <= x1; wx += 0.08) {
        const a = project(wx, groundY(wx));
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.x, h);
      }
      ctx.stroke();

      ctx.beginPath();
      for (let i = 0; i <= segments; i++) {
        const wx = x0 + (i / segments) * (x1 - x0);
        const p = project(wx, groundY(wx));
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = "rgba(0, 240, 255, 0.52)";
      ctx.lineWidth = 1.3;
      ctx.shadowColor = "rgba(0, 240, 255, 0.75)";
      ctx.shadowBlur = 6;
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.beginPath();
      for (let i = 0; i <= 140; i++) {
        const wx = x0 + (i / 140) * (x1 - x0);
        const ry =
          0.17 + Math.sin(wx * 1.9 + 0.7) * 0.055 + Math.sin(wx * 4.4 + 2.1) * 0.028;
        const p = project(wx, ry);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = "rgba(0, 240, 255, 0.15)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    function drawPad(project, t) {
      const left = project(-PAD_HALF_W, 0);
      const right = project(PAD_HALF_W, 0);
      const surfaceY = left.y;
      if (!Number.isFinite(surfaceY)) return;

      const pulse = 0.72 + 0.28 * Math.sin(t * 3.1);
      const deck = Math.max(5, Math.min(13, h * 0.015));

      ctx.fillStyle = "rgba(10, 44, 34, 0.7)";
      ctx.fillRect(left.x, surfaceY, right.x - left.x, deck);

      ctx.strokeStyle = withAlpha(PAD_COLOR, 0.3);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i < 16; i++) {
        const x = left.x + ((right.x - left.x) * i) / 16;
        ctx.moveTo(x, surfaceY + 1);
        ctx.lineTo(x - 6, surfaceY + deck - 1);
      }
      ctx.moveTo(left.x, surfaceY + deck);
      ctx.lineTo(right.x, surfaceY + deck);
      ctx.stroke();

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(left.x, surfaceY);
      ctx.lineTo(right.x, surfaceY);
      ctx.strokeStyle = withAlpha(PAD_COLOR, 0.75 + 0.25 * pulse);
      ctx.lineWidth = 2.6;
      ctx.shadowColor = "rgba(57, 255, 139, 0.9)";
      ctx.shadowBlur = 14;
      ctx.stroke();
      ctx.restore();

      ctx.strokeStyle = withAlpha(PAD_COLOR, 0.35 + 0.4 * pulse);
      ctx.lineWidth = 1.4;
      for (const dir of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const px = project(dir * (0.05 + i * 0.05), 0).x;
          ctx.beginPath();
          ctx.moveTo(px - dir * 9, surfaceY + 2);
          ctx.lineTo(px, surfaceY + 8);
          ctx.lineTo(px + dir * 9, surfaceY + 2);
          ctx.stroke();
        }
      }

      ctx.strokeStyle = withAlpha(PAD_COLOR, 0.5 + 0.45 * pulse);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (const edge of [left.x, right.x]) {
        ctx.moveTo(edge, surfaceY);
        ctx.lineTo(edge, surfaceY - 26);
        ctx.moveTo(edge + (edge === left.x ? 9 : -9), surfaceY);
        ctx.lineTo(edge + (edge === left.x ? 9 : -9), surfaceY - 16);
      }
      ctx.stroke();

      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = withAlpha(PAD_COLOR, 0.35 + 0.3 * pulse);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left.x, surfaceY - 26);
      ctx.lineTo(right.x, surfaceY - 26);
      ctx.stroke();
      ctx.restore();

      ctx.font = "600 14px 'Share Tech Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = withAlpha(PAD_COLOR, 0.8 + 0.2 * pulse);
      ctx.shadowColor = "rgba(57, 255, 139, 0.9)";
      ctx.shadowBlur = 10;
      ctx.fillText("[PAD 01]", (left.x + right.x) / 2, surfaceY - 33);
      ctx.shadowBlur = 0;
      ctx.textAlign = "left";
    }

    function drawRadar(project, dt) {
      const centre = project(0, 0.004);
      if (!Number.isFinite(centre.x) || !Number.isFinite(centre.y)) return;
      sweepAngle.current += dt * 2.4;
      const R = Math.max(34, Math.min(70, h * 0.11));
      ctx.save();
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, R, Math.PI, Math.PI * 2);
      ctx.strokeStyle = withAlpha(PAD_COLOR, 0.3);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, R * 0.58, Math.PI, Math.PI * 2);
      ctx.strokeStyle = withAlpha(PAD_COLOR, 0.18);
      ctx.stroke();

      const grad = ctx.createConicGradient
        ? ctx.createConicGradient(sweepAngle.current, centre.x, centre.y)
        : null;
      if (grad) {
        grad.addColorStop(0, withAlpha(PAD_COLOR, 0.28));
        grad.addColorStop(0.12, "rgba(57, 255, 139, 0)");
        grad.addColorStop(1, "rgba(57, 255, 139, 0)");
        ctx.beginPath();
        ctx.moveTo(centre.x, centre.y);
        ctx.arc(centre.x, centre.y, R, Math.PI, Math.PI * 2);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.moveTo(centre.x, centre.y);
      ctx.lineTo(
        centre.x + Math.cos(sweepAngle.current) * R,
        centre.y + Math.sin(sweepAngle.current) * R
      );
      ctx.strokeStyle = "rgba(120, 255, 180, 0.55)";
      ctx.stroke();
      ctx.restore();
    }

    function drawLander(project, f, flying, time) {
      if (!f || !Number.isFinite(f.x) || !Number.isFinite(f.y)) return;

      const centreY = Math.max(0, f.y) + FEET_DROP;

      const p = project(f.x, centreY);
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
      if (!Number.isFinite(p.scale) || p.scale <= 0) return;

      const u = p.scale * D;
      const lw = (px) => px / u;
      const shipAngle = Number.isFinite(f.angle) ? -f.angle : 0;
      const cos = Math.cos(shipAngle);
      const sin = Math.sin(shipAngle);

      const toWorld = (lx, ly) => ({
        x: lx * D * cos - ly * D * sin,
        y: -(lx * D * sin + ly * D * cos),
      });

      const mainT =
        flying && Number.isFinite(f.main_thrust)
          ? Math.max(0, Math.min(1, f.main_thrust))
          : 0;
      const sideT =
        flying && Number.isFinite(f.side_thrust)
          ? Math.max(-1, Math.min(1, f.side_thrust))
          : 0;

      if (mainT > 0.05) {
        const off = toWorld(0, NOZZLE_Y);
        const n = project(f.x + off.x, centreY + off.y);
        const emit = Math.round(2 + mainT * 7);
        for (let i = 0; i < emit; i++) {
          const spread = (Math.random() - 0.5) * 0.6;
          const speed = 55 + Math.random() * 90 * (0.5 + mainT);
          particles.current.push({
            x: n.x + spread * 4,
            y: n.y,
            vx: Math.sin(shipAngle + spread * 0.5) * speed * 0.35,
            vy: Math.cos(shipAngle + spread * 0.5) * speed,
            life: 1,
            max: 0.35 + Math.random() * 0.4,
            size: 2 + Math.random() * 3 * (0.6 + mainT),
            hue: Math.random(),
          });
        }
      }

      if (Math.abs(sideT) > 0.08) {
        const dir = Math.sign(sideT);
        const off = toWorld(-dir * RCS_X, RCS_Y);
        const sp = project(f.x + off.x, centreY + off.y);
        const emit = Math.round(2 + Math.abs(sideT) * 5);
        for (let i = 0; i < emit; i++) {
          const speed = 40 + Math.random() * 70;
          sideParticles.current.push({
            x: sp.x,
            y: sp.y + (Math.random() - 0.5) * 4,
            vx: -dir * cos * speed,
            vy: -dir * sin * speed + (Math.random() - 0.5) * 30,
            life: 1,
            max: 0.22 + Math.random() * 0.25,
            size: 1.6 + Math.random() * 2.2,
          });
        }
      }

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(shipAngle);
      ctx.scale(u, u);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      if (mainT > 0.05) {
        const flicker =
          0.86 + 0.14 * Math.sin(time * 47) + 0.07 * Math.sin(time * 91 + 1.3);
        const len = (0.05 + mainT * 0.19) * flicker;
        ctx.beginPath();
        ctx.moveTo(-0.03, NOZZLE_Y);
        ctx.lineTo(0.03, NOZZLE_Y);
        ctx.lineTo(0.014, NOZZLE_Y + len * 0.45);
        ctx.lineTo(0, NOZZLE_Y + len);
        ctx.lineTo(-0.014, NOZZLE_Y + len * 0.45);
        ctx.closePath();
        ctx.fillStyle = MAIN_THRUST_COLOR;
        ctx.shadowColor = MAIN_THRUST_COLOR;
        ctx.shadowBlur = 18;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(-0.016, NOZZLE_Y);
        ctx.lineTo(0.016, NOZZLE_Y);
        ctx.lineTo(0, NOZZLE_Y + len * 0.6);
        ctx.closePath();
        ctx.fillStyle = "rgba(255, 226, 150, 0.95)";
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      ctx.fillStyle = HULL_FILL;
      tracePath(ctx, HULL, true);
      ctx.fill();
      tracePath(ctx, CABIN, true);
      ctx.fill();

      ctx.strokeStyle = "rgba(0, 240, 255, 0.15)";
      ctx.lineWidth = lw(5);
      tracePath(ctx, HULL, true);
      ctx.stroke();
      tracePath(ctx, CABIN, true);
      ctx.stroke();

      ctx.strokeStyle = NEON;
      ctx.lineWidth = lw(1.7);
      ctx.shadowColor = NEON;
      ctx.shadowBlur = GLOW;
      tracePath(ctx, HULL, true);
      ctx.stroke();
      tracePath(ctx, CABIN, true);
      ctx.stroke();

      ctx.strokeStyle = NEON_WHITE;
      ctx.lineWidth = lw(1.2);
      ctx.beginPath();
      ctx.moveTo(-0.018, -0.08);
      ctx.lineTo(0.018, -0.08);
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.strokeStyle = withAlpha(NEON, 0.95);
      ctx.lineWidth = lw(1.3);
      ctx.shadowColor = NEON;
      ctx.shadowBlur = GLOW;
      tracePath(ctx, BELL, true);
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.strokeStyle = withAlpha(NEON, 0.5);
      ctx.lineWidth = lw(1);
      tracePath(ctx, BELL_RING);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-0.024, 0.05);
      ctx.lineTo(-0.027, 0.056);
      ctx.moveTo(0.024, 0.05);
      ctx.lineTo(0.027, 0.056);
      ctx.stroke();

      const legs = LEGS;
      for (const leg of legs) {
        ctx.strokeStyle = NEON;
        ctx.lineWidth = lw(1.8);
        ctx.shadowColor = NEON;
        ctx.shadowBlur = GLOW;
        tracePath(ctx, leg.main);
        ctx.stroke();

        ctx.strokeStyle = withAlpha(NEON, 0.62);
        ctx.lineWidth = lw(1.1);
        ctx.shadowBlur = 0;
        tracePath(ctx, leg.brace);
        ctx.stroke();

        ctx.strokeStyle = NEON_WHITE;
        ctx.lineWidth = lw(2.2);
        ctx.shadowColor = NEON;
        ctx.shadowBlur = GLOW;
        tracePath(ctx, leg.pad);
        ctx.stroke();
        for (const tick of leg.ticks) {
          tracePath(ctx, tick);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
        if (leg.ladder) {
          ctx.strokeStyle = withAlpha(NEON, 0.45);
          ctx.lineWidth = lw(1);
          tracePath(ctx, LADDER_RAIL);
          ctx.stroke();
          for (const rung of LADDER_RUNGS) {
            tracePath(ctx, rung);
            ctx.stroke();
          }
        }
      }

      ctx.strokeStyle = withAlpha(NEON, 0.85);
      ctx.lineWidth = lw(1.2);
      ctx.shadowColor = NEON;
      ctx.shadowBlur = 6;
      for (const quad of RCS_QUADS) {
        tracePath(ctx, quad, true);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;

      if (Math.abs(sideT) > 0.08) {
        const dir = Math.sign(sideT);
        const len = 0.022 + Math.abs(sideT) * 0.05;
        ctx.beginPath();
        ctx.moveTo(-dir * RCS_X, RCS_Y - 0.007);
        ctx.lineTo(-dir * (RCS_X + len), RCS_Y);
        ctx.lineTo(-dir * RCS_X, RCS_Y + 0.007);
        ctx.closePath();
        ctx.fillStyle = SIDE_THRUST_COLOR;
        ctx.shadowColor = SIDE_THRUST_COLOR;
        ctx.shadowBlur = 16;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      tracePath(ctx, WINDOW, true);
      ctx.fillStyle = NEON_WHITE;
      ctx.shadowColor = NEON;
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.strokeStyle = withAlpha(NEON, 0.45);
      ctx.lineWidth = lw(1);
      tracePath(ctx, HATCH, true);
      ctx.stroke();

      ctx.strokeStyle = withAlpha(NEON, 0.8);
      ctx.lineWidth = lw(1.1);
      tracePath(ctx, MAST);
      ctx.stroke();
      ctx.strokeStyle = withAlpha(NEON_WHITE, 0.8);
      ctx.beginPath();
      ctx.arc(DISH.x, DISH.y, DISH.r, Math.PI, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.fillStyle = withAlpha("#ff5566", 0.45 + 0.55 * Math.abs(Math.sin(time * 2.4)));
      ctx.shadowColor = "#ff3b52";
      ctx.shadowBlur = 8;
      ctx.arc(DISH.x, DISH.y + DISH.r * 0.2, 0.005, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.restore();
      ctx.shadowBlur = 0;
    }

    function updateParticles(list, dt, kind) {
      for (let i = list.length - 1; i >= 0; i--) {
        const pt = list[i];
        pt.life -= dt / pt.max;
        if (pt.life <= 0) {
          list.splice(i, 1);
          continue;
        }
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        if (kind === "main") {
          pt.vy += 30 * dt;
          pt.vx *= 0.98;
        } else {
          pt.vx *= 0.94;
          pt.vy *= 0.94;
        }
      }
      if (list.length > 700) list.splice(0, list.length - 700);
    }

    function drawParticles(list, kind) {
      for (const pt of list) {
        const a = Math.max(0, pt.life);
        let color;
        if (kind === "main") {
          if (pt.hue > 0.6) color = withAlpha("#fff0b4", a);
          else if (pt.hue > 0.25) color = withAlpha("#ffaa32", a * 0.9);
          else color = withAlpha(MAIN_THRUST_COLOR, a * 0.8);
        } else {
          color = withAlpha(SIDE_THRUST_COLOR, a * 0.9);
        }
        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.arc(pt.x, pt.y, pt.size * (0.4 + a * 0.8), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function spawnImpact(x, y, kind) {
      const crash = kind === "crash";
      const count = crash ? 28 : 10;
      for (let i = 0; i < count; i++) {
        const ang = -Math.PI * (0.06 + Math.random() * 0.88);
        const speed = (crash ? 90 : 40) + Math.random() * (crash ? 220 : 70);
        debris.current.push({
          x,
          y,
          vx: Math.cos(ang) * speed,
          vy: Math.sin(ang) * speed,
          life: 1,
          max: (crash ? 0.5 : 0.4) + Math.random() * 0.7,
          len: (crash ? 4 : 3) + Math.random() * 7,
          rot: Math.random() * Math.PI,
          spin: (Math.random() - 0.5) * 9,
          color: SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)],
        });
      }
      rings.current.push({
        x,
        y,
        r: 2,
        max: crash ? 78 : 46,
        life: 1,
        lifeMax: crash ? 0.55 : 0.7,
        color: crash ? "#ff823c" : PAD_COLOR,
      });
      if (crash) {
        rings.current.push({
          x,
          y,
          r: 2,
          max: 36,
          life: 1,
          lifeMax: 0.3,
          color: SIDE_THRUST_COLOR,
        });
      }
      if (debris.current.length > 320) {
        debris.current.splice(0, debris.current.length - 320);
      }
    }

    function updateDebris(dt, surfaceY) {
      for (let i = debris.current.length - 1; i >= 0; i--) {
        const d = debris.current[i];
        d.life -= dt / d.max;
        if (d.life <= 0) {
          debris.current.splice(i, 1);
          continue;
        }
        d.vy += 430 * dt;
        d.vx *= 0.985;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.rot += d.spin * dt;
        if (d.y > surfaceY) {
          d.y = surfaceY;
          d.vy *= -0.35;
          d.vx *= 0.6;
        }
      }
      for (let i = rings.current.length - 1; i >= 0; i--) {
        const r = rings.current[i];
        r.life -= dt / r.lifeMax;
        if (r.life <= 0) {
          rings.current.splice(i, 1);
          continue;
        }
        r.r += (r.max - r.r) * Math.min(1, dt * 6);
      }
    }

    function drawImpactFx() {
      if (!debris.current.length && !rings.current.length) return;
      ctx.save();
      ctx.lineCap = "round";
      for (const d of debris.current) {
        const a = Math.max(0, d.life);
        const halfLen = d.len * (0.4 + a * 0.6);
        const dx = Math.cos(d.rot) * halfLen;
        const dy = Math.sin(d.rot) * halfLen;
        ctx.strokeStyle = withAlpha(d.color, a);
        ctx.lineWidth = 1.5;
        ctx.shadowColor = d.color;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(d.x - dx, d.y - dy);
        ctx.lineTo(d.x + dx, d.y + dy);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      for (const r of rings.current) {
        const a = Math.max(0, r.life);
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r, Math.PI, Math.PI * 2);
        ctx.strokeStyle = withAlpha(r.color, a * 0.65);
        ctx.lineWidth = 1.6 * a + 0.6;
        ctx.shadowColor = withAlpha(r.color, 0.9);
        ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      ctx.restore();
      ctx.shadowBlur = 0;
    }

    function drawTrail(project, pts) {
      if (!pts || pts.length < 2) return;
      ctx.save();
      ctx.setLineDash([4, 6]);
      ctx.lineWidth = 1.6;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const pa = project(a.x, a.y);
        const pb = project(b.x, b.y);
        if (!Number.isFinite(pa.x) || !Number.isFinite(pb.x)) continue;
        const t = i / pts.length;
        ctx.strokeStyle = `rgba(47, 243, 255, ${0.05 + t * 0.5})`;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }
      ctx.restore();

      const head = pts[pts.length - 1];
      const hp = project(head.x, head.y);
      if (!Number.isFinite(hp.x) || !Number.isFinite(hp.y)) return;
      ctx.beginPath();
      ctx.fillStyle = "rgba(47, 243, 255, 0.9)";
      ctx.shadowColor = "rgba(47, 243, 255, 1)";
      ctx.shadowBlur = 12;
      ctx.arc(hp.x, hp.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    function drawHUD(f) {
      const alt = Math.max(0, f.y) * METERS_PER_UNIT;
      const vvel = (Number.isFinite(f.vy) ? f.vy : 0) * METERS_PER_UNIT;
      const hvel = (Number.isFinite(f.vx) ? f.vx : 0) * METERS_PER_UNIT;
      const sign = (v) => (v < 0 ? "-" : "+");

      const x = 14;
      const y = 26;
      const pw = 196;
      const ph = 78;

      ctx.save();
      ctx.fillStyle = "rgba(3, 16, 26, 0.55)";
      ctx.fillRect(x, y, pw, ph);
      ctx.strokeStyle = "rgba(0, 240, 255, 0.3)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, pw - 1, ph - 1);

      ctx.fillStyle = NEON;
      ctx.shadowColor = NEON;
      ctx.shadowBlur = GLOW;
      ctx.fillRect(x, y, 3, ph);
      ctx.shadowBlur = 0;

      ctx.textAlign = "left";
      ctx.font = "10px 'Share Tech Mono', monospace";
      ctx.fillStyle = "rgba(0, 240, 255, 0.5)";
      ctx.fillText("FLIGHT TELEMETRY", x + 14, y + 16);

      const rows = [
        ["ALT", `${alt.toFixed(0).padStart(3, "0")} m`, "rgba(0, 240, 255, 0.98)"],
        [
          "V-VEL",
          `${sign(vvel)}${Math.abs(vvel).toFixed(1).padStart(4, "0")} m/s`,
          "rgba(57, 255, 139, 0.98)",
        ],
        [
          "H-VEL",
          `${sign(hvel)}${Math.abs(hvel).toFixed(1).padStart(4, "0")} m/s`,
          "rgba(255, 155, 33, 0.98)",
        ],
      ];
      ctx.font = "12px 'Share Tech Mono', monospace";
      rows.forEach(([label, value, color], i) => {
        const ry = y + 36 + i * 15;
        ctx.fillStyle = "rgba(111, 156, 184, 0.85)";
        ctx.fillText(label, x + 14, ry);
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 6;
        ctx.textAlign = "right";
        ctx.fillText(value, x + pw - 12, ry);
        ctx.textAlign = "left";
        ctx.shadowBlur = 0;
      });
      ctx.restore();
      ctx.shadowBlur = 0;
    }

    let last = performance.now();

    function draw(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const time = now / 1000;

      const liveSample = latest.current.sample?.current;
      let f = liveSample?.frame ?? latest.current.frame;
      let tr = liveSample?.trail ?? latest.current.trail;

      resizeIfNeeded();
      if (w < 2 || h < 2) {
        raf = requestAnimationFrame(draw);
        return;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.shadowBlur = 0;
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";
      ctx.clearRect(0, 0, w, h);

      if (!f) {
        f = {
          x: 0,
          y: 1.35,
          vx: 0,
          vy: 0,
          angle: 0,
          angular_velocity: 0,
          left_leg: 0,
          right_leg: 0,
          main_thrust: 0,
          side_thrust: 0,
          reward: 0,
        };
        tr = [];
      }

      const st = latest.current.status;
      const flying = st === "playing";

      const camWorldX = Number.isFinite(f.x) ? f.x * 0.25 : 0;
      const groundScreenY = h * GROUND_FRAC;
      const scale = h / WORLD_H;
      const originX = w / 2 - camWorldX * scale;
      const originY = groundScreenY;

      function project(wx, wy) {
        return {
          x: originX + wx * scale,
          y: originY - wy * scale,
          scale,
        };
      }
      const viewX0 = (0 - originX) / scale;
      const viewX1 = (w - originX) / scale;

      if (st !== prevStatus.current) {
        const contact =
          Number.isFinite(f.x) && Number.isFinite(f.y)
            ? project(f.x, Math.max(0, f.y))
            : null;
        if (contact && Number.isFinite(contact.x) && Number.isFinite(contact.y)) {
          if (st === "crashed") spawnImpact(contact.x, contact.y, "crash");
          else if (st === "landed") spawnImpact(contact.x, contact.y, "land");
        }
        if (st === "idle" || st === "calculating" || st === "playing") {
          debris.current.length = 0;
          rings.current.length = 0;
          particles.current.length = 0;
          sideParticles.current.length = 0;
        }
        prevStatus.current = st;
      }

      if (Number.isFinite(groundScreenY)) {
        const horizonGlow = ctx.createLinearGradient(
          0,
          groundScreenY - 130,
          0,
          groundScreenY
        );
        horizonGlow.addColorStop(0, "rgba(47, 243, 255, 0)");
        horizonGlow.addColorStop(1, "rgba(47, 243, 255, 0.08)");
        ctx.fillStyle = horizonGlow;
        ctx.fillRect(0, groundScreenY - 130, w, 130);
      }

      drawStars(dt);
      drawAltitudeGuides(project, groundScreenY);
      drawTerrain(project, viewX0, viewX1, groundScreenY);
      drawPad(project, time);
      drawRadar(project, dt);

      updateParticles(particles.current, dt, "main");
      updateParticles(sideParticles.current, dt, "side");
      drawParticles(particles.current, "main");
      drawParticles(sideParticles.current, "side");

      updateDebris(dt, groundScreenY);
      drawImpactFx();

      drawTrail(project, tr);
      drawLander(project, f, flying, time);
      drawHUD(f);

      const settled =
        (st === "landed" ||
          st === "crashed" ||
          st === "completed" ||
          st === "timeout") &&
        particles.current.length === 0 &&
        sideParticles.current.length === 0 &&
        debris.current.length === 0 &&
        rings.current.length === 0;

      const IDLE_FRAME_MS = 1000 / 12;
      if (settled) {
        idleTimer = setTimeout(() => {
          idleTimer = 0;
          raf = requestAnimationFrame(draw);
        }, IDLE_FRAME_MS);
      } else {
        raf = requestAnimationFrame(draw);
      }
    }

    function resizeIfNeeded() {
      if (canvas.clientWidth !== w || canvas.clientHeight !== h) resize();
    }

    resize();
    raf = requestAnimationFrame(draw);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      raf = 0;
      clearTimeout(idleTimer);
      idleTimer = 0;
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="sim-canvas" />;
}
