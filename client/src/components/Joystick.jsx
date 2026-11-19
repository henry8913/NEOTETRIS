import { useCallback, useEffect, useRef, useState } from 'react';
import { initAudio } from '../sound.js';
import { haptic, repeatPress } from '../input.js';
import {
  DAS_MS,
  DEAD_ZONE,
  TAP_MS,
  intentAction,
  isTap,
  repeatInterval,
  stickIntent,
} from '../joystick.js';

/** Clamp inside [min, max]; a zone narrower than the base stays centred. */
function clampPoint(value, min, max) {
  if (max <= min) return (min + max) / 2;
  return Math.min(max, Math.max(min, value));
}

/**
 * Floating thumb stick for the compact layout.
 *
 * The base is centred in its zone at rest and jumps under the finger on
 * pointerdown (Starfire behaviour), clamped inside the zone; the knob follows
 * the finger, clamped to the ring. Horizontal drags auto-repeat (DAS), a
 * downward drag soft drops, a short upward flick rotates once, and a quick tap
 * anywhere in the zone also rotates — one-thumb Tetris.
 *
 * Multi-touch: the gesture owns exactly one `pointerId`. A second finger may
 * tap DROP / HOLD while the stick is being dragged; its `pointerdown`,
 * `pointermove` and `pointerup` are ignored here, so it can neither hijack the
 * base nor end the gesture when it lifts.
 *
 * Capture: `setPointerCapture` keeps the drag alive past the zone edge, and a
 * window-level `pointermove` listener is the fallback when capture is refused
 * (embedded webviews). A cancelled pointer, a lost capture or a window blur
 * resets the visuals and clears both timers.
 *
 * Pure math lives in `joystick.js`; this file only measures pixels, owns the
 * pointer capture and the two timers (both cleared on release and unmount).
 */
