import { useEffect, useRef } from "react";

export default function MissionLog({ lines }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <div className="section">
      <div className="section-label">
        <span>MISSION LOG</span>
        <span className="mono-dim" style={{ letterSpacing: "1px" }}>
          TTY0
        </span>
      </div>
      <div className="log-scroll" ref={scrollRef}>
        {lines.map((l, i) => (
          <div key={i} className={`log-line ${l.level || ""}`}>
            <span className="ts">
              [{String(l.t).padStart(6, "0")}]
            </span>
            {l.text}
          </div>
        ))}
        <div className="log-line">
          <span className="cursor-blink" />
        </div>
      </div>
    </div>
  );
}
