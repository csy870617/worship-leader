import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { Song } from "../types";
import { sortKo } from "../data";
import ChipRow from "./ChipRow";
import SongList from "./SongList";

interface Option {
  value: string;
  label: string;
}

interface BrowseViewProps {
  /** chip options for this axis (keys / themes / tempos) */
  options: Option[];
  /** songs belonging to a given axis value */
  filter: (value: string) => Song[];
  /** full list shown when no value is selected */
  all: Song[];
  /** query-param name so the selection survives reloads & deep links */
  param: string;
  /** show the section header for the active value (used in grouped axes) */
  groupHeaderLabel?: (value: string) => string;
}

export default function BrowseView({
  options,
  filter,
  all,
  param,
  groupHeaderLabel,
}: BrowseViewProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const active = searchParams.get(param);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const o of options) m[o.value] = filter(o.value).length;
    return m;
  }, [options, filter]);

  const list = useMemo(() => {
    const src = active ? filter(active) : all;
    return [...src].sort(sortKo);
  }, [active, filter, all]);

  const select = (value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(param, value);
    else next.delete(param);
    setSearchParams(next, { replace: true });
  };

  return (
    <div>
      <div className="sticky top-14 z-10 border-b border-slate-100 bg-white/95 px-4 backdrop-blur">
        <ChipRow
          options={options.map((o) => ({ ...o, count: counts[o.value] }))}
          active={active}
          onSelect={select}
        />
      </div>
      <div className="px-4 py-2 text-xs text-slate-400">
        {active && groupHeaderLabel ? groupHeaderLabel(active) : "전체"} · {list.length}곡
      </div>
      <SongList songs={list} />
    </div>
  );
}
