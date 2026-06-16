import BrowseView from "../components/BrowseView";
import { data, songs, byTempo } from "../data";
import { TEMPO_LABEL } from "../types";

export default function ByTempo() {
  return (
    <BrowseView
      param="tempo"
      all={songs}
      options={data.tempos.map((t) => ({ value: t, label: TEMPO_LABEL[t] }))}
      filter={byTempo}
      groupHeaderLabel={(t) => TEMPO_LABEL[t as keyof typeof TEMPO_LABEL]}
    />
  );
}
