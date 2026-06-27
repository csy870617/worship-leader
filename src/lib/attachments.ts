// Sheet-music images are large, so they live in IndexedDB (not localStorage /
// the synced conti doc). When Google Drive sync is on, the reference id is the
// Drive fileId and IndexedDB acts as an on-device cache; otherwise the id is a
// local-only attachment id.
import { deleteDriveFile, downloadSheet, driveEnabled, uploadSheet } from "./drive";

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

async function putSheetAt(id: string, dataUrl: string): Promise<void> {
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
}

/**
 * Save a picked image. With Drive sync on it uploads to the user's Drive and
 * returns the Drive fileId (caching locally for instant display); otherwise it
 * stores locally and returns a local id.
 */
export async function saveSheetFromFile(file: File, title: string): Promise<string> {
  const dataUrl = await fileToSheetDataUrl(file);
  if (driveEnabled()) {
    const stamp = new Date().toISOString().slice(0, 10);
    const fileId = await uploadSheet(dataUrl, `${(title || "악보").trim()} ${stamp}.jpg`);
    await putSheetAt(fileId, dataUrl);
    return fileId;
  }
  return putSheet(dataUrl);
}

/** Resolve an attachment id to a data URL (cache → silent Drive download). */
export async function loadSheet(id: string): Promise<string | undefined> {
  const cached = await getSheet(id);
  if (cached) return cached;
  if (driveEnabled()) {
    try {
      const dataUrl = await downloadSheet(id, false);
      await putSheetAt(id, dataUrl);
      return dataUrl;
    } catch {
      return undefined; // not cached and silent fetch failed → needs consent
    }
  }
  return undefined;
}

/** Force a Drive fetch with interactive consent (call from a user gesture). */
export async function fetchSheetInteractive(id: string): Promise<string | undefined> {
  const cached = await getSheet(id);
  if (cached) return cached;
  try {
    const dataUrl = await downloadSheet(id, true);
    await putSheetAt(id, dataUrl);
    return dataUrl;
  } catch {
    return undefined;
  }
}

/** Remove a sheet from the local cache and, when synced, from Drive too. */
export async function removeSheetEverywhere(id: string): Promise<void> {
  await deleteSheet(id);
  if (driveEnabled()) await deleteDriveFile(id);
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
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이미지를 처리할 수 없습니다");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}
