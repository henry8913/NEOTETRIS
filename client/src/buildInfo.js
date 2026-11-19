/**
 * Build identity helpers — pure string functions, no DOM, no fetch.
 *
 * Every Vite build renames its entry chunk (`index-<hash>.js`), so the filename
 * *is* the build id: the UI shows its first six hash characters and the
 * "newer version available" detector compares the running filename with the
 * one in the freshly served `index.html`. Nothing has to be versioned by hand.
 */

/** Reads one attribute out of a raw HTML tag, quoted with `'` or `"`. */
function readAttr(tag, name) {
  const match = new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i').exec(tag);
  return match ? match[2] : null;
}

/**
 * Filename (last path segment, query/hash stripped) of a JS asset reference.
 * `null` for anything that is not a script path — including Vite's dev entry
 * (`/src/main.jsx`), which has no content hash at all.
 */
export function assetName(ref) {
  if (typeof ref !== 'string') return null;
  const clean = ref.trim().split(/[?#]/)[0];
  if (!clean) return null;
  const name = clean.split('/').pop();
  return name && /\.m?js$/i.test(name) ? name : null;
}

/**
 * Entry asset of an `index.html`: the `<script type="module" src>` first, then
 * a `<link rel="modulepreload" href>` (some hosts inject one before the other).
 * Returns just the filename, or `null` when the document cannot be parsed.
 */
export function parseEntryAsset(html) {
  if (typeof html !== 'string' || html.length === 0) return null;

  for (const tag of html.match(/<script\b[^>]*>/gi) ?? []) {
    if (!/\btype\s*=\s*(["'])module\1/i.test(tag)) continue;
    const name = assetName(readAttr(tag, 'src'));
    if (name) return name;
  }

  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if (!/\brel\s*=\s*(["'])modulepreload\1/i.test(tag)) continue;
    const name = assetName(readAttr(tag, 'href'));
    if (name) return name;
  }

  return null;
}

/**
 * Short build label shown in the start screen: the first six characters of the
 * entry hash. Vite names the entry `index-<hash>.js` and the hash is base64url,
 * so it may itself contain `-` (`index-CeKTIn-g.js`): everything after the
 * first dash is the hash. `dev` when the entry has no hash, which is exactly
 * what the Vite dev server serves.
 */
export function buildTag(asset) {
  const name = assetName(asset);
  if (!name) return 'dev';
  const stem = name.replace(/\.m?js$/i, '');
  const dash = stem.indexOf('-');
  if (dash === -1) return 'dev';
  const hash = stem.slice(dash + 1).replace(/[^A-Za-z0-9_-]/g, '');
  return hash ? hash.slice(0, 6) : 'dev';
}

/**
 * True only when both the running and the served entry asset are known and
 * they differ. An unknown hash (dev server, unparseable HTML, offline fetch)
 * is never reported as stale, so the banner cannot produce false positives.
 */
export function isStale(running, served) {
  const current = assetName(running);
  const latest = assetName(served);
  if (!current || !latest) return false;
  return current !== latest;
}