export default function Joystick({ dispatch, locked = false }) {
  const zoneRef = useRef(null);
  const baseRef = useRef(null);
  const knobRef = useRef(null);
  const gesture = useRef(null);
  const dasTimer = useRef(0);
  const repeatTimer = useRef(0);
  const windowHandlers = useRef(null);
  const lockedRef = useRef(locked);
  const [active, setActive] = useState(false);

  // The timers read this ref, so a mid-gesture pause silences the stick
  // without restarting the gesture (no state, no re-render per tick).
  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);

  useEffect(
    () => () => {
      if (dasTimer.current) clearTimeout(dasTimer.current);
      if (repeatTimer.current) clearInterval(repeatTimer.current);
      dasTimer.current = 0;
      repeatTimer.current = 0;
    },
    []
  );

  const stopRepeat = useCallback(() => {
    if (dasTimer.current) {
      clearTimeout(dasTimer.current);
      dasTimer.current = 0;
    }
    if (repeatTimer.current) {
      clearInterval(repeatTimer.current);
      repeatTimer.current = 0;
    }
  }, []);

  const fire = useCallback(
    (action, sound) => {
      if (!action || lockedRef.current) return;
      if (sound === 'rotate') haptic(8);
      repeatPress(dispatch, action, sound);
    },
    [dispatch]
  );

  const resetVisuals = useCallback(() => {
    const base = baseRef.current;
    const knob = knobRef.current;
    if (base) {
      base.style.left = '';
      base.style.top = '';
    }
    if (knob) knob.style.transform = '';
  }, []);

  /** True when the event target is inside the stick: the element handler ran. */
  const insideZone = useCallback(
    (target) =>
      Boolean(zoneRef.current && target instanceof Node && zoneRef.current.contains(target)),
    []
  );

  /** Detach the per-gesture window listeners (release, cancel, blur, unmount). */
  const detachWindowListeners = useCallback(() => {
    const handlers = windowHandlers.current;
    if (!handlers) return;
    window.removeEventListener('pointermove', handlers.move);
    window.removeEventListener('pointerup', handlers.up);
    window.removeEventListener('pointercancel', handlers.cancel);
    window.removeEventListener('blur', handlers.blur);
    windowHandlers.current = null;
  }, []);

  /**
   * Turns a resolved intent into actions. Only direction *changes* fire, so a
   * held stick produces exactly one immediate move plus its repeat cadence.
   */
  const applyIntent = useCallback(
    (intent) => {
      const g = gesture.current;
      if (!g) return;

      const signature = `${intent.x}:${intent.y}`;
      if (signature === g.signature) return;
      g.signature = signature;

      if (intent.y < 0) {
        // Rotate once per gesture; re-armed only when the stick recentres.
        stopRepeat();
        if (!g.rotated) {
          g.rotated = true;
          fire(intentAction(intent), 'rotate');
        }
        return;
      }

      if (intent.y === 0 && intent.x === 0) {
        g.rotated = false;
        stopRepeat();
        return;
      }

      // Horizontal move or soft drop: fire now, then after DAS, then every tick.
      const action = intentAction(intent);
      const interval = repeatInterval(intent);
      stopRepeat();
      fire(action, 'move');
      dasTimer.current = window.setTimeout(() => {
        if (!gesture.current) return;
        fire(action, 'move');
        repeatTimer.current = window.setInterval(() => fire(action, 'move'), interval);
      }, DAS_MS);
    },
    [fire, stopRepeat]
  );

  /** Follows the finger: clamped knob travel, then one resolved intent. */
  const track = useCallback(
    (clientX, clientY) => {
      const g = gesture.current;
      const knob = knobRef.current;
      if (!g || !knob) return;

      // The knob sits under the finger (even when the ring had to be clamped
      // inside the zone) and then follows its travel, clamped to the ring.
      let dx = g.restX + (clientX - g.startX);
      let dy = g.restY + (clientY - g.startY);
      const distance = Math.hypot(dx, dy);
      if (distance > g.maxR) {
        dx = (dx / distance) * g.maxR;
        dy = (dy / distance) * g.maxR;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;

      // Intent is the *drag* (relative to the touch point), so pressing near an
      // edge never counts as a direction and a tap stays neutral.
      applyIntent(
        stickIntent((clientX - g.startX) / g.maxR, (clientY - g.startY) / g.maxR)
      );
    },
    [applyIntent]
  );

  const endGesture = useCallback(
    (e, allowTap) => {
      const g = gesture.current;
      if (!g) return;
      // Another finger's release never ends this gesture (two-finger play).
      if (e && e.pointerId !== undefined && e.pointerId !== g.pointerId) return;

      gesture.current = null;
      stopRepeat();
      detachWindowListeners();
      setActive(false);
      resetVisuals();

      const zone = zoneRef.current;
      if (zone) {
        try {
          if (zone.hasPointerCapture?.(g.pointerId)) zone.releasePointerCapture(g.pointerId);
        } catch {
          /* the pointer may already be gone */
        }
      }

      if (!allowTap || !e) return;
      const end = { x: e.clientX, y: e.clientY, t: e.timeStamp };
      if (!g.rotated && isTap(g.start, end, { tapMs: TAP_MS, maxDistance: g.tapSlop })) {
        fire(intentAction({ x: 0, y: -1 }), 'rotate');
      }
    },
    [detachWindowListeners, fire, resetVisuals, stopRepeat]
  );

  /** `pointermove` from the element (captured) or from the window (fallback). */
  const onMove = useCallback(
    (e) => {
      const g = gesture.current;
      if (!g || e.pointerId !== g.pointerId) return;
      // A mouse released outside the window never sends pointerup.
      if (e.pointerType === 'mouse' && e.buttons === 0) {
        endGesture(e, false);
        return;
      }
      track(e.clientX, e.clientY);
    },
    [endGesture, track]
  );

  /*
   * Window-level fallback, attached only while a gesture is live. It is the
   * only thing that keeps the piece following the finger when
   * `setPointerCapture` is refused (embedded webviews throw `NotFoundError`),
   * because then the moves are dispatched on whatever is under the thumb.
   *
   * Under capture the browser retargets every `pointermove` to the zone, which
   * the element handler already processed: skipping targets inside the zone
   * prevents a double move for the same event.
   */
  const attachWindowListeners = useCallback(() => {
    if (windowHandlers.current) return;
    const handlers = {
      move: (e) => {
        if (insideZone(e.target)) return;
        onMove(e);
      },
      up: (e) => {
        if (insideZone(e.target)) return;
        endGesture(e, false);
      },
      cancel: (e) => {
        if (insideZone(e.target)) return;
        endGesture(e, false);
      },
      // No pointer id on blur: the browser will send no pointerup afterwards.
      blur: () => endGesture(null, false),
    };
    window.addEventListener('pointermove', handlers.move, { passive: true });
    window.addEventListener('pointerup', handlers.up, { passive: true });
    window.addEventListener('pointercancel', handlers.cancel, { passive: true });
    window.addEventListener('blur', handlers.blur);
    windowHandlers.current = handlers;
  }, [endGesture, insideZone, onMove]);

  // Unmount (or a run ending mid-drag): never leave a listener or timer behind.
  useEffect(() => () => detachWindowListeners(), [detachWindowListeners]);

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    // Second finger inside the zone: ignored outright, before any measurement,
    // so the base never jumps and the first gesture keeps its capture.
    if (gesture.current) {
      e.preventDefault();
      return;
    }
    if (lockedRef.current) return;

    const zone = zoneRef.current;
    const base = baseRef.current;
    if (!zone || !base) return;

    e.preventDefault();
    initAudio();

    const rect = zone.getBoundingClientRect();
    const radius = (base.offsetWidth || 96) / 2;
    // The base jumps under the finger, but never hangs off the zone.
    const left = clampPoint(e.clientX - rect.left, radius, rect.width - radius);
    const top = clampPoint(e.clientY - rect.top, radius, rect.height - radius);
    base.style.left = `${left}px`;
    base.style.top = `${top}px`;

    const knobRadius = (knobRef.current?.offsetWidth || 44) / 2;
    const maxR = Math.max(radius * 0.4, radius - knobRadius);
    const baseX = rect.left + left;
    const baseY = rect.top + top;

    // Where the knob has to sit to be under the finger (capped at the ring).
    let restX = e.clientX - baseX;
    let restY = e.clientY - baseY;
    const restDistance = Math.hypot(restX, restY);
    if (restDistance > maxR) {
      restX = (restX / restDistance) * maxR;
      restY = (restY / restDistance) * maxR;
    }

    gesture.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      restX,
      restY,
      maxR,
      tapSlop: DEAD_ZONE * maxR,
      signature: '',
      rotated: false,
      start: { x: e.clientX, y: e.clientY, t: e.timeStamp },
    };

    setActive(true);
    // Window listeners first: they are the only path when capture is refused.
    attachWindowListeners();
    // Primary path: capture keeps the drag alive outside the zone too.
    try {
      zone.setPointerCapture(e.pointerId);
    } catch {
      /* pointer capture is best effort (some embedded webviews) */
    }
    track(e.clientX, e.clientY);
  }

  return (
    <div
      ref={zoneRef}
      className={`joy-zone${active ? ' is-active' : ''}${locked ? ' is-locked' : ''}`}
      role="group"
      aria-label="Movement pad"
      onPointerDown={onPointerDown}
      onPointerMove={onMove}
      onPointerUp={(e) => endGesture(e, true)}
      onPointerCancel={(e) => endGesture(e, false)}
      onLostPointerCapture={(e) => endGesture(e, false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div ref={baseRef} className="joy-base" aria-hidden="true">
        <span className="joy-tick joy-tick--up" />
        <span className="joy-tick joy-tick--right" />
        <span className="joy-tick joy-tick--down" />
        <span className="joy-tick joy-tick--left" />
        <div ref={knobRef} className="joy-knob" />
      </div>
    </div>
  );
}
