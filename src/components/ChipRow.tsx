import { useEffect, useRef } from "react";

interface ChipRowProps {
  options: { value: string; label: string; count?: number }[];
  active: string | null;
  onSelect: (value: string | null) => void;
  allLabel?: string;
}

export default function ChipRow({ options, active, onSelect, allLabel = "전체" }: ChipRowProps) {
  const ref = useRef<HTMLDivElement>(null);

  // let a vertical mouse wheel scroll the chip row horizontally (desktop)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0 || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      // only intercept when we can actually scroll in that direction
      if ((e.deltaY < 0 && el.scrollLeft > 0) || (e.deltaY > 0 && el.scrollLeft < max)) {
        el.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div ref={ref} className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-3">
      <Chip label={allLabel} selected={active === null} onClick={() => onSelect(null)} />
      {options.map((o) => (
        <Chip
          key={o.value}
          label={o.count != null ? `${o.label} ${o.count}` : o.label}
          selected={active === o.value}
          onClick={() => onSelect(o.value)}
        />
      ))}
    </div>
  );
}

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition ${
        selected
          ? "bg-indigo-600 text-white"
          : "bg-slate-100 text-slate-600 active:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:active:bg-slate-700"
      }`}
    >
      {label}
    </button>
  );
}
