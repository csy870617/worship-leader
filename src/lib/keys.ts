// Lightweight key-relationship helper for suggesting smooth worship transitions.
// We treat each song's notated key as a tonal center and score how naturally one
// key flows into another (same key, 4th/5th, step up for a lift, relative, ...).

const PITCH: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5,
  "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};

export function pitchClass(key: string): number | null {
  return key in PITCH ? PITCH[key] : null;
}

export interface Relation {
  score: number; // higher = smoother
  label: string;
}

/** Relationship from one key to another (0 = no notable relation). */
export function relation(from: string, to: string): Relation {
  const a = pitchClass(from);
  const b = pitchClass(to);
  if (a == null || b == null) return { score: 0, label: "" };
  const i = (((b - a) % 12) + 12) % 12;
  switch (i) {
    case 0: return { score: 4, label: "같은 키" };
    case 7: return { score: 3, label: "5도 위" };
    case 5: return { score: 3, label: "4도 위" };
    case 2: return { score: 2, label: "온음 위 (고조)" };
    case 1: return { score: 2, label: "반음 위 (고조)" };
    case 9: return { score: 1, label: "단3도 아래" };
    case 3: return { score: 1, label: "단3도 위" };
    case 10: return { score: 1, label: "온음 아래" };
    default: return { score: 0, label: "" };
  }
}

/** Best relation between two songs that may each carry several keys. */
export function bestRelation(fromKeys: string[], toKeys: string[]): Relation {
  let best: Relation = { score: 0, label: "" };
  for (const f of fromKeys) {
    for (const t of toKeys) {
      const r = relation(f, t);
      if (r.score > best.score) best = r;
    }
  }
  return best;
}
