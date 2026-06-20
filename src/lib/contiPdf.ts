import type { Song } from "../types";
import type { ContiItem, SheetText } from "./useConti";
import { loadSheet } from "./attachments";
import { getSongAttach } from "./songAttach";
import { youtubePlaylistUrl } from "./share";

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

function safeName(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "conti";
}

// Letter size in mm
const PAGE_W = 215.9;
const PAGE_H = 279.4;
const MARGIN = 5; // mm on all sides — keep margins minimal
const CONTENT_W = PAGE_W - 2 * MARGIN;
const CONTENT_H = PAGE_H - 2 * MARGIN;
const PX_W = 794; // off-screen render width

const BASE_STYLE =
  `position:fixed;left:-99999px;top:0;width:${PX_W}px;background:#ffffff;color:#111827;` +
  "font-family:'Pretendard',-apple-system,sans-serif;padding:14px 18px;box-sizing:border-box;";

type SheetImg = { url: string; texts?: SheetText[] };

/** An image with positioned text annotations baked over it. */
function sheetOverlay(url: string, widthPx: number, texts?: SheetText[]): string {
  const spans = (texts ?? [])
    .map(
      (t) =>
        `<span style="position:absolute;left:${t.x * 100}%;top:${t.y * 100}%;transform:translate(-50%,-50%);color:${esc(
          t.color
        )};font-size:${Math.round(t.size * widthPx)}px;font-weight:700;line-height:1;white-space:nowrap;">${esc(
          t.text
        )}</span>`
    )
    .join("");
  return `<div style="position:relative;width:100%;"><img src="${url}" style="width:100%;display:block;" />${spans}</div>`;
}

/** Info page: number, title, key, memo, and (optionally) the first sheet. */
function buildInfoEl(
  index: number,
  song: Song,
  item: ContiItem,
  firstSheet?: SheetImg,
  playlistUrl?: string
): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = BASE_STYLE;

  const keys = item.key ? item.key : song.keys.join(" / ");
  const note = getSongAttach(item.id)?.note;
  const parts: string[] = [];

  // whole-conti playlist link, top-right (only passed for the very first page)
  if (playlistUrl) {
    parts.push(
      `<div style="text-align:right;margin-bottom:6px;"><a data-pdf-link href="${esc(playlistUrl)}" style="display:inline-block;line-height:0;text-decoration:none;"><svg width="30" height="30" viewBox="0 0 24 24" fill="#dc2626" style="display:block;"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.3 3.6-6.3 3.6Z"/></svg></a></div>`
    );
  }
  parts.push(
    `<div style="display:flex;align-items:baseline;gap:10px;">
      <span style="font-size:22px;font-weight:800;color:#c7d2fe;min-width:28px;">${index + 1}</span>
      <span style="font-size:22px;font-weight:700;">${esc(song.title)}</span>
      ${keys ? `<span style="font-size:15px;font-weight:700;color:#4f46e5;">${esc(keys)}</span>` : ""}
    </div>`
  );
  if (note) {
    parts.push(
      `<div style="margin:8px 0 0 38px;font-size:17px;color:#374151;">${esc(note)}</div>`
    );
  }
  if (firstSheet) {
    // image width = render width minus the 18px horizontal padding on each side
    parts.push(`<div style="margin:12px 0 0 0;">${sheetOverlay(firstSheet.url, PX_W - 36, firstSheet.texts)}</div>`);
  }

  el.innerHTML = parts.join("");
  return el;
}

/** A page that holds a single sheet image (edge to edge) with its annotations. */
function buildSheetEl(sheet: SheetImg): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText =
    `position:fixed;left:-99999px;top:0;width:${PX_W}px;background:#ffffff;color:#111827;font-family:'Pretendard',-apple-system,sans-serif;padding:0;box-sizing:border-box;`;
  el.innerHTML = sheetOverlay(sheet.url, PX_W, sheet.texts);
  return el;
}

/**
 * Render the conti to a Letter-size PDF (one song per page, sheet images
 * scaled to fit, links kept clickable). Returns the file + playlist link, or
 * null on failure. Sharing/downloading is handled separately so the share can
 * fire within a fresh user gesture (mobile Web Share needs that).
 */
