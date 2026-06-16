import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useConti } from "../lib/useConti";
import { songById } from "../data";
import { bestRelation } from "../lib/keys";

export default function Stage() {
  const { conti } = useConti();
  const navigate = useNavigate();
  const [idx, setIdx] = useState(0);

  const rows = conti.map((c) => songById.get(c.id)!).filter(Boolean);

  if (rows.length === 0) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-slate-400">콘티가 비어 있습니다.</p>
        <button onClick={() => navigate("/conti")} className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white">
          콘티로 가기
        </button>
      </div>
    );
  }

  const i = Math.min(idx, rows.length - 1);
  const song = rows[i];
  const note = conti[i]?.note;
  const next = i < rows.length - 1 ? rows[i + 1] : null;
  const rel = next ? bestRelation(song.keys, next.keys) : null;
  const go = (d: number) => setIdx((p) => Math.max(0, Math.min(rows.length - 1, p + d)));

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-white">
      {/* top bar */}
      <div className="flex items-center justify-between px-5 py-4">
        <span className="text-sm text-slate-400">{i + 1} / {rows.length}</span>
        <button onClick={() => navigate("/conti")} aria-label="닫기" className="rounded-full p-1.5 text-slate-400 active:bg-white/10">
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
        </button>
      </div>

      {/* tap zones for prev / next */}
      <div className="relative flex flex-1 items-center justify-center px-6">
        <button aria-label="이전" onClick={() => go(-1)} className="absolute inset-y-0 left-0 w-1/3" />
        <button aria-label="다음" onClick={() => go(1)} className="absolute inset-y-0 right-0 w-2/3" />
        <div className="pointer-events-none text-center">
          <div className="flex flex-wrap justify-center gap-2">
            {song.keys.map((k) => (
              <span key={k} className="rounded-lg bg-indigo-600 px-3 py-1 text-2xl font-black">{k}</span>
            ))}
          </div>
          <h1 className="mt-6 text-4xl font-black leading-tight">{song.title}</h1>
          {note && <p className="mt-4 text-lg text-amber-300">{note}</p>}
          {next && (
            <p className="mt-10 text-sm text-slate-500">
              다음 ▸ {next.title} <span className="text-slate-400">({next.keys.join("/")}{rel?.label ? ` · ${rel.label}` : ""})</span>
            </p>
          )}
        </div>
      </div>

      {/* bottom controls */}
      <div className="flex items-center justify-between px-6 py-6">
        <button onClick={() => go(-1)} disabled={i === 0} className="rounded-full bg-white/10 px-6 py-3 text-lg font-semibold disabled:opacity-30">이전</button>
        <button onClick={() => go(1)} disabled={i === rows.length - 1} className="rounded-full bg-white/10 px-6 py-3 text-lg font-semibold disabled:opacity-30">다음</button>
      </div>
    </div>
  );
}
