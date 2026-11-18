/**
 * Payload validation for POST /api/scores.
 *
 * Contract notes:
 * - `score` MUST be a JSON number (integer). Numeric strings like "1000" are
 *   rejected on purpose: the client always sends numbers, and silently coercing
 *   strings is a common source of bugs (e.g. "" or "1e3" sneaking through).
 * - Missing `name`, `level` and `lines` are not errors: they fall back to
 *   defaults. Missing `score` is an error because there is nothing to rank.
 * - Unknown fields are ignored.
 * - All error messages are in English.
 */

export const MAX_NAME_LENGTH = 20;
export const MAX_SCORE = 999999999;
export const MAX_LEVEL = 99;
export const MAX_LINES = 999999;

export const DEFAULT_NAME = 'Anonymous';
export const DEFAULT_LEVEL = 1;
export const DEFAULT_LINES = 0;

// Control characters (C0, DEL, C1) — kept out of stored/rendered names.
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

function isInteger(value) {
  return typeof value === 'number' && Number.isInteger(value);
}

/**
 * Removes control characters, trims and caps a name at MAX_NAME_LENGTH.
 * Intended to run *after* validateScorePayload (defense in depth).
 *
 * @param {unknown} name
 * @returns {string} a safe, non-empty name
 */
export function sanitizeName(name) {
  const cleaned = String(name ?? '')
    .replace(CONTROL_CHARS, '')
    .trim();

  const capped = [...cleaned].slice(0, MAX_NAME_LENGTH).join('');
  return capped.length > 0 ? capped : DEFAULT_NAME;
}

/**
 * @param {unknown} body parsed JSON body
 * @returns {{ ok: true, value: { name: string, score: number, level: number, lines: number } }
 *   | { ok: false, errors: Array<{ field: string, message: string }> }}
 */
export function validateScorePayload(body) {
  const errors = [];
  const payload = body && typeof body === 'object' && !Array.isArray(body) ? body : {};

  // --- name -------------------------------------------------------------
  let name = DEFAULT_NAME;
  if (payload.name !== undefined && payload.name !== null) {
    if (typeof payload.name !== 'string') {
      errors.push({ field: 'name', message: 'Name must be a string' });
    } else {
      const trimmed = payload.name.trim();
      if ([...trimmed].length > MAX_NAME_LENGTH) {
        errors.push({
          field: 'name',
          message: `Name must be at most ${MAX_NAME_LENGTH} characters`,
        });
      } else if (trimmed.length > 0) {
        name = trimmed;
      }
    }
  }

  // --- score ------------------------------------------------------------
  let score;
  if (payload.score === undefined || payload.score === null) {
    errors.push({ field: 'score', message: 'Score is required' });
  } else if (!isInteger(payload.score)) {
    errors.push({ field: 'score', message: 'Score must be an integer number' });
  } else if (payload.score < 0) {
    errors.push({ field: 'score', message: 'Score must be greater than or equal to 0' });
  } else if (payload.score > MAX_SCORE) {
    errors.push({ field: 'score', message: `Score must be less than or equal to ${MAX_SCORE}` });
  } else {
    score = payload.score;
  }

  // --- level ------------------------------------------------------------
  let level = DEFAULT_LEVEL;
  if (payload.level !== undefined && payload.level !== null) {
    if (!isInteger(payload.level)) {
      errors.push({ field: 'level', message: 'Level must be an integer number' });
    } else if (payload.level < 1 || payload.level > MAX_LEVEL) {
      errors.push({ field: 'level', message: `Level must be between 1 and ${MAX_LEVEL}` });
    } else {
      level = payload.level;
    }
  }

  // --- lines ------------------------------------------------------------
  let lines = DEFAULT_LINES;
  if (payload.lines !== undefined && payload.lines !== null) {
    if (!isInteger(payload.lines)) {
      errors.push({ field: 'lines', message: 'Lines must be an integer number' });
    } else if (payload.lines < 0 || payload.lines > MAX_LINES) {
      errors.push({ field: 'lines', message: `Lines must be between 0 and ${MAX_LINES}` });
    } else {
      lines = payload.lines;
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  return { ok: true, value: { name: sanitizeName(name), score, level, lines } };
}
