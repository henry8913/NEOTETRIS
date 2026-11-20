import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchHealth, fetchScores } from '../api.js';
import { formatDate, mergeScores } from '../leaderboard.js';
import {
  invalidateScoreCache,
  readScoreCache,
  writeScoreCache,
} from '../scoreCache.js';
import { loadLocalScores } from '../storage.js';

/**
 * TOP RUNNERS — the leaderboard modal.
 *
 * Source of truth: the server. When the API answers, the board is *exactly*
 * that list — no local rows are merged in, so two devices always see the same
 * ranking and "beat someone else's record" means what it says. The local runs
 * (same device) are shown only in the offline/error branch, under the `LOCAL`
 * badge, with a notice that says so. Successful responses are cached in memory
 * for 30s (`scoreCache.js`); REFRESH and RETRY bypass the cache.
 *
 * Accessibility: `dialog` + `aria-modal`, initial focus on CLOSE, Tab cycles
 * inside the card, Esc and a backdrop click close it, and focus returns to
 * whatever opened it.
 */

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <path
        d="M6 6l12 12M18 6L6 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Skeleton() {
  return (
    <li className="lb-row lb-row--skeleton" aria-hidden="true">
      <span className="lb-rank lb-sk" />
      <span className="lb-name lb-sk" />
      <span className="lb-meta lb-sk lb-sk--short" />
      <span className="lb-score lb-sk" />
    </li>
  );
}

function describeFailure(error) {
  if (error?.status === 429) return 'Rate limit reached';
  if (error?.status) return `Server answered ${error.status}`;
  return 'Server unreachable';
}

export default function Leaderboard({ open = false, onClose, highlightId = null }) {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [source, setSource] = useState('server');
  const [offline, setOffline] = useState(false);
  const [message, setMessage] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const modalRef = useRef(null);
  const closeRef = useRef(null);
  const restoreRef = useRef(null);

  const refresh = useCallback(() => {
    invalidateScoreCache();
    setReloadKey((key) => key + 1);
  }, []);

  // Fetch on open / on refresh. Everything runs after a microtask so the
  // effect body itself never calls setState (react-hooks v7).
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;

    const load = async () => {
      await Promise.resolve();
      if (!alive) return;

      const cached = readScoreCache();
      if (cached) {
        setRows(cached);
        setSource('server');
        setOffline(false);
        setMessage('');
        setStatus('ready');
        return;
      }

      setStatus('loading');
      setOffline(false);
      setMessage('');

      try {
        const remote = await fetchScores(10);
        if (!alive) return;
        // The server board is the global one: cache and render it as it is.
        // Merging `loadLocalScores()` here used to leak this device's offline
        // runs into everybody's ranking (and kept the SERVER badge on them).
        writeScoreCache(remote);
        setRows(remote);
        setSource('server');
        setStatus('ready');
      } catch (error) {
        if (!alive) return;
        const health = await fetchHealth();
        if (!alive) return;

        const local = mergeScores([], loadLocalScores(), 10);
        setRows(local);
        setSource('local');
        setOffline(true);
        setMessage(health.ok ? describeFailure(error) : 'Server offline');
        setStatus(local.length > 0 ? 'ready' : 'error');
      }
    };

    load();
    return () => {
      alive = false;
    };
  }, [open, reloadKey]);

  // Focus: move into the dialog on open, trap Tab, restore on close.
  useEffect(() => {
    if (!open) return undefined;

    restoreRef.current = document.activeElement;
    closeRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose?.();
        return;
      }
      if (event.key !== 'Tab') return;

      const root = modalRef.current;
      if (!root) return;
      const nodes = Array.from(root.querySelectorAll(FOCUSABLE));
      if (nodes.length === 0) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      const inside = root.contains(active);

      if (event.shiftKey) {
        if (!inside || active === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (!inside || active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const target = restoreRef.current;
      restoreRef.current = null;
      if (target && typeof target.focus === 'function') target.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const loading = status === 'loading';
  const empty = status === 'ready' && rows.length === 0;

  return (
    <div
      className="lb-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        className="lb-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lb-title"
        ref={modalRef}
      >
        <header className="lb-head">
          <h2 className="lb-title" id="lb-title">Top Runners</h2>
          <span className={`lb-source${source === 'local' ? ' is-local' : ''}`}>
            {source === 'local' ? 'Local' : 'Server'}
          </span>
          <button
            type="button"
            className="lb-close"
            aria-label="Close rankings"
            onClick={() => onClose?.()}
            ref={closeRef}
          >
            <CloseIcon />
          </button>
        </header>

        {offline && !loading && (
          <p className="lb-notice" role="status">
            <span className="lb-notice__dot" aria-hidden="true" />
            {message || 'Server offline'} · local runs
            <button type="button" className="lb-link" onClick={refresh}>Retry</button>
          </p>
        )}

        <div className="lb-body" aria-busy={loading}>
          {loading && (
            <ol className="lb-list" aria-hidden="true">
              <Skeleton />
              <Skeleton />
              <Skeleton />
            </ol>
          )}

          {status === 'error' && (
            <div className="lb-state">
              <p className="lb-state__title">Leaderboard unavailable</p>
              <p className="lb-state__text">{message || 'No connection to the server.'}</p>
              <button type="button" className="lb-btn" onClick={refresh}>Retry</button>
            </div>
          )}

          {empty && (
            <div className="lb-state">
              <p className="lb-state__title">No runs yet</p>
              <p className="lb-state__text">Be the first name on the board.</p>
            </div>
          )}

          {!loading && rows.length > 0 && (
            <ol className="lb-list">
              {rows.map((row, index) => (
                <li
                  key={row.id || `${row.name}-${row.score}-${index}`}
                  className={`lb-row${index < 3 ? ` is-rank-${index + 1}` : ''}${
                    highlightId && row.id === highlightId ? ' is-highlight' : ''
                  }`}
                >
                  <span className="lb-rank">{index + 1}</span>
                  <span className="lb-name" title={row.name}>{row.name}</span>
                  <span className="lb-score">{row.score.toLocaleString('en-US')}</span>
                  <span className="lb-meta">
                    <span>LV {row.level}</span>
                    <span>{row.lines} L</span>
                    <span>{formatDate(row.date)}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <footer className="lb-foot">
          <span className="lb-foot__note">Top 10 · {offline ? 'local' : 'global'}</span>
          <button type="button" className="lb-btn" onClick={refresh} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </footer>
      </div>
    </div>
  );
}
