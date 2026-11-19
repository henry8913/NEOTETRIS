const NEON_COLORS = [
  'var(--neon-cyan)',
  'var(--neon-magenta)',
  'var(--neon-green)',
  'var(--neon-yellow)',
  'var(--neon-purple)',
];

/*
 * Decorative background only (pointer-events: none, z-index 0). The budget is
 * kept at ~20 nodes so the animations stay cheap on mobile.
 */
const PARTICLES = Array.from({ length: 16 }, (_, i) => ({
  id: i,
  x: `${Math.random() * 100}%`,
  delay: `${Math.random() * 12}s`,
  duration: `${10 + Math.random() * 14}s`,
  size: `${2 + Math.random() * 2.5}px`,
  color: NEON_COLORS[Math.floor(Math.random() * NEON_COLORS.length)],
  drift: `${-30 + Math.random() * 60}px`,
}));

const STREAMS = [1, 3.5, 96.5, 99].map((left, i) => ({
  id: i,
  left: `${left}%`,
  delay: `${i * 2.5}s`,
  duration: `${2.5 + Math.random() * 2}s`,
}));

export function BackgroundParticles() {
  return (
    <div className="bg-particles" aria-hidden="true">
      {PARTICLES.map((p) => (
        <span
          key={p.id}
          className="particle"
          style={{
            '--x': p.x,
            '--delay': p.delay,
            '--duration': p.duration,
            '--size': p.size,
            '--color': p.color,
            '--drift': p.drift,
          }}
        />
      ))}
    </div>
  );
}

export function DataStreams() {
  return (
    <div className="data-streams" aria-hidden="true">
      {STREAMS.map((s) => (
        <div
          key={s.id}
          className="data-stream"
          style={{
            '--left': s.left,
            '--delay': s.delay,
            '--duration': s.duration,
          }}
        />
      ))}
    </div>
  );
}

export default function Background() {
  return (
    <>
      <DataStreams />
      <BackgroundParticles />
    </>
  );
}
