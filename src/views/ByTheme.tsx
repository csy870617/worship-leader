import BrowseView from "../components/BrowseView";
import { data, songs, byTheme } from "../data";

export default function ByTheme() {
  return (
    <BrowseView
      param="theme"
      all={songs}
      options={data.themes.map((t) => ({ value: t, label: t }))}
      filter={byTheme}
      groupHeaderLabel={(t) => t}
    />
  );
}
