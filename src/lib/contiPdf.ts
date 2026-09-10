import type { Song } from "../types";
import type { ContiItem, SheetStroke, SheetText } from "./useConti";
import { loadSheet } from "./attachments";
import { getSongAttach, sheetsForKey } from "./songAttach";
import { formBoxColors, itemColor, parseForm } from "./songForm";
import { youtubePlaylistUrl } from "./share";

const esc = (s: string) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));


/** Song form as HTML: the same row of boxes the app shows, with real padding
 *  (the PDF has no caret to stay aligned with). Each box states its own
 *  line-height so the label sits centered whatever the row's line-height is. */
function formHtml(text: string): string {
  return parseForm(text)
    .map((item) => {
      const color = itemColor(item);
      const { bg, fg, border } = color
        ? formBoxColors(color)
        : { bg: "#f1f5f9", fg: "#475569", border: "#e2e8f0" };
      return (
        `<span style="display:inline-block;background:${bg};color:${fg};border:1px solid ${border};` +
        `border-radius:6px;padding:3px 9px;margin:0 7px 5px 0;line-height:1.25;vertical-align:top;">` +
        `${esc(item.text)}</span>`
      );
    })
    .join("");
}

function safeName(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "conti";
}

// bound a promise so a stalled sheet download (dropped connection, expired
// token) can't hang the whole export/share flow forever — degrade to
// `onTimeout` instead
function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: T): Promise<T> {
  return new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(onTimeout);
      }
    }, ms);
    p.then((v) => {
      if (!done) {
        done = true;
        clearTimeout(t);
        resolve(v);
      }
    }).catch(() => {
      if (!done) {
        done = true;
        clearTimeout(t);
        resolve(onTimeout);
      }
    });
  });
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

type SheetImg = { url: string };

/** A sheet image (annotations are already baked in by compositeSheet). */
function sheetOverlay(url: string): string {
  return `<div style="position:relative;width:100%;"><img src="${url}" style="width:100%;display:block;" /></div>`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("image load failed"));
    img.src = src;
  });
}

/**
 * Bake text annotations onto the sheet image with the canvas 2D API. Centering
 * via textAlign/textBaseline = "center"/"middle" matches the editor's
 * translate(-50%,-50%) exactly — and bypasses html2canvas, which shifts text
 * vertically. Returns the original url when there are no annotations.
 */
async function compositeSheet(
  url: string,
  texts?: SheetText[],
  strokes?: SheetStroke[]
): Promise<string> {
  if ((!texts || !texts.length) && (!strokes || !strokes.length)) return url;
  try {
    const img = await loadImage(url);
    const W = img.naturalWidth || img.width;
    const H = img.naturalHeight || img.height;
    if (!W || !H) return url;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, W, H);
    // pen / highlighter strokes first, so text sits on top (matches the editor)
    if (strokes && strokes.length) {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const s of strokes) {
        if (!s.points || s.points.length < 2) continue;
        ctx.globalAlpha = s.highlight ? 0.35 : 1;
        ctx.strokeStyle = s.color;
        ctx.lineWidth = Math.max(1, s.width * W);
        ctx.beginPath();
        ctx.moveTo(s.points[0].x * W, s.points[0].y * H);
        for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x * W, s.points[i].y * H);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const t of texts ?? []) {
      const fs = Math.max(1, Math.round(t.size * W)); // size is a fraction of width (same as the editor)
      ctx.font = `700 ${fs}px Pretendard, system-ui, -apple-system, sans-serif`;
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x * W, t.y * H);
    }
    return canvas.toDataURL("image/jpeg", 0.92);
  } catch {
    return url; // fall back to the plain image
  }
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
  const att = getSongAttach(item.id);
  const note = att?.note;
  const memo = att?.memo;
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
      `<div style="margin:8px 0 0 38px;font-size:22px;line-height:1.25;color:#374151;">${formHtml(note)}</div>`
    );
  }
  if (memo) {
    parts.push(
      `<div style="margin:4px 0 0 38px;font-size:18px;color:#6b7280;white-space:pre-wrap;">${esc(memo)}</div>`
    );
  }
  if (firstSheet) {
    parts.push(`<div style="margin:12px 0 0 0;">${sheetOverlay(firstSheet.url)}</div>`);
  }

  el.innerHTML = parts.join("");
  return el;
}

/** A page that holds a single sheet image with its annotations. The song's memo
 *  repeats on every extra sheet so it stays visible when a song spans pages. */
function buildSheetEl(sheet: SheetImg, note?: string, memo?: string): HTMLDivElement {
  const el = document.createElement("div");
  if (note || memo) {
    const head =
      (note ? `<div style="margin:0 0 6px 0;font-size:22px;line-height:1.25;color:#374151;">${formHtml(note)}</div>` : "") +
      (memo ? `<div style="margin:0 0 10px 0;font-size:18px;color:#6b7280;white-space:pre-wrap;">${esc(memo)}</div>` : "");
    el.style.cssText = BASE_STYLE;
    el.innerHTML = head + sheetOverlay(sheet.url);
  } else {
    // no memo → edge-to-edge image (unchanged)
    el.style.cssText =
      `position:fixed;left:-99999px;top:0;width:${PX_W}px;background:#ffffff;color:#111827;font-family:'Pretendard',-apple-system,sans-serif;padding:0;box-sizing:border-box;`;
    el.innerHTML = sheetOverlay(sheet.url);
  }
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

  // make sure the annotation font is loaded before we rasterize text onto canvas
  try {
    await (document as any).fonts?.load?.("700 40px Pretendard");
    await (document as any).fonts?.ready;
  } catch {
    /* best-effort */
  }

  // resolve to (song, item, sheet images), reading attachments from the song store
  const entries: { song: Song; item: ContiItem; sheets: SheetImg[] }[] = [];
  for (const item of items) {
    const song = songById.get(item.id);
    if (!song) continue;
    const att = getSongAttach(item.id);
    const sheets: SheetImg[] = [];
    // export only the sheets for the key chosen in the conti (plus shared ones)
    const sheetIds = sheetsForKey(att, item.key);
    if (sheetIds.length) {
      const urls = await Promise.all(
        sheetIds.map((aid) => withTimeout(loadSheet(aid), 15000, undefined))
      );
      for (let idx = 0; idx < sheetIds.length; idx++) {
        const u = urls[idx];
        if (u)
          sheets.push({
            url: await compositeSheet(
              u,
              att?.sheetTexts?.[sheetIds[idx]],
              att?.sheetDraws?.[sheetIds[idx]]
            ),
          });
      }
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
      try {
        await renderPage(buildInfoEl(i, song, item, sheets[0], i === 0 ? playlistUrl : undefined), false);
      } catch (e) {
        console.error("[pdf] info page failed", i, e);
      }
      // remaining sheets: one per page so they're never shrunk together / cut
      const sheetAtt = getSongAttach(item.id);
      const note = sheetAtt?.note;
      const memo = sheetAtt?.memo;
      for (let k = 1; k < sheets.length; k++) {
        try {
          await renderPage(buildSheetEl(sheets[k], note, memo), true);
        } catch (e) {
          console.error("[pdf] sheet page failed", i, k, e);
        }
      }
    }

    if (!pageAdded) return null; // every page failed to render

    const blob = pdf.output("blob");
    const file = new File([blob], `${safeName(name)}.pdf`, { type: "application/pdf" });
    return { file, playlistUrl };
  } catch (e) {
    console.error("[pdf] build failed", e);
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
