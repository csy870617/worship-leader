// 송폼(song form): a row of boxes, and the colors they are drawn in.
//
// A form is stored as ONE STRING so sync, PDF export and everything that
// already carries this field keep working. The boxes are joined by an
// invisible separator; a string without it (anything written before boxes
// existed) is read back as boxes by splitting on whitespace, so old forms
// still show up as boxes.

/** quick-insert chips, in display order: verse family, chorus family, the rest */
export const PRESET_ROWS = [
  ["Int4", "Int8", "V", "V1", "V2", "V3"],
  ["PC", "C", "C1", "C2", "C3", "C4"],
  ["B", "Itl4", "Itl8", "Tag", "Out", "Rit", "/"],
];
export const ALL_PRESETS = PRESET_ROWS.flat();

/** A preset chip drops in as its own box, labeled exactly like the chip. */
export const presetInsertText = (p: string) => p;

// verse family = blue, chorus family = red, bridge = green, and the structural
// markers (intro/interlude/tag/ending) a neutral slate — every preset gets a
// box so the form reads as one row of boxes
const BLUE = "#2563eb";
const RED = "#dc2626";
const GREEN = "#16a34a";
const SLATE = "#64748b";
export const DEFAULT_PRESET_COLORS: Record<string, string> = {
  V: BLUE, V1: BLUE, V2: BLUE, V3: BLUE,
  PC: RED, C: RED, C1: RED, C2: RED, C3: RED,
  C4: RED,
  B: GREEN,
  // structural markers all share one calm tone
  Int4: SLATE, Int8: SLATE, Itl4: SLATE, Itl8: SLATE, Tag: SLATE, Out: SLATE, Rit: SLATE, "/": SLATE,
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

const hex = (c: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};
const toHex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");

/** The one light grey every neutral box uses — the structural presets
 *  (Int4, Tag, Out, /, …) and the boxes the user types in. Kept as a fixed
 *  triple instead of a wash of SLATE so they all match exactly. */
export const NEUTRAL_BOX = { bg: "#f2f4f7", fg: "#5a6573", border: "#e3e7ed" };

/**
 * The soft two-tone pair a song-form box is drawn with: a pale wash of the
 * chosen color behind its own, deeper shade of text. Reads calmly next to the
 * plain text around it, and stays legible on white and on the dark sheet
 * screen because the wash is opaque. Neutral boxes take the fixed grey above.
 */
export function formBoxColors(color: string): { bg: string; fg: string; border: string } {
  if (!color || color.toLowerCase() === SLATE) return NEUTRAL_BOX;
  const c = hex(color);
  if (!c) return NEUTRAL_BOX;
  const mix = (v: number, w: number) => v + (255 - v) * w;
  const wash = (v: number) => mix(v, 0.84);
  const edge = (v: number) => mix(v, 0.55);
  const deep = (v: number) => v * 0.78;
  return {
    bg: toHex(wash(c.r), wash(c.g), wash(c.b)),
    fg: toHex(deep(c.r), deep(c.g), deep(c.b)),
    border: toHex(edge(c.r), edge(c.g), edge(c.b)),
  };
}

/** Inline style for a song-form box in a *layout-safe* place — the field's
 *  mirror sits exactly on top of a transparent textarea, so the box may not
 *  change text metrics. box-shadow paints the padding instead of adding it. */
export function formBoxStyle(color: string): Record<string, string> {
  const { bg, fg, border } = formBoxColors(color);
  return {
    background: bg,
    color: fg,
    borderRadius: "4px",
    // both are painted outside the text box and cost no layout space, so the
    // mirror still lines up with the caret: shadow = the padding, outline = the
    // edge that keeps two boxes apart when only a space separates them
    boxShadow: `0 0 0 2px ${bg}`,
    outline: `1px solid ${border}`,
    outlineOffset: "1px",
  };
}

/** One box of a song form. A preset box's label is fixed; a text box holds
 *  whatever the user typed in it. */
export interface FormItem {
  /** stable within one parse, used as the React key */
  id: string;
  text: string;
  preset: boolean;
}

/** invisible separator between boxes (unit separator) */
const SEP = "\u001f";
const isPresetName = (t: string) => ALL_PRESETS.includes(t);

/** Read a stored form as its boxes. */
export function parseForm(value: string): FormItem[] {
  const raw = value ?? "";
  if (!raw) return [];
  const parts = raw.includes(SEP)
    ? raw.split(SEP)
    : // legacy plain text: every word is its own box, and the separators the
      // form used to be written with ("-") are dropped
      raw
        .split(/\s+/)
        .filter((w) => w && w !== "-" && w !== "–");
  const out: FormItem[] = [];
  parts.forEach((text, i) => {
    // "(Rit)" was how Rit used to go in — show it as the Rit box now
    const t = /^\((.+)\)$/.test(text) && isPresetName(text.slice(1, -1)) ? text.slice(1, -1) : text;
    out.push({ id: `b${i}`, text: t, preset: isPresetName(t) });
  });
  return out;
}

/** Write boxes back to the stored string. */
export function serializeForm(items: FormItem[]): string {
  return items.map((it) => it.text).join(SEP);
}

/** Plain, separator-free text of a form — for anything that just needs to read it. */
export function formPlainText(value: string): string {
  return parseForm(value)
    .map((i) => i.text)
    .join(" ");
}

/** The color a box is drawn in ("" = plain, no box). */
export function itemColor(item: FormItem): string {
  return presetColor(item.text.trim());
}
