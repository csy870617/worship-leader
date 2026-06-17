// Presentational: subscription lives in the parent so a single toggle doesn't
// re-render every row's button.
export default function AddToContiButton({
  active,
  onToggle,
  size = "md",
}: {
  active: boolean;
  onToggle: () => void;
  size?: "md" | "lg";
}) {
  const box = size === "lg" ? "h-7 w-7" : "h-5 w-5";

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      aria-label={active ? "콘티에서 빼기" : "콘티에 담기"}
      aria-pressed={active}
      className={`shrink-0 rounded-full p-1.5 active:bg-slate-100 dark:active:bg-slate-700 ${
        active ? "text-indigo-600 dark:text-indigo-400" : "text-slate-300 dark:text-slate-600"
      }`}
    >
      {active ? (
        <svg className={box} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      ) : (
        <svg className={box} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      )}
    </button>
  );
}
