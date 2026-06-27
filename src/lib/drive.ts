// Sync sheet-music attachments to each user's own Google Drive using the
// non-sensitive `drive.file` scope (the app only ever sees files it created).
// Access tokens come from Google Identity Services (GIS); they're independent
// of the Firebase login but we pass the signed-in email as a hint so the same
// Google account is used.
import { auth } from "./firebase";

const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim();
const SCOPE = "https://www.googleapis.com/auth/drive.file";
const FOLDER_NAME = "Worship Leader";

declare global {
  interface Window {
    google?: any;
  }
}

/** Drive code is shipped, but only active when a client id is configured. */
export function driveConfigured(): boolean {
  return !!CLIENT_ID;
}
/** Drive sync only makes sense for a signed-in user. */
export function driveEnabled(): boolean {
  return !!CLIENT_ID && !!auth?.currentUser;
}

// ---- load the GIS script once ----
let gisPromise: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Google 인증 스크립트를 불러오지 못했어요"));
    document.head.appendChild(s);
  });
  return gisPromise;
}

// ---- access-token management ----
let tokenClient: any = null;
let token: string | null = null;
let tokenExp = 0;
let inflight: Promise<string> | null = null;

async function ensureClient() {
  await loadGis();
  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: () => {},
    });
  }
}

function requestToken(prompt: "" | "none"): Promise<string> {
  return new Promise((resolve, reject) => {
    ensureClient()
      .then(() => {
        tokenClient.callback = (resp: any) => {
          if (resp?.error) return reject(new Error(resp.error));
          token = resp.access_token;
          tokenExp = Date.now() + ((resp.expires_in ?? 3600) - 60) * 1000;
          resolve(token!);
        };
        tokenClient.error_callback = (err: any) => reject(new Error(err?.type || "auth_error"));
        tokenClient.requestAccessToken({ prompt, hint: auth?.currentUser?.email || undefined });
      })
      .catch(reject);
  });
}

async function getToken(interactive: boolean): Promise<string> {
  if (token && Date.now() < tokenExp) return token;
  if (inflight) return inflight;
  const p = (async () => {
    try {
      return await requestToken("none"); // silent first
    } catch {
      if (!interactive) throw new Error("drive_needs_consent");
      return await requestToken(""); // fall back to interactive consent
    }
  })();
  inflight = p;
  try {
    return await p;
  } finally {
    inflight = null;
  }
}

/** Trigger interactive Drive consent (call from a user gesture). */
export async function connectDrive(): Promise<boolean> {
  try {
    await getToken(true);
    return true;
  } catch {
    return false;
  }
}

// ---- Drive REST helpers ----
const folderKey = () => "wl.driveFolder:" + (auth?.currentUser?.uid || "_");

async function ensureFolder(): Promise<string> {
  const cached = localStorage.getItem(folderKey());
  if (cached) return cached;
  const t = await getToken(true);
  const q = `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`,
    { headers: { Authorization: `Bearer ${t}` } }
  );
  if (!r.ok) throw new Error("드라이브 폴더 조회 실패");
  const j = await r.json();
  let id: string | undefined = j.files?.[0]?.id;
  if (!id) {
    const cr = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }),
    });
    if (!cr.ok) throw new Error("드라이브 폴더 생성 실패");
    id = (await cr.json()).id;
  }
  if (!id) throw new Error("드라이브 폴더 생성 실패");
  localStorage.setItem(folderKey(), id);
  return id;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(",");
  const mime = /data:(.*?);base64/.exec(head)?.[1] || "image/jpeg";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(blob);
  });
}

async function uploadToFolder(dataUrl: string, name: string, folder: string): Promise<Response> {
  const t = await getToken(true);
  const blob = dataUrlToBlob(dataUrl);
  const metadata = { name, parents: [folder] };
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", blob);
  return fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
    { method: "POST", headers: { Authorization: `Bearer ${t}` }, body: form }
  );
}

export async function uploadSheet(dataUrl: string, name: string): Promise<string> {
  let r = await uploadToFolder(dataUrl, name, await ensureFolder());
  if (!r.ok) {
    // the cached folder may have been removed/trashed — recreate and retry once
    localStorage.removeItem(folderKey());
    r = await uploadToFolder(dataUrl, name, await ensureFolder());
  }
  if (!r.ok) throw new Error("드라이브 업로드 실패");
  return (await r.json()).id as string;
}

async function uploadBlobToFolder(blob: Blob, name: string, folder: string): Promise<Response> {
  const t = await getToken(true);
  const metadata = { name, parents: [folder] };
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", blob);
  return fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    { method: "POST", headers: { Authorization: `Bearer ${t}` }, body: form }
  );
}

/** Upload a file to Drive, make it readable by anyone with the link, and return
 *  that shareable link. Used as a PDF-share fallback for installed PWAs where
 *  file sharing is blocked. */
export async function uploadSharedFile(blob: Blob, name: string): Promise<string> {
  let r = await uploadBlobToFolder(blob, name, await ensureFolder());
  if (!r.ok) {
    localStorage.removeItem(folderKey());
    r = await uploadBlobToFolder(blob, name, await ensureFolder());
  }
  if (!r.ok) throw new Error("드라이브 업로드 실패");
  const created = await r.json();
  const id = created.id as string;
  const t = await getToken(true);
  // grant "anyone with the link" read access (allowed under drive.file for our own file)
  const pr = await fetch(`https://www.googleapis.com/drive/v3/files/${id}/permissions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });
  if (!pr.ok) {
    // link sharing is blocked (e.g. Workspace policy) — the link wouldn't be
    // openable by others, so don't hand back a dead link
    throw new Error("link_sharing_blocked");
  }
  let link: string | undefined = created.webViewLink;
  if (!link) {
    const gr = await fetch(
      `https://www.googleapis.com/drive/v3/files/${id}?fields=webViewLink`,
      { headers: { Authorization: `Bearer ${t}` } }
    );
    if (gr.ok) link = (await gr.json()).webViewLink;
  }
  return link || `https://drive.google.com/file/d/${id}/view`;
}

export async function downloadSheet(fileId: string, interactive = false): Promise<string> {
  const t = await getToken(interactive);
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    { headers: { Authorization: `Bearer ${t}` } }
  );
  if (!r.ok) throw new Error("드라이브 다운로드 실패");
  return blobToDataUrl(await r.blob());
}

export async function deleteDriveFile(fileId: string): Promise<void> {
  try {
    const t = await getToken(false);
    await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${t}` },
    });
  } catch {
    // best-effort; a leftover file in Drive is harmless
  }
}
