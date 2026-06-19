import type { Song } from "../types";
import type { ContiItem } from "./useConti";
import { loadSheet } from "./attachments";

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

function safeName(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "conti";
}

/**
 * Render the conti (titles, keys, memos, sheet images, YouTube links) to a PDF
 * and open the native share sheet with the file. Falls back to a download.
 */
export async function shareContiPdf(
  name: string,
  items: ContiItem[],
  songById: Map<string, Song>
): Promise<"shared" | "downloaded" | "failed"> {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);

  // resolve sheet images up front (IndexedDB -> data URLs)
  const sheetsById = new Map<string, string[]>();
  await Promise.all(
    items.map(async (it) => {
      if (!it.sheets?.length) return;
      const urls = (await Promise.all(it.sheets.map((aid) => loadSheet(aid)))).filter(
        (u): u is string => !!u
      );
      if (urls.length) sheetsById.set(it.id, urls);
    })
  );

  // build an off-screen A4-width document
  const root = document.createElement("div");
  root.style.cssText =
    "position:fixed;left:-99999px;top:0;width:794px;background:#ffffff;color:#111827;" +
    "font-family:'Pretendard',-apple-system,sans-serif;padding:48px 44px;box-sizing:border-box;";

  const parts: string[] = [];
  parts.push(
    `<div style="border-bottom:2px solid #4f46e5;padding-bottom:12px;margin-bottom:20px;">
      <div style="font-size:13px;color:#6b7280;letter-spacing:1px;">WORSHIP LEADER · 콘티</div>
      <div style="font-size:26px;font-weight:800;margin-top:4px;">${esc(name)}</div>
      <div style="font-size:13px;color:#6b7280;margin-top:4px;">${items.length}곡</div>
    </div>`
  );

  items.forEach((it, i) => {
    const song = songById.get(it.id);
    if (!song) return;
    const keys = it.key ? it.key : song.keys.join(" / ");
    const yt = it.youtube?.trim();
    const imgs = sheetsById.get(it.id) ?? [];
    parts.push(`<div style="margin-bottom:26px;page-break-inside:avoid;">`);
    parts.push(
      `<div style="display:flex;align-items:baseline;gap:10px;">
        <span style="font-size:20px;font-weight:800;color:#c7d2fe;min-width:26px;">${i + 1}</span>
        <span style="font-size:20px;font-weight:700;">${esc(song.title)}</span>
        ${keys ? `<span style="font-size:14px;font-weight:700;color:#4f46e5;">${esc(keys)}</span>` : ""}
      </div>`
    );
    if (it.note) {
      parts.push(
        `<div style="margin:6px 0 0 36px;font-size:14px;color:#374151;">📝 ${esc(it.note)}</div>`
      );
    }
    if (yt) {
      parts.push(
        `<div style="margin:6px 0 0 36px;font-size:13px;color:#dc2626;word-break:break-all;">▶ ${esc(yt)}</div>`
      );
    }
    for (const url of imgs) {
      parts.push(
        `<div style="margin:10px 0 0 36px;"><img src="${url}" style="max-width:680px;width:100%;border:1px solid #e5e7eb;border-radius:6px;display:block;" /></div>`
      );
    }
    parts.push(`</div>`);
  });

  root.innerHTML = parts.join("");
  document.body.appendChild(root);

  try {
    // make sure every <img> has decoded before rasterizing
    const imgEls = Array.from(root.querySelectorAll("img"));
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

    const canvas = await html2canvas(root, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
    const pdf = new jsPDF("p", "mm", "a4");
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;
    const imgData = canvas.toDataURL("image/jpeg", 0.9);

    let heightLeft = imgH;
    let position = 0;
    pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
    heightLeft -= pageH;
    while (heightLeft > 0) {
      position -= pageH;
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
      heightLeft -= pageH;
    }

    const blob = pdf.output("blob");
    const file = new File([blob], `${safeName(name)}.pdf`, { type: "application/pdf" });

    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
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
  } finally {
    document.body.removeChild(root);
  }
}
