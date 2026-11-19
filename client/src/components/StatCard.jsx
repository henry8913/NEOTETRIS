import { ScoreValue } from './Fx.jsx';

/** One top-bar card: label above value, same box for every stat. */
export default function StatCard({ label, value, live = false, animated = false }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      {animated ? (
        <ScoreValue className="stat-value" value={value} live={live} />
      ) : (
        <span
          className="stat-value"
          aria-live={live ? 'polite' : undefined}
          aria-atomic={live ? 'true' : undefined}
        >
          {value}
        </span>
      )}
    </div>
  );
}
