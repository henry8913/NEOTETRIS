/**
 * Build identity of the deployed client bundle.
 *
 * Vite names the entry chunk `assets/index-<hash>.js`, so the filename *is* the
 * build id. `GET /api/health` reports its first six hash characters, which lets
 * you tell from the API alone which bundle a host is actually serving — useful
 * when a phone keeps running a stale shell and the network tab is not enough.
 *
 * Everything is derived from `client/dist/index.html` on disk; nothing is
 * hardcoded and nothing is read from the client package.
 */

import fs from 'node:fs';

/** Vite's entry chunk prefix (`assets/index-<hash>.js`). */
export const ENTRY_PREFIX = 'index-';

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
 * Entry asset filename of an `index.html`: the `<script type="module" src>`
 * first, then a `<link rel="modulepreload" href>` as a fallback (some hosts
 * inject one before the other). `null` when the document cannot be parsed.
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
 * Short build label of an `index.html` — the first six characters of the entry
 * hash. Vite hashes are base64url, so the hash itself may contain `-`
 * (`index-CeKTIn-g.js`); everything after the `index-` prefix is the hash.
 *
 * `null` (not `'dev'`) when the document has no hashed entry, because the
 * health endpoint reports *what is deployed* and an API-only host has none.
 */
export function buildTagFromHtml(html) {
  const asset = parseEntryAsset(html);
  if (!asset || !asset.startsWith(ENTRY_PREFIX)) return null;

  const hash = asset.slice(ENTRY_PREFIX.length).replace(/\.m?js$/i, '').replace(/[^A-Za-z0-9_-]/g, '');
  return hash ? hash.slice(0, 6) : null;
}

/**
 * Build label of the deployed SPA, read from disk once per process.
 * Missing/unreadable `index.html` (API-only mode) yields `null`.
 */
export function readBuildTag(indexHtmlPath) {
  if (!indexHtmlPath) return null;
  try {
    return buildTagFromHtml(fs.readFileSync(indexHtmlPath, 'utf8'));
  } catch {
    return null;
  }
}
