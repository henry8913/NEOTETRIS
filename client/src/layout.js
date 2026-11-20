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
 * The `min-width: 640px` on the landscape clause is not cosmetic: it is what
 * keeps a *portrait* phone from ever matching it. When the on-screen keyboard
 * opens on iOS, the layout viewport shrinks to the space above the keyboard
 * (390×844 → ~375×370: the height drops below the width, so the `orientation`
 * feature itself flips to landscape) and the rule matched a phone held
 * upright: the app swapped the compact composition for the wide one
 * mid-overlay, the CONTROLS / CORE·LEVEL·LINES·HOLD·NEXT rails appeared on
 * both sides, the game-over card was squeezed to ~400px and its text clipped
 * ("CORE 10…", "EVEL .INES"). A phone in landscape is always at least 640px
 * wide, a keyboard-shrunk portrait viewport is 375–430px, so the two can no
 * longer be confused.
 *
 * Keep in sync with every `@media` block in App.css that mirrors this query
 * (grep for `max-height: 560px`).
 */
export const WIDE_LAYOUT_QUERY =
  '(min-width: 900px), (orientation: landscape) and (max-height: 560px) and (min-width: 640px)';

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
