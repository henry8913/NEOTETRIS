import { initAudio, playSound } from './sound.js';

/**
 * Single code path for every on-screen action.
 *
 * The wide rails and the overlays use `click` (once per tap, per Enter/Space on
 * a focused button and per assistive-technology activation). The compact action
 * pad calls the same helpers from `pointerdown` instead — the browser suppresses
 * `click` once a second finger is down, and two-thumb play must not lose DROP.
 * Either way exactly one dispatch happens per activation.
 */
export function press(dispatch, action, sound) {
  initAudio();
  if (sound) playSound(sound);
  dispatch(action);
}

/** Hard drop also kicks the screen: metadata first, then the rule. */
export function pressHardDrop(dispatch) {
  initAudio();
  haptic(12);
  dispatch({ type: 'FX_SHAKE', kind: 'light' });
  dispatch({ type: 'HARD_DROP' });
}

/**
 * Joystick / auto-repeat path. The joystick owns the gesture (it unlocked the
 * audio on pointerdown), so a repeat is just audio + dispatch — no click
 * semantics, no extra browser work on every 60–110 ms tick.
 */
export function repeatPress(dispatch, action, sound) {
  if (sound) playSound(sound);
  dispatch(action);
}

/** Short haptic tick where the platform supports it. Never throws. */
export function haptic(ms = 8) {
  try {
    globalThis.navigator?.vibrate?.(ms);
  } catch {
    /* vibration is optional, unsupported on iOS and often blocked */
  }
}
