// 송폼(song form) presets and their colors.
//
// The song form itself stays PLAIN TEXT — colors are applied when rendering by
// recognizing preset tokens (V1, C, Tag, …). Keeping the stored value plain
// means sync, PDF export and hand-typed forms all keep working unchanged.

/** quick-insert chips, in display order: verse family, chorus family, the rest */
export const PRESET_ROWS = [
  ["Int4", "Int8", "V", "V1", "V2", "V3"],
  ["PC", "C", "C1", "C2", "C3"],
  ["B", "Itl4", "Itl8", "Tag", "Out", "Rit"],
];
export const ALL_PRESETS = PRESET_ROWS.flat();

/** text a preset chip inserts: most get a trailing " - " separator, but "Out"
 *  (the ending marker) goes in on its own and "Rit" as "(Rit)" */
export const presetInsertText = (p: string) => (p === "Out" ? p : p === "Rit" ? "(Rit)" : `${p} - `);

// verse family = blue, chorus family = red, bridge = green, everything else
// inherits the surrounding text color
const BLUE = "#2563eb";
const RED = "#dc2626";
const GREEN = "#16a34a";
export const DEFAULT_PRESET_COLORS: Record<string, string> = {
  V: BLUE, V1: BLUE, V2: BLUE, V3: BLUE,
  PC: RED, C: RED, C1: RED, C2: RED, C3: RED,
  B: GREEN,
};

/** palette offered when recoloring a preset ("" = no color / inherit) */
export const PRESET_COLOR_CHOICES = ["", "#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0f172a"];

const LS = "wl.presetColors";
type ColorMap = Record<string, string>;

/** longest word/phrase we will color — keeps a stray "select all" out of the map */
const MAX_KEY = 40;
const validKey = (k: string) => k.length > 0 && k.length <= MAX_KEY;

function load(): ColorMap {
  try {
    const raw = JSON.parse(localStorage.getItem(LS) || "null");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: ColorMap = {};
    for (const [k, v] of Object.entries(raw)) {
      // "" is a real value here: it means "this text was cleared to no color"
      if (validKey(k) && typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

let overrides: ColorMap = load();
const listeners = new Set<() => void>();
let version = 0;

/** Color for a preset — or for any other text the user has colored by hand:
 *  the user's override if set, else the built-in default. */
export function presetColor(name: string): string {
  const o = overrides[name];
  return o !== undefined ? o : DEFAULT_PRESET_COLORS[name] ?? "";
}
/** Words/phrases the user colored that aren't presets, longest first so an
 *  overlapping shorter one can't win the match. */
function customKeys(): string[] {
  return Object.keys(overrides)
    .filter((k) => overrides[k] && !ALL_PRESETS.includes(k))
    .sort((a, b) => b.length - a.length);
}
export function setPresetColor(name: string, color: string) {
  if (!validKey(name)) return;
  // storing the default explicitly is harmless and keeps intent obvious
  overrides = { ...overrides, [name]: color };
  try {
    localStorage.setItem(LS, JSON.stringify(overrides));
  } catch {
    /* quota — colors just won't persist */
  }
  version++;
  listeners.forEach((l) => l());
}
export function resetPresetColors() {
  overrides = {};
  try {
    localStorage.removeItem(LS);
  } catch {
    /* ignore */
  }
  version++;
  listeners.forEach((l) => l());
}
export function subscribePresetColors(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
export function presetColorsVersion() {
  return version;
}

export interface FormSegment {
  text: string;
  color?: string;
}

/** Readable text color for a filled box of `bg` (white on anything dark). */
export function boxTextColor(bg: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(bg.trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.62 ? "#0f172a" : "#ffffff";
}

/** Inline style for a song-form box in a *layout-safe* place — the field's
 *  mirror sits exactly on top of a transparent textarea, so the box may not
 *  change text metrics. box-shadow paints the padding instead of adding it. */
export function formBoxStyle(color: string): Record<string, string> {
  return {
    background: color,
    color: boxTextColor(color),
    borderRadius: "4px",
    boxShadow: `0 0 0 2px ${color}`,
  };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Split a song form into colored segments. Two things get a color: a run of
 * letters+digits that exactly matches a preset, and any word/phrase the user
 * colored by hand (those win, and are tried longest-first). Everything else
 * (separators, spaces, free text, newlines) passes through uncolored, so the
 * rendered text is always identical to the stored string.
 */
export function songFormSegments(text: string): FormSegment[] {
  const custom = customKeys();
  const re = new RegExp(
    (custom.length ? custom.map(escapeRe).join("|") + "|" : "") + "[A-Za-z]+[0-9]*",
    "g"
  );
  const out: FormSegment[] = [];
  const push = (t: string, color?: string) => {
    if (!t) return;
    const prev = out[out.length - 1];
    if (prev && prev.color === color) prev.text += t; // keep runs merged
    else out.push(color ? { text: t, color } : { text: t });
  };

  // Work chunk by chunk (a chunk = a run with no spaces in it). Anything
  // written up against a colored token — "(V1)", "C1x2", "V1절" — belongs to
  // that token and takes its color; a space ends the run.
  const byChunks = (part: string) => {
  for (const chunk of part.split(/(\s+)/)) {
    if (!chunk || /^\s+$/.test(chunk)) {
      push(chunk);
      continue;
    }
    re.lastIndex = 0;
    const hits: { start: number; color: string }[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(chunk))) {
      if (!m[0]) {
        re.lastIndex++; // defensive: never spin on a zero-length match
        continue;
      }
      const color = presetColor(m[0]);
      if (color) hits.push({ start: m.index, color });
    }
    if (!hits.length) {
      push(chunk);
      continue;
    }
    // each colored token owns the chunk from its own start (the leading part
    // goes to the first one) until the next colored token begins
    for (let i = 0; i < hits.length; i++) {
      const from = i === 0 ? 0 : hits[i].start;
      const to = i + 1 < hits.length ? hits[i + 1].start : chunk.length;
      push(chunk.slice(from, to), hits[i].color);
    }
  }
  };

  // A hand-colored phrase can contain spaces, so it has to be matched before
  // the text is cut into chunks; what's left goes through the chunk pass.
  const phrases = custom.filter((k) => /\s/.test(k));
  if (!phrases.length) {
    byChunks(text);
    return out;
  }
  const pre = new RegExp(phrases.map(escapeRe).join("|"), "g");
  let last = 0;
  let pm: RegExpExecArray | null;
  while ((pm = pre.exec(text))) {
    if (!pm[0]) {
      pre.lastIndex++;
      continue;
    }
    if (pm.index > last) byChunks(text.slice(last, pm.index));
    push(pm[0], presetColor(pm[0]));
    last = pm.index + pm[0].length;
  }
  if (last < text.length) byChunks(text.slice(last));
  return out;
}