export async function buildContiPdf(
  name: string,
  items: ContiItem[],
  songById: Map<string, Song>
): Promise<{ file: File; playlistUrl?: string } | null> {
  let jsPDF: typeof import("jspdf").default;
  let html2canvas: typeof import("html2canvas").default;
  try {
    const [m1, m2] = await Promise.all([import("jspdf"), import("html2canvas")]);
    jsPDF = m1.default;
    html2canvas = m2.default;
  } catch (e) {
    console.warn("[pdf] library load failed", e);
    return null;
  }

  // resolve to (song, item, sheet images), reading attachments from the song store
  const entries: { song: Song; item: ContiItem; sheets: SheetImg[] }[] = [];
  for (const item of items) {
    const song = songById.get(item.id);
    if (!song) continue;
    const att = getSongAttach(item.id);
    const sheets: SheetImg[] = [];
    if (att?.sheets?.length) {
      const urls = await Promise.all(att.sheets.map((aid) => loadSheet(aid)));
      att.sheets.forEach((aid, idx) => {
        const u = urls[idx];
        if (u) sheets.push({ url: u, texts: att.sheetTexts?.[aid] });
      });
    }
    entries.push({ song, item, sheets });
  }
  if (!entries.length) return null;

  const playlistUrl =
    youtubePlaylistUrl(items.map((it) => getSongAttach(it.id)?.youtube)) ?? undefined;

  const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "letter" });
  let pageAdded = false;

  // render one off-screen element onto its own page (contain-fit, never cut)
  const renderPage = async (el: HTMLDivElement, vCenter: boolean) => {
    document.body.appendChild(el);
    try {
      const imgEls = Array.from(el.querySelectorAll("img"));
      await Promise.all(
        imgEls.map(
          (img) =>
            img.decode?.().catch(() => undefined) ??
            new Promise<void>((res) => {
              if (img.complete) return res();
              img.onload = () => res();
              img.onerror = () => res();
            })
        )
      );

      const rootRect = el.getBoundingClientRect();
      const cssW = rootRect.width;
      const cssH = rootRect.height;
      // capture clickable links before rasterizing
      const links = Array.from(el.querySelectorAll<HTMLAnchorElement>("a[data-pdf-link]")).map(
        (a) => ({ href: a.href, rect: a.getBoundingClientRect() })
      );

      const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const aspect = canvas.height / canvas.width;

      // contain within the content box so nothing is clipped
      let imgW = CONTENT_W;
      let imgH = imgW * aspect;
      if (imgH > CONTENT_H) {
        imgH = CONTENT_H;
        imgW = imgH / aspect;
      }
      const x = (PAGE_W - imgW) / 2;
      const y = vCenter ? MARGIN + (CONTENT_H - imgH) / 2 : MARGIN;

      if (pageAdded) pdf.addPage();
      pageAdded = true;
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", x, y, imgW, imgH);

      if (cssW > 0 && cssH > 0) {
        const pad = 2; // mm — enlarge the hit area for easy tapping
        for (const { href, rect } of links) {
          if (!href) continue;
          const lx = x + ((rect.left - rootRect.left) / cssW) * imgW - pad;
          const ly = y + ((rect.top - rootRect.top) / cssH) * imgH - pad;
          const lw = (rect.width / cssW) * imgW + pad * 2;
          const lh = (rect.height / cssH) * imgH + pad * 2;
          pdf.link(lx, ly, lw, lh, { url: href });
        }
      }
    } finally {
      document.body.removeChild(el);
    }
  };

  try {
    for (let i = 0; i < entries.length; i++) {
      const { song, item, sheets } = entries[i];
      // page 1: info + first sheet (+ playlist link on the very first page)
      await renderPage(buildInfoEl(i, song, item, sheets[0], i === 0 ? playlistUrl : undefined), false);
      // remaining sheets: one per page so they're never shrunk together / cut
      for (let k = 1; k < sheets.length; k++) {
        await renderPage(buildSheetEl(sheets[k]), true);
      }
    }

    const blob = pdf.output("blob");
    const file = new File([blob], `${safeName(name)}.pdf`, { type: "application/pdf" });
    return { file, playlistUrl };
  } catch {
    return null;
  }
}

/** Open the native share sheet with a generated PDF. Call within a user gesture. */
export async function shareContiFile(
  file: File,
  title: string
): Promise<"shared" | "unsupported" | "failed"> {
  if (!navigator.canShare?.({ files: [file] })) return "unsupported";
  try {
    // share the file only — combining files + text/url makes some Android
    // share targets reject the whole share
    await navigator.share({ files: [file], title });
    return "shared";
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return "shared";
    console.warn("[pdf] share failed", e);
    return "failed";
  }
}

/** Download a generated PDF file. */
export function downloadContiFile(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
