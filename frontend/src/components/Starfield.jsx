import { useEffect, useRef } from "react";

export default function Starfield() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf = 0;
    let w = 0;
    let h = 0;

    let dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let stars = [];

    function resize() {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildStars();
    }

    function buildStars() {
      const count = Math.floor((w * h) / 8000);
      stars = new Array(count).fill(0).map(() => {
        const layer = Math.random();
        const hue = Math.random();

        const rgb =
          hue > 0.9
            ? "255, 200, 120"
            : hue > 0.78
            ? "120, 235, 255"
            : "220, 240, 255";
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          r: layer * 1.6 + 0.3,
          speed: layer * 0.55 + 0.06,
          tw: Math.random() * Math.PI * 2,
          twSpeed: 0.01 + Math.random() * 0.04,
          rgb,
          glow: `rgba(${rgb}, 0.12)`,
        };
      });
    }

    let gridOffset = 0;

    function draw() {
      ctx.clearRect(0, 0, w, h);

      ctx.save();
      ctx.strokeStyle = "rgba(47, 243, 255, 0.045)";
      ctx.lineWidth = 1;
      const step = 46;
      gridOffset = (gridOffset + 0.35) % step;
      ctx.beginPath();
      for (let y = -step + gridOffset; y < h + step; y += step) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      for (let x = 0; x < w + step; x += step) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      ctx.stroke();
      ctx.restore();

      for (const s of stars) {
        s.y += s.speed;
        s.tw += s.twSpeed;
        if (s.y - s.r > h) {
          s.y = -s.r;
          s.x = Math.random() * w;
        }
        const twinkle = 0.55 + Math.sin(s.tw) * 0.45;

        ctx.beginPath();
        ctx.fillStyle = `rgba(${s.rgb}, ${twinkle})`;
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();

        if (s.r > 1.35) {
          ctx.beginPath();
          ctx.fillStyle = s.glow;
          ctx.arc(s.x, s.y, s.r * 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    const FRAME_MS = 1000 / 30;
    let lastDraw = 0;

    function loop(now) {
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      const elapsed = now - lastDraw;
      if (elapsed < FRAME_MS) return;
      lastDraw = now - (elapsed % FRAME_MS);
      draw();
    }

    resize();
    raf = requestAnimationFrame(loop);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      raf = 0;
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} className="starfield-canvas" />;
}
