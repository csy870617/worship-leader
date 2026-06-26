import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { data } from "../data";
import {
  addSong,
  getSongById,
  isOverridden,
  isUserSong,
  removeSong,
  resetOverride,
  updateSong,
} from "../lib/catalog";
import { TEMPO_LABEL, type Tempo } from "../types";

const KEY_CHOICES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

// remount the form when the route id changes so stale state can't carry over
export default function EditSong() {
  const { id } = useParams();
  return <EditSongForm key={id ?? "new"} id={id} />;
}

function EditSongForm({ id }: { id?: string }) {
  const navigate = useNavigate();
  const editing = id != null;
  const existing = editing ? getSongById(id) : undefined;

  const [title, setTitle] = useState(existing?.title ?? "");
  const [keys, setKeys] = useState<string[]>(existing?.keys ?? []);
  const [tempos, setTempos] = useState<Tempo[]>(existing?.tempos ?? []);
  const [themes, setThemes] = useState<string[]>(existing?.themes ?? []);
  const [hymnNo, setHymnNo] = useState(existing?.hymnNo != null ? String(existing.hymnNo) : "");
  const [isHymn, setIsHymn] = useState(existing?.isHymn === true);

  if (editing && !existing) {
    return (
      <div className="px-4 py-16 text-center text-slate-500 dark:text-slate-400">
        곡을 찾을 수 없습니다.
      </div>
    );
  }
  const userSong = editing ? isUserSong(id!) : false;

  const toggle = <T,>(arr: T[], v: T, set: (x: T[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const save = () => {
    const t = title.trim();
    if (!t) {
      alert("곡 제목을 입력해 주세요.");
      return;
    }
    const input = {
      title: t,
      keys,
      tempos,
      themes,
      hymnNo: hymnNo.trim() ? Number(hymnNo.trim()) : null,
      isHymn,
    };
    if (editing && existing) {
      updateSong(existing.id, input);
      navigate(`/song/${existing.id}`, { replace: true });
    } else {
      const song = addSong(input);
      navigate(`/song/${song.id}`, { replace: true });
    }
  };

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-sm font-medium ${
      active
        ? "bg-indigo-600 text-white"
        : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
    }`;

  return (
    <div className="px-4 py-5">
      <div className="mb-4 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="text-sm text-slate-500 dark:text-slate-400">
          취소
        </button>
        <h1 className="text-base font-bold">{editing ? "곡 수정" : "곡 추가"}</h1>
        <button onClick={save} className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
          저장
        </button>
      </div>

      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          제목 *
        </span>
        <input
          autoFocus={!editing}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="곡 제목"
          className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-base text-slate-900 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
      </label>

      <Section label="코드">
        <div className="flex flex-wrap gap-2">
          {KEY_CHOICES.map((k) => (
            <button key={k} onClick={() => toggle(keys, k, setKeys)} className={chip(keys.includes(k))}>
              {k}
            </button>
          ))}
        </div>
      </Section>

      <Section label="템포">
        <div className="flex flex-wrap gap-2">
          {data.tempos.map((t) => (
            <button key={t} onClick={() => toggle(tempos, t, setTempos)} className={chip(tempos.includes(t))}>
              {TEMPO_LABEL[t]}
            </button>
          ))}
        </div>
      </Section>

      <Section label="주제">
        <div className="flex flex-wrap gap-2">
          {data.themes.map((t) => (
            <button key={t} onClick={() => toggle(themes, t, setThemes)} className={chip(themes.includes(t))}>
              {t}
            </button>
          ))}
        </div>
      </Section>

      <Section label="찬송가">
        <button
          onClick={() => setIsHymn((v) => !v)}
          className={chip(isHymn)}
        >
          {isHymn ? "찬송가로 분류됨" : "찬송가 아님"}
        </button>
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
          켜면 둘러보기 <b>분류</b> 탭에서 <b>찬송가</b>로 분류됩니다(끄면 CCM).
        </p>
      </Section>

      <Section label="새찬송가 번호 (선택)">
        <input
          value={hymnNo}
          onChange={(e) => setHymnNo(e.target.value.replace(/[^0-9]/g, ""))}
          inputMode="numeric"
          placeholder="예: 305"
          className="w-32 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-base text-slate-900 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
      </Section>

      {editing && existing && userSong && (
        <button
          onClick={() => {
            if (confirm("이 곡을 삭제할까요?")) {
              removeSong(existing.id);
              navigate("/browse", { replace: true });
            }
          }}
          className="mt-8 w-full rounded-lg border border-rose-200 py-2.5 text-sm font-semibold text-rose-500 dark:border-rose-500/30"
        >
          곡 삭제
        </button>
      )}

      {editing && existing && !userSong && isOverridden(existing.id) && (
        <button
          onClick={() => {
            if (confirm("수정 내용을 지우고 원래대로 되돌릴까요?")) {
              resetOverride(existing.id);
              navigate(`/song/${existing.id}`, { replace: true });
            }
          }}
          className="mt-8 w-full rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300"
        >
          원래대로 되돌리기
        </button>
      )}

      <p className="mt-6 text-xs leading-relaxed text-slate-400 dark:text-slate-500">
        {userSong
          ? "추가한 곡은 이 브라우저에 저장되며 둘러보기·검색·콘티에 함께 나타납니다."
          : "수정 내용은 내 계정/브라우저에만 저장됩니다(원본은 그대로). 로그인 시 동기화됩니다."}
      </p>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </p>
      {children}
    </div>
  );
}
