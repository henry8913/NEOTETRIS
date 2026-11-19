import { initAudio, playSound } from './sound.js';

/**
 * Single code path for every on-screen button.
 *
 * `click` is the only event used anywhere in the UI: it fires once per tap,
 * once per Enter/Space on a focused button and once per assistive-technology
 * activation, so a thumb and a screen reader both produce exactly one action
 * (the old `pointerdown` + `click` pair dispatched twice on some browsers).
 */
export function press(dispatch, action, sound) {
  initAudio();
  if (sound) playSound(sound);
  dispatch(action);
}

/** Hard drop also kicks the screen: metadata first, then the rule. */
export function pressHardDrop(dispatch) {
  initAudio();
  dispatch({ type: 'FX_SHAKE', kind: 'light' });
  dispatch({ type: 'HARD_DROP' });
}
