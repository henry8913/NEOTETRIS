import test from 'node:test';
import assert from 'node:assert/strict';

import { KB_ATTR_MIN_INSET, keyboardInset } from './visualViewport.js';

/*
 * The arithmetic behind `--kb-inset` / `data-keyboard`: the overlays are sized
 * from it (card bottom = keyboard top), so it has to be exact and it has to be
 * safe on every viewport shape. `keyboardInset` takes a window-like object so
 * these cases need no browser.
 */

const view = (innerHeight, visualViewport) => ({ innerHeight, visualViewport });

test('no visualViewport means no keyboard (0)', () => {
  assert.equal(keyboardInset(view(844, undefined)), 0);
  assert.equal(keyboardInset(null), 0);
  assert.equal(keyboardInset(undefined), 0);
});

test('a visual viewport smaller than the layout viewport is the keyboard', () => {
  // iPhone 390×844 with the system keyboard open: the layout viewport stays at
  // 844, the visual one is 544.
  assert.equal(keyboardInset(view(844, { height: 544, offsetTop: 0 })), 300);
});

test('offsetTop is part of the covered area', () => {
  // Scrolled visual viewport (iOS pushes it down as well as shrinking it).
  assert.equal(keyboardInset(view(844, { height: 544, offsetTop: 100 })), 200);
  assert.equal(keyboardInset(view(844, { height: 544, offsetTop: 300 })), 0);
});

test('never negative: a visual viewport taller than the layout one is not a keyboard', () => {
  assert.equal(keyboardInset(view(390, { height: 900, offsetTop: 0 })), 0);
  assert.equal(keyboardInset(view(844, { height: 844, offsetTop: 0 })), 0);
});

test('sub-pixel geometry is rounded, not truncated to a fraction', () => {
  assert.equal(keyboardInset(view(843.5, { height: 544.4, offsetTop: 0 })), 299);
  assert.equal(keyboardInset(view(844, { height: 543.6, offsetTop: 0.2 })), 300);
});

test('missing fields degrade to "no keyboard" instead of NaN', () => {
  assert.equal(keyboardInset(view(844, {})), 0);
  assert.equal(keyboardInset(view(844, { height: 544 })), 300);
  assert.equal(keyboardInset(view(undefined, { height: 544, offsetTop: 0 })), 0);
});

test('the layout switch needs a real keyboard, not a toolbar row', () => {
  // CSS cannot threshold a length: the hook publishes `data-keyboard` only above
  // this inset, so a 20-40px accessory bar leaves the frame layout alone.
  assert.equal(KB_ATTR_MIN_INSET, 60);
  assert.ok(keyboardInset(view(844, { height: 544, offsetTop: 0 })) > KB_ATTR_MIN_INSET);
  assert.ok(keyboardInset(view(844, { height: 800, offsetTop: 0 })) < KB_ATTR_MIN_INSET);
});
