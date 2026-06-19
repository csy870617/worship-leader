// Sheet-music images are large, so they live in IndexedDB (not localStorage /
// the synced conti doc). Conti items only reference them by attachment id.
const DB = "wl-attachments";
const STORE = "sheets";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const newAid = () => "s_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export async function putSheet(dataUrl: string): Promise<string> {
  const id = newAid();
  const db = await openDB();
  try {
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(dataUrl, id);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } finally {
    db.close();
  }
  return id;
}

export async function getSheet(id: string): Promise<string | undefined> {
  const db = await openDB();
  try {
    return await new Promise<string | undefined>((res, rej) => {
      const tx = db.transaction(STORE, "readonly");
      const r = tx.objectStore(STORE).get(id);
      r.onsuccess = () => res(r.result as string | undefined);
      r.onerror = () => rej(r.error);
    });
  } finally {
    db.close();
  }
}

export async function deleteSheet(id: string): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((res) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => res();
      tx.onerror = () => res();
    });
  } finally {
    db.close();
  }
}

/** Read an image File, downscale it, and return a compact JPEG data URL. */
export async function fileToSheetDataUrl(
  file: File,
  max = 1600,
  quality = 0.82
): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("이미지를 불러올 수 없습니다"));
    i.src = dataUrl;
  });
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}
