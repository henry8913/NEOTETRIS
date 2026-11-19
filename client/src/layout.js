import { useCallback, useSyncExternalStore } from 'react';

/**
 * The one layout breakpoint, shared by JSX and CSS so the two can never
 * disagree:
 *
 * - three columns (control rail · board · hold/next rail) on desktop and on
 *   landscape phones, where the height is the binding constraint;
 * - one compact strip (score/hold/next/mute · board · thumb pad) everywhere
 *   else.
 *
 * Keep in sync with the `@media` blocks at the bottom of App.css.
 */
export const WIDE_LAYOUT_QUERY =
  '(min-width: 900px), (orientation: landscape) and (max-height: 560px)';

/** Reactive `window.matchMedia`, safe during the first (client) render. */
export function useMediaQuery(query) {
  const subscribe = useCallback((onChange) => {
    if (typeof window === 'undefined' || !window.matchMedia) return () => {};
    const mql = window.matchMedia(query);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  }, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** True when the rail + board + rail composition is the right one. */
export function useWideLayout() {
  return useMediaQuery(WIDE_LAYOUT_QUERY);
}
