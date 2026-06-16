import BrowseView from "../components/BrowseView";
import { data, songs, byKey } from "../data";

export default function ByCode() {
  return (
    <BrowseView
      param="key"
      all={songs}
      options={data.keys.map((k) => ({ value: k, label: k }))}
      filter={byKey}
      groupHeaderLabel={(k) => `${k} 코드`}
    />
  );
}
