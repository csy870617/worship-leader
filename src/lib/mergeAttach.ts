import type { SongAttach } from "./songAttach";

type Store = Record<string, SongAttach>;

/**
 * Non-destructive merge of two song-attachment stores, used when two devices
 * changed the same account and their edits must be reconciled (first-login
 * union and both-dirty conflicts).
 *
 * The old merge replaced a song's whole attachment object with the local copy
 * (`{ ...remote, ...local }` keyed by song id). A stale device — one that never
 * received a memo another device added — would therefore ERASE that memo when
 * its conflicting copy won. This merges FIELD BY FIELD instead, so a value that
 * exists on only one side is always kept:
 *   • text fields (note / memo / youtube): keep the populated side; local wins
 *     only when both sides actually have a value (a real edit conflict).
 *   • sheets + their annotations: union, so a sheet added on either device
 *     survives.
 * Empty fields are absent in a sanitized store, so this biases hard toward
 * preserving data — the right trade-off for a worship memo that's painful to
 * lose. (Downstream sanitize drops any empties this reintroduces.)
 */
export function mergeAttach(local: Store, remote: Store): Store {
  const out: Store = {};
  const ids = new Set([...Object.keys(remote), ...Object.keys(local)]);
  for (const id of ids) {
    const la = local[id];
    const ra = remote[id];
    if (!la) {
      out[id] = ra;
      continue;
    }
    if (!ra) {
      out[id] = la;
      continue;
    }
    const sheets = [...new Set([...(ra.sheets ?? []), ...(la.sheets ?? [])])];
    const merged: SongAttach = {
      ...ra,
      ...la, // local wins for any field it actually has; remote-only fields survive
      // guard the text fields explicitly: a missing/empty local value must never
      // overwrite a populated remote one
      note: la.note ?? ra.note,
      memo: la.memo ?? ra.memo,
      youtube: la.youtube ?? ra.youtube,
      sheetTexts: { ...(ra.sheetTexts ?? {}), ...(la.sheetTexts ?? {}) },
      sheetDraws: { ...(ra.sheetDraws ?? {}), ...(la.sheetDraws ?? {}) },
    };
    if (sheets.length) merged.sheets = sheets;
    else delete merged.sheets;
    if (!Object.keys(merged.sheetTexts ?? {}).length) delete merged.sheetTexts;
    if (!Object.keys(merged.sheetDraws ?? {}).length) delete merged.sheetDraws;
    out[id] = merged;
  }
  return out;
}
