import { useFavorites } from "../lib/useFavorites";

export default function FavoriteButton({
  id,
  size = "md",
}: {
  id: string;
  size?: "md" | "lg";
}) {
  const { isFavorite, toggle } = useFavorites();
  const active = isFavorite(id);
  const cls = size === "lg" ? "h-7 w-7" : "h-5 w-5";

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(id);
      }}
      aria-label={active ? "즐겨찾기 해제" : "즐겨찾기"}
      aria-pressed={active}
      className="shrink-0 rounded-full p-1.5 active:bg-slate-100 dark:active:bg-slate-700"
    >
      <svg
        className={`${cls} ${active ? "text-amber-400" : "text-slate-300 dark:text-slate-600"}`}
        viewBox="0 0 24 24"
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M11.48 3.5a.56.56 0 0 1 1.04 0l2.02 4.9 5.28.43c.5.04.7.66.32.98l-4.02 3.45 1.23 5.16c.11.49-.42.87-.84.61L12 16.7l-4.53 2.74c-.42.26-.95-.12-.84-.61l1.23-5.16-4.02-3.45a.56.56 0 0 1 .32-.98l5.28-.43 2.02-4.9Z"
        />
      </svg>
    </button>
  );
}
