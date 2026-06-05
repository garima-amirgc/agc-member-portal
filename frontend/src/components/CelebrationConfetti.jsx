import { useMemo } from "react";

const COLORS = ["#0B3EAF", "#A7D344", "#E02B20", "#FFB900", "#ff6b9d", "#4ecdc4", "#fff"];

/** Lightweight CSS confetti — no external GIF required. */
export default function CelebrationConfetti({ active = true, density = 48 }) {
  const pieces = useMemo(() => {
    return Array.from({ length: density }, (_, i) => ({
      id: i,
      left: `${(i * 17 + 7) % 100}%`,
      delay: `${(i % 12) * 0.18}s`,
      duration: `${2.8 + (i % 5) * 0.35}s`,
      color: COLORS[i % COLORS.length],
      size: 6 + (i % 4) * 2,
      rotate: (i * 47) % 360,
      drift: i % 2 === 0 ? -28 : 28,
    }));
  }, [density]);

  if (!active) return null;

  return (
    <div className="celebration-confetti pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="celebration-confetti-piece absolute top-0 block rounded-sm opacity-90"
          style={{
            left: p.left,
            width: p.size,
            height: p.size * 1.4,
            backgroundColor: p.color,
            animationDelay: p.delay,
            animationDuration: p.duration,
            transform: `rotate(${p.rotate}deg)`,
            ["--drift"]: `${p.drift}px`,
          }}
        />
      ))}
    </div>
  );
}
