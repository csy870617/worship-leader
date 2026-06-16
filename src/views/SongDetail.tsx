import { Link, useNavigate, useParams } from "react-router-dom";
import { songById } from "../data";
import { TEMPO_LABEL } from "../types";
import { KeyBadge, TempoBadge } from "../components/Badges";

export default function SongDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const song = songById.get(Number(id));

  if (!song) {
    return (
      <div className="px-4 py-16 text-center">
        <p className="text-slate-500">곡을 찾을 수 없습니다.</p>
        <Link to="/code" className="mt-3 inline-block text-indigo-600">
          목록으로
        </Link>
      </div>
    );
  }

  return (
    <div className="px-4 py-5">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 active:text-slate-700"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path
            fillRule="evenodd"
            d="M12.79 5.23a.75.75 0 0 1-.02 1.06L8.832 10l3.938 3.71a.75.75 0 1 1-1.04 1.08l-4.5-4.25a.75.75 0 0 1 0-1.08l4.5-4.25a.75.75 0 0 1 1.06.02Z"
            clipRule="evenodd"
          />
        </svg>
        뒤로
      </button>

      <h1 className="text-2xl font-bold leading-snug text-slate-900">{song.title}</h1>

      <div className="mt-5 space-y-5">
        <Field label="코드">
          {song.keys.length ? (
            <div className="flex flex-wrap gap-1.5">
              {song.keys.map((k) => (
                <KeyBadge key={k} k={k} />
              ))}
            </div>
          ) : (
            <Empty />
          )}
        </Field>

        <Field label="템포">
          {song.tempos.length ? (
            <div className="flex flex-wrap gap-1.5">
              {song.tempos.map((t) => (
                <TempoBadge key={t} t={t} />
              ))}
            </div>
          ) : (
            <Empty />
          )}
        </Field>

        <Field label="주제">
          {song.themes.length ? (
            <div className="flex flex-wrap gap-1.5">
              {song.themes.map((t) => (
                <Link
                  key={t}
                  to={`/theme?theme=${encodeURIComponent(t)}`}
                  className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 active:bg-slate-200"
                >
                  {t}
                </Link>
              ))}
            </div>
          ) : (
            <Empty />
          )}
        </Field>

        {song.hymnNo != null && (
          <Field label="새찬송가">
            <span className="text-slate-700">{song.hymnNo}장</span>
          </Field>
        )}
      </div>

      <p className="mt-8 text-xs leading-relaxed text-slate-400">
        템포 분류: {Object.values(TEMPO_LABEL).join(" · ")}. 데이터는 인도자 시트
        스냅샷 기준입니다.
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      {children}
    </div>
  );
}

function Empty() {
  return <span className="text-sm text-slate-300">—</span>;
}
