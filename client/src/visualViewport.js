import { useEffect } from 'react';

/**
 * On-screen keyboard geometry.
 *
 * iOS (and Chrome on Android, once the app is not resized) does not change the
 * layout viewport when the keyboard opens: it shrinks the *visual* viewport and
 * pushes it down by `offsetTop`. The difference between the two is the part of
 * the page the keyboard is covering, and that is the only number the overlays
 * need to stay usable — the card is capped at the visible height and gets the
 * same inset as bottom padding, so the save form can scroll clear of the
 * keyboard instead of hiding under it.
 *
 * Written as a CSS custom property on <html> (`--kb-inset`), the same pattern
 * as `--level`: no React state, no render per resize event.
 */
export const KB_INSET_VAR = '--kb-inset';

/**
 * Boolean attribute set on <html> while the on-screen keyboard is actually
 * covering the page. CSS cannot compare a length to a threshold, so the hook
 * publishes the decision: `data-keyboard="on"` only exists above
 * `KB_ATTR_MIN_INSET` pixels, which is what switches the overlay cards to their
 * fixed, full-width sheet layout (a 20px toolbar is not worth rearranging the
 * screen for, a 300px keyboard is).
 */
export const KB_ATTR = 'data-keyboard';

/** Below this inset the attribute stays off (~one toolbar row). */
export const KB_ATTR_MIN_INSET = 60;

/**
 * Pixels of the layout viewport hidden behind the on-screen keyboard (0 when
 * there is none, or when the browser has no `visualViewport` at all).
 *
 * Pure and injectable (`view` is a window-like object) so the arithmetic can be
 * asserted without a browser.
 */
export function keyboardInset(view = typeof window === 'undefined' ? null : window) {
  const vv = view ? view.visualViewport : null;
  if (!vv) return 0;
  const layout = Number.isFinite(view.innerHeight) ? view.innerHeight : 0;
  const visible = Number.isFinite(vv.height) ? vv.height : layout;
  const offset = Number.isFinite(vv.offsetTop) ? vv.offsetTop : 0;
  // Rounded: sub-pixel drift during the keyboard animation would otherwise
  // rewrite the property on every frame for nothing.
  return Math.max(0, Math.round(layout - visible - offset));
}

/**
 * Scroll `el` into view inside its scrolling ancestor (the overlay card), never
 * the page: `block: 'nearest'` is a no-op when the element is already visible.
 */
export function revealInView(el) {
  if (!el || typeof el.scrollIntoView !== 'function') return;
  el.scrollIntoView({ block: 'nearest' });
}

/**
 * Keep `--kb-inset` up to date with the visual viewport. One mounted instance
 * is enough for the whole app (App.jsx). Events are coalesced into a single
 * `requestAnimationFrame` and the property is only rewritten when the value
 * actually changed; the listener set is removed on unmount.
 *
 * When the inset appears/grows the focused field is scrolled back into view,
 * because the card just got shorter underneath it.
 */
export function useKeyboardInset() {
  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;
    let frame = 0;
    let last = -1;

    const apply = () => {
      frame = 0;
      const inset = keyboardInset(window);
      if (inset === last) return;
      last = inset;
      root.style.setProperty(KB_INSET_VAR, `${inset}px`);
      // The boolean half of the contract: CSS cannot threshold a length, so the
      // hook decides when the keyboard is worth a layout switch (the overlays
      // escape the board frame only from here). Written together with the
      // property, so a remount or a missed frame can never leave them out of
      // sync.
      if (inset > KB_ATTR_MIN_INSET) root.setAttribute(KB_ATTR, 'on');
      else root.removeAttribute(KB_ATTR);
      if (inset <= 0) return;
      const active = document.activeElement;
      if (
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.isContentEditable === true)
      ) {
        revealInView(active);
      }
    };

    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(apply);
    };

    // No visualViewport (old browser, desktop): the property stays at 0, the
    // attribute stays off and the overlays behave exactly as before.
    if (!vv) {
      apply();
      return () => {
        root.style.removeProperty(KB_INSET_VAR);
        root.removeAttribute(KB_ATTR);
      };
    }

    apply();
    vv.addEventListener('resize', schedule);
    vv.addEventListener('scroll', schedule);
    // A rotation changes both viewports; `resize` fires late enough on iOS that
    // the reset is worth requesting explicitly.
    window.addEventListener('orientationchange', schedule);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      vv.removeEventListener('resize', schedule);
      vv.removeEventListener('scroll', schedule);
      window.removeEventListener('orientationchange', schedule);
      root.style.removeProperty(KB_INSET_VAR);
      root.removeAttribute(KB_ATTR);
    };
  }, []);
}
