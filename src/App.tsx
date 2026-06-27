import { useEffect } from "react";
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "./lib/useTheme";
import { useConti } from "./lib/useConti";
import { useSongs } from "./lib/catalog";
import { getLastBrowse } from "./lib/browseState";
import { migrateFromContis } from "./lib/songAttach";
import { initSync } from "./lib/sync";
import AuthButton from "./components/AuthButton";
import Browse from "./views/Browse";
import Search from "./views/Search";
import Conti from "./views/Conti";
import Favorites from "./views/Favorites";
import SongDetail from "./views/SongDetail";
import EditSong from "./views/EditSong";
import Hidden from "./views/Hidden";

const TABS = [
  { to: "/conti", label: "콘티", icon: IconList, badge: true },
  { to: "/browse", label: "찬양목록", icon: IconGrid },
  { to: "/favorites", label: "즐겨찾기", icon: IconStar },
];

const FAITHS_URL = "https://csy870617.github.io/faiths/";

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const { conti } = useConti();
  const { songs } = useSongs();

  // start cloud sync, then migrate any legacy per-conti attachments onto songs
  // (after sync is listening so the migration is marked for upload)
  useEffect(() => {
    const cleanup = initSync();
    migrateFromContis();
    return cleanup;
  }, []);

  // detail / edit get a full-bleed screen on mobile (their own back button)
  const hideMobileChrome =
    location.pathname.startsWith("/song/") || location.pathname.startsWith("/edit");

  // 둘러보기 tab restores the last filters (recomputed each render on navigation)
  const browseTo = getLastBrowse();
  const tabTo = (to: string) => (to === "/browse" ? browseTo : to);

  // header / sidebar controls (shared)
  const controls = (
    <>
      <AuthButton />
      <button onClick={() => navigate("/edit")} aria-label="곡 추가" className="rounded-full p-1.5 text-slate-500 active:bg-slate-100 dark:text-slate-300 dark:active:bg-slate-800 md:hover:bg-slate-100 md:dark:hover:bg-slate-800">
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </button>
      <button onClick={toggle} aria-label="테마 전환" className="rounded-full p-1.5 text-slate-500 active:bg-slate-100 dark:text-slate-300 dark:active:bg-slate-800 md:hover:bg-slate-100 md:dark:hover:bg-slate-800">
        {theme === "dark" ? <IconSun /> : <IconMoon />}
      </button>
    </>
  );

  return (
    <div className="min-h-full bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      <div className="mx-auto flex w-full max-w-5xl">
        {/* Desktop sidebar */}
        {(
          <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-slate-100 px-3 py-4 dark:border-slate-800 md:flex">
            <button onClick={() => navigate("/browse")} className="mb-4 px-2 text-left">
              <span className="text-lg font-bold tracking-tight">Worship Leader</span>
              <span className="block text-xs text-slate-400 dark:text-slate-500">{songs.length}곡</span>
            </button>
            <nav className="flex flex-col gap-1">
              {TABS.map(({ to, label, icon: Icon, badge }) => (
                <NavLink
                  key={to}
                  to={tabTo(to)}
                  className={({ isActive }) =>
                    `relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                      isActive
                        ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"
                        : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    }`
                  }
                >
                  <Icon />
                  {label}
                  {badge && conti.length > 0 && (
                    <span className="ml-auto rounded-full bg-indigo-600 px-1.5 text-[11px] font-bold leading-5 text-white">
                      {conti.length}
                    </span>
                  )}
                </NavLink>
              ))}
              <a
                href={FAITHS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <IconHome />
                FAITHS
              </a>
            </nav>
            <div className="mt-auto flex items-center gap-2 px-1 pt-3">{controls}</div>
          </aside>
        )}

        {/* Content column */}
        <div className="flex min-h-screen w-full min-w-0 flex-1 flex-col md:border-x md:border-slate-100 md:dark:border-slate-800">
          {/* Mobile header */}
          {!hideMobileChrome && (
            <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-100 bg-white px-4 dark:border-slate-800 dark:bg-slate-900 md:hidden">
              <h1 className="text-base font-bold tracking-tight">Worship Leader</h1>
              <div className="flex items-center gap-2">
                {controls}
                <span className="text-xs text-slate-400 dark:text-slate-500">{songs.length}곡</span>
              </div>
            </header>
          )}

          <main className="flex-1 pb-20 md:pb-10">
            <Routes>
              <Route path="/" element={<Navigate to="/conti" replace />} />
              <Route path="/browse" element={<Browse />} />
              <Route path="/search" element={<Search />} />
              <Route path="/conti" element={<Conti />} />
              <Route path="/favorites" element={<Favorites />} />
              <Route path="/hidden" element={<Hidden />} />
              <Route path="/edit" element={<EditSong />} />
              <Route path="/edit/:id" element={<EditSong />} />
              <Route path="/song/:id" element={<SongDetail />} />
              {/* legacy deep links */}
              <Route path="/code" element={<Navigate to="/browse?axis=key" replace />} />
              <Route path="/theme" element={<Navigate to="/browse?axis=theme" replace />} />
              <Route path="/tempo" element={<Navigate to="/browse?axis=tempo" replace />} />
              <Route path="*" element={<Navigate to="/browse" replace />} />
            </Routes>
          </main>
        </div>
      </div>

      {/* Mobile bottom nav (always visible) */}
      {(
        <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-slate-100 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 md:hidden">
          {TABS.map(({ to, label, icon: Icon, badge }) => (
            <NavLink
              key={to}
              to={tabTo(to)}
              className={({ isActive }) =>
                `relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${
                  isActive ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400 dark:text-slate-500"
                }`
              }
            >
              <Icon />
              {label}
              {badge && conti.length > 0 && (
                <span className="absolute right-1/2 top-1.5 translate-x-3 rounded-full bg-indigo-600 px-1.5 text-[10px] font-bold leading-4 text-white">
                  {conti.length}
                </span>
              )}
            </NavLink>
          ))}
          <a
            href={FAITHS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium text-slate-400 dark:text-slate-500"
          >
            <IconHome />
            FAITHS
          </a>
        </nav>
      )}
    </div>
  );
}

function IconGrid() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6Zm0 9.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25Zm9.75-9.75A2.25 2.25 0 0 1 15.75 3.75H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6Zm0 9.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
    </svg>
  );
}
function IconList() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
    </svg>
  );
}
function IconStar() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.5a.56.56 0 0 1 1.04 0l2.02 4.9 5.28.43c.5.04.7.66.32.98l-4.02 3.45 1.23 5.16c.11.49-.42.87-.84.61L12 16.7l-4.53 2.74c-.42.26-.95-.12-.84-.61l1.23-5.16-4.02-3.45a.56.56 0 0 1 .32-.98l5.28-.43 2.02-4.9Z" />
    </svg>
  );
}
function IconHome() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.5a.75.75 0 0 0 .75.75h4.5a.75.75 0 0 0 .75-.75V15a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75v5.25a.75.75 0 0 0 .75.75h4.5a.75.75 0 0 0 .75-.75V9.75M8.25 21h8.25" />
    </svg>
  );
}
function IconSun() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
    </svg>
  );
}
function IconMoon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
    </svg>
  );
}
