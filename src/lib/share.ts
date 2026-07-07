import type { ContiItem } from "./useConti";
import { getSongById } from "./catalog";
import { isInAppBrowser } from "./inapp";

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
  const compact = items.map((i) => {
    if (i.key) return [i.id, i.note ?? "", i.key];
    if (i.note) return [i.id, i.note];
    return [i.id];
  });
  return b64encode(JSON.stringify(compact));
}

export function decodeConti(token: string): ContiItem[] | null {
  try {
    const arr = JSON.parse(b64decode(token));
    if (!Array.isArray(arr)) return null;
    return arr
      .map((x): ContiItem => {
        if (!Array.isArray(x)) return { id: String(x) };
        const item: ContiItem = { id: String(x[0]) };
        if (x[1]) item.note = String(x[1]);
        if (x[2]) item.key = String(x[2]);
        return item;
      })
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
    const key = it.key ? ` (${it.key})` : s.keys.length ? ` (${s.keys.join("/")})` : "";
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

/** Extract an 11-char YouTube video id from a URL (youtu.be / watch / embed / shorts). */
export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      return /^[\w-]{11}$/.test(id) ? id : null;
    }
    if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      if (u.pathname === "/watch") {
        const v = u.searchParams.get("v") ?? "";
        return /^[\w-]{11}$/.test(v) ? v : null;
      }
      const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/);
      if (m) return m[1];
    }
    return null;
  } catch {
    return null;
  }
}

/** Build a YouTube playlist URL that plays the given links in order (max 50). */
export function youtubePlaylistUrl(urls: (string | undefined)[]): string | null {
  const ids: string[] = [];
  for (const u of urls) {
    const id = u ? youtubeId(u) : null;
    if (id && !ids.includes(id)) ids.push(id);
  }
  if (!ids.length) return null;
  return `https://www.youtube.com/watch_videos?video_ids=${ids.slice(0, 50).join(",")}`;
}

/** True when running as an installed PWA (Android/desktop standalone or iOS
 *  home-screen app), where opening a new tab via target="_blank" / window.open
 *  is blocked and silently does nothing. */
function isStandalonePwa(): boolean {
  try {
    return (
      window.matchMedia?.("(display-mode: standalone)").matches === true ||
      window.matchMedia?.("(display-mode: fullscreen)").matches === true ||
      window.matchMedia?.("(display-mode: minimal-ui)").matches === true ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

/**
 * Open an external URL reliably from anywhere — including installed PWAs and
 * in-app webviews, where `target="_blank"` and `window.open` are no-ops. In
 * those contexts we navigate the current window instead (an out-of-scope URL
 * hands off to the browser / native app), so the link never silently fails.
 */
export function openExternal(url: string) {
  const ua = navigator.userAgent || "";
  // Installed Android PWA: a new tab can't open, and navigating the app's own
  // webview to an external origin is refused ("연결을 거부했습니다"). Hand the URL
  // to the system via an intent — the same mechanism the YouTube buttons already
  // use successfully — so the default browser / matching app opens it. The
  // browser_fallback_url guarantees it opens even if no app claims the link.
  if (/Android/i.test(ua) && isStandalonePwa() && !isInAppBrowser()) {
    const noScheme = url.replace(/^https?:\/\//, "");
    window.location.href =
      `intent://${noScheme}#Intent;scheme=https;` +
      `S.browser_fallback_url=${encodeURIComponent(url)};end`;
    return;
  }
  // iOS installed app / in-app webview: can't open a new tab → navigate the
  // current window (an out-of-scope URL hands off to Safari / the browser).
  if (isStandalonePwa() || isInAppBrowser()) {
    window.location.href = url;
    return;
  }
  // a normal browser: open a new tab. NOTE: with "noopener" window.open returns
  // null even on success, so we must NOT fall back to location.href on a null
  // result — that would navigate the current page too (double-open). The click
  // is a user gesture, so the popup is allowed.
  window.open(url, "_blank", "noopener");
}

/**
 * Open a YouTube URL in the YouTube app when it's installed, otherwise in a
 * normal browser. On a real Android browser we use an `intent://` URL with a
 * browser fallback (opens the app if installed, the browser if not). Everywhere
 * else we defer to openExternal, which also handles standalone PWAs / in-app
 * webviews where a plain new-tab open would do nothing.
 */
export function openYouTube(httpsUrl: string) {
  const ua = navigator.userAgent || "";
  if (/Android/i.test(ua) && !isInAppBrowser()) {
    const noScheme = httpsUrl.replace(/^https?:\/\//, "");
    const intent =
      `intent://${noScheme}#Intent;scheme=https;` +
      `package=com.google.android.youtube;` +
      `S.browser_fallback_url=${encodeURIComponent(httpsUrl)};end`;
    window.location.href = intent;
    return;
  }
  openExternal(httpsUrl);
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
