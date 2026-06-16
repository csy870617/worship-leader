import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { songs } from "./data";
import ByCode from "./views/ByCode";
import ByTheme from "./views/ByTheme";
import ByTempo from "./views/ByTempo";
import Search from "./views/Search";
import SongDetail from "./views/SongDetail";

const TABS = [
  { to: "/code", label: "코드별", icon: IconKey },
  { to: "/theme", label: "주제별", icon: IconTag },
  { to: "/tempo", label: "템포별", icon: IconBeat },
  { to: "/search", label: "검색", icon: IconSearch },
];

export default function App() {
  const location = useLocation();
  const isDetail = location.pathname.startsWith("/song/");

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col bg-white text-slate-900">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-100 bg-white px-4">
        <h1 className="text-base font-bold tracking-tight">찬양 곡 모음</h1>
        <span className="text-xs text-slate-400">{songs.length}곡</span>
      </header>

      <main className="flex-1 pb-20">
        <Routes>
          <Route path="/" element={<Navigate to="/code" replace />} />
          <Route path="/code" element={<ByCode />} />
          <Route path="/theme" element={<ByTheme />} />
          <Route path="/tempo" element={<ByTempo />} />
          <Route path="/search" element={<Search />} />
          <Route path="/song/:id" element={<SongDetail />} />
          <Route path="*" element={<Navigate to="/code" replace />} />
        </Routes>
      </main>

      {!isDetail && (
        <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-md border-t border-slate-100 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          {TABS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium ${
                  isActive ? "text-indigo-600" : "text-slate-400"
                }`
              }
            >
              <Icon />
              {label}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}

function IconKey() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H9v1.5H7.5v1.5H6v1.5H3.75a.75.75 0 0 1-.75-.75v-2.69c0-.2.078-.39.22-.53l6.638-6.638c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" />
    </svg>
  );
}
function IconTag() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" />
    </svg>
  );
}
function IconBeat() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h3l2-7 4 14 2-7h3" />
    </svg>
  );
}
function IconSearch() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
    </svg>
  );
}
