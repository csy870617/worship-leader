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

// verse family = blue, chorus family = red, everything else inherits the
// surrounding text color
const BLUE = "#2563eb";
const RED = "#dc2626";
export const DEFAULT_PRESET_COLORS: Record<string, string> = {
  V: BLUE, V1: BLUE, V2: BLUE, V3: BLUE,
  PC: RED, C: RED, C1: RED, C2: RED, C3: RED,
};

/** palette offered when recoloring a preset ("" = no color / inherit) */
export const PRESET_COLOR_CHOICES = ["", "#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0f172a"];

const LS = "wl.presetColors";
type ColorMap = Record<string, string>;

function load(): ColorMap {
  try {
    const raw = JSON.parse(localStorage.getItem(LS) || "null");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: ColorMap = {};
    for (const [k, v] of Object.entries(raw)) {
      // "" is a real value here: it means "this preset was cleared to no color"
      if (ALL_PRESETS.includes(k) && typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

let overrides: ColorMap = load();
const listeners = new Set<() => void>();
let version = 0;

/** Color for a preset: the user's override if set, else the built-in default. */
export function presetColor(name: string): string {
  const o = overrides[name];
  return o !== undefined ? o : DEFAULT_PRESET_COLORS[name] ?? "";
}
export function setPresetColor(name: string, color: string) {
  if (!ALL_PRESETS.includes(name)) return;
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

/**
 * Split a song form into colored segments. A run of letters+digits is one
 * token; it gets a color only when it exactly matches a preset that has one.
 * Everything else (separators, spaces, free text, newlines) passes through
 * uncolored, so the rendered text is always identical to the stored string.
 */
export function songFormSegments(text: string): FormSegment[] {
  const out: FormSegment[] = [];
  const re = /[A-Za-z]+[0-9]*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const color = presetColor(m[0]);
    if (!color) continue; // not a colored preset — leave it in the plain run
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: m[0], color });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
