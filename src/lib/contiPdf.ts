import type { Song } from "../types";
import type { ContiItem } from "./useConti";
import { loadSheet } from "./attachments";
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

/** Info page: number, title, key, memo, and (optionally) the first sheet. */
function buildInfoEl(
  index: number,
  song: Song,
  item: ContiItem,
  firstSheet?: string,
  playlistUrl?: string
): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = BASE_STYLE;

  const keys = item.key ? item.key : song.keys.join(" / ");
  const parts: string[] = [];

  // whole-conti playlist link, top-right (only passed for the very first page)
  if (playlistUrl) {
    parts.push(
      `<div style="text-align:right;margin-bottom:6px;"><a data-pdf-link href="${esc(playlistUrl)}" style="display:inline-flex;align-items:center;gap:6px;color:#dc2626;font-size:14px;font-weight:600;text-decoration:none;"><svg width="16" height="16" viewBox="0 0 24 24" fill="#dc2626"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.3 3.6-6.3 3.6Z"/></svg>플레이리스트</a></div>`
    );
  }
  parts.push(
    `<div style="display:flex;align-items:baseline;gap:10px;">
      <span style="font-size:22px;font-weight:800;color:#c7d2fe;min-width:28px;">${index + 1}</span>
      <span style="font-size:22px;font-weight:700;">${esc(song.title)}</span>
      ${keys ? `<span style="font-size:15px;font-weight:700;color:#4f46e5;">${esc(keys)}</span>` : ""}
    </div>`
  );
  if (item.note) {
    parts.push(
      `<div style="margin:8px 0 0 38px;font-size:14px;color:#374151;">${esc(item.note)}</div>`
    );
  }
  if (firstSheet) {
    parts.push(
      `<div style="margin:12px 0 0 0;"><img src="${firstSheet}" style="width:100%;display:block;" /></div>`
    );
  }

  el.innerHTML = parts.join("");
  return el;
}

/** A page that holds a single sheet image, edge to edge. */
function buildSheetEl(url: string): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText =
    `position:fixed;left:-99999px;top:0;width:${PX_W}px;background:#ffffff;padding:0;box-sizing:border-box;`;
  el.innerHTML = `<img src="${url}" style="width:100%;display:block;" />`;
  return el;
}

/**
 * Render the conti to a Letter-size PDF — one song per page, sheet images
 * scaled to fit, YouTube links kept clickable — then share or download it.
 */
export async function shareContiPdf(
  name: string,
  items: ContiItem[],
  songById: Map<string, Song>,
  mode: "share" | "download" = "share"
): Promise<"shared" | "downloaded" | "failed"> {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);

  // resolve to (song, item, sheet image urls), skipping missing songs
  const entries: { song: Song; item: ContiItem; urls: string[] }[] = [];
  for (const item of items) {
    const song = songById.get(item.id);
    if (!song) continue;
    let urls: string[] = [];
    if (item.sheets?.length) {
      urls = (await Promise.all(item.sheets.map((aid) => loadSheet(aid)))).filter(
        (u): u is string => !!u
      );
    }
    entries.push({ song, item, urls });
  }
  if (!entries.length) return "failed";

  const playlistUrl = youtubePlaylistUrl(items.map((it) => it.youtube)) ?? undefined;

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
      const { song, item, urls } = entries[i];
      // page 1: info + first sheet (+ playlist link on the very first page)
      await renderPage(buildInfoEl(i, song, item, urls[0], i === 0 ? playlistUrl : undefined), false);
      // remaining sheets: one per page so they're never shrunk together / cut
      for (let k = 1; k < urls.length; k++) {
        await renderPage(buildSheetEl(urls[k]), true);
      }
    }

    const blob = pdf.output("blob");
    const file = new File([blob], `${safeName(name)}.pdf`, { type: "application/pdf" });

    if (mode === "share" && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: name,
          // include the playlist link alongside the PDF
          ...(playlistUrl ? { text: `${name} 유튜브 재생목록\n${playlistUrl}` } : {}),
        });
        return "shared";
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return "shared";
        // otherwise fall through to download
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return "downloaded";
  } catch {
    return "failed";
  }
}
