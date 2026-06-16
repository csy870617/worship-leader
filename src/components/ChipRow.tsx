interface ChipRowProps {
  options: { value: string; label: string; count?: number }[];
  active: string | null;
  onSelect: (value: string | null) => void;
  allLabel?: string;
}

export default function ChipRow({ options, active, onSelect, allLabel = "전체" }: ChipRowProps) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-3">
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
