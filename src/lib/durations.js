/**
 * Finds cooking times in recipe text and speech ("bake for 25-30 minutes",
 * "simmer 1 ½ hours", "set a timer for twenty-five minutes").
 *
 * Deterministic on purpose: Jev picks *which* time a timer is for, but the
 * number itself always comes from the text.
 *
 * @module lib/durations
 */

const NUMBER_WORDS = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
  'twenty-five': 25,
  thirty: 30,
  forty: 40,
  'forty-five': 45,
  fifty: 50,
  sixty: 60,
  ninety: 90,
};
const FRACTIONS = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };

// Longest words first so "twenty-five" is not read as "twenty" plus a range.
const WORDS = Object.keys(NUMBER_WORDS)
  .sort((a, b) => b.length - a.length)
  .join('|');
// A quantity: "1.5", "1 ½", "1½", "1 1/2", "1/2", "½", or a number word.
const QUANTITY = String.raw`(?:\d+(?:\.\d+)?\s*(?:\d+\/\d+|[½¼¾⅓⅔])?|\d+\/\d+|[½¼¾⅓⅔]|${WORDS})`;
const DURATION = new RegExp(
  String.raw`(?<![\d/])(${QUANTITY})(?:\s*(?:-|–|to)\s*(${QUANTITY}))?\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b`,
  'gi',
);

/**
 * @typedef {object} Duration
 * @property {string} label The matched text, e.g. "25-30 minutes".
 * @property {number} seconds
 */

/**
 * Every cooking time in `text`, in order. Ranges use the lower bound so the
 * cook checks early rather than late. "1 hour 15 minutes" is one duration.
 *
 * @param {string} text
 * @returns {Duration[]}
 */
export function durations(text) {
  const normalized = text
    .replace(/\bhalf an hour\b/gi, '30 minutes')
    .replace(/\ban hour and a half\b/gi, '90 minutes')
    .replace(
      /\b(\d+|one|two|three|four|five)\s+and a half\s+(hours?|minutes?)/gi,
      (_, n, unit) => `${quantity(n) + 0.5} ${unit}`,
    );

  /** @type {Array<Duration & { unit: number, end: number }>} */
  const found = [];
  for (const match of normalized.matchAll(DURATION)) {
    const amount = quantity(match[1]);
    if (!amount) continue;
    const unit = /^h/i.test(match[3]) ? 3600 : /^m/i.test(match[3]) ? 60 : 1;
    const end = match.index + match[0].length;
    const previous = found.at(-1);
    const joinsPrevious =
      previous?.unit === 3600 && unit === 60 && /^\s*(and\s*)?$/i.test(normalized.slice(previous.end, match.index));
    if (joinsPrevious) {
      previous.seconds += amount * 60;
      previous.label += normalized.slice(previous.end, end);
      previous.end = end;
      continue;
    }
    found.push({ label: match[0].trim(), seconds: Math.round(amount * unit), unit, end });
  }
  return found.map(({ label, seconds }) => ({ label, seconds }));
}

/**
 * Parses one quantity token ("1 ½", "1 1/2", "twenty-five").
 *
 * @param {string} token
 * @returns {number}
 */
export function quantity(token) {
  const q = token.trim().toLowerCase();
  if (q in NUMBER_WORDS) return NUMBER_WORDS[q];
  let total = 0;
  for (const part of q.match(/\d+\/\d+|\d+(?:\.\d+)?|[½¼¾⅓⅔]/g) ?? []) {
    if (part in FRACTIONS) total += FRACTIONS[part];
    else if (part.includes('/')) {
      const [numerator, denominator] = part.split('/').map(Number);
      total += numerator / denominator;
    } else total += Number(part);
  }
  return total;
}

/**
 * "1 hour 5 minutes", for reading aloud.
 *
 * @param {number} totalSeconds
 */
export function speakDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const parts = [
    [Math.floor(s / 3600), 'hour'],
    [Math.floor((s % 3600) / 60), 'minute'],
    [s % 60, 'second'],
  ]
    .filter(([n]) => n)
    .map(([n, unit]) => `${n} ${unit}${n === 1 ? '' : 's'}`);
  return parts.join(' ') || '0 seconds';
}

/**
 * "4:05" or "1:02:03", for the timer display.
 *
 * @param {number} totalSeconds
 */
export function clock(totalSeconds) {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
