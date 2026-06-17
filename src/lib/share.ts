import type { ContiItem } from "./useConti";
import { getSongById } from "./catalog";

// UTF-8 safe base64 (handles Korean notes)
function b64encode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64decode(b64: string): string {
  const pad = b64.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Encode a conti into a compact URL-safe token. */
export function encodeConti(items: ContiItem[]): string {
  const compact = items.map((i) => (i.note ? [i.id, i.note] : [i.id]));
  return b64encode(JSON.stringify(compact));
}

export function decodeConti(token: string): ContiItem[] | null {
  try {
    const arr = JSON.parse(b64decode(token));
    if (!Array.isArray(arr)) return null;
    return arr
      .map((x) => (Array.isArray(x) ? { id: String(x[0]), note: x[1] } : { id: String(x) }))
      .filter((x) => x.id && getSongById(x.id));
  } catch {
    return null;
  }
}

/** Full shareable URL pointing at the import route. */
export function contiShareUrl(items: ContiItem[]): string {
  const base = location.href.split("#")[0];
  return `${base}#/conti?d=${encodeConti(items)}`;
}

/** Human-readable text for pasting into a chat app. */
export function contiToText(items: ContiItem[]): string {
  const lines = items.map((it, idx) => {
    const s = getSongById(it.id);
    if (!s) return `${idx + 1}.`;
    const key = s.keys.length ? ` (${s.keys.join("/")})` : "";
    const note = it.note ? ` — ${it.note}` : "";
    return `${idx + 1}. ${s.title}${key}${note}`;
  });
  return `🎵 콘티 (${items.length}곡)\n${lines.join("\n")}`;
}

/**
 * Open the device's native share sheet for a conti link.
 * Falls back to copying the link when Web Share isn't available.
 */
export async function shareConti(
  items: ContiItem[],
  title = "콘티"
): Promise<"shared" | "copied" | "failed"> {
  const url = contiShareUrl(items);
  if (navigator.share) {
    try {
      await navigator.share({ title, text: `🎵 ${title} (${items.length}곡)`, url });
      return "shared";
    } catch (e) {
      // user cancelled the share sheet — not an error
      if (e instanceof DOMException && e.name === "AbortError") return "shared";
      // otherwise fall through to clipboard
    }
  }
  return (await copyText(url)) ? "copied" : "failed";
}

/** Copy text to clipboard with a legacy fallback. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
