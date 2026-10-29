// Songs the catalog lists twice under different titles. One of each pair is
// hidden once per user, like tapping 숨기기, so it can be restored from 숨긴 곡.
// Normally the second one goes; if only that one carries the user's own things
// (sheets, 송폼, memo, a conti, a favorite, a use date) the first goes instead,
// so nothing they added drops out of the list. A pair the user already sorted
// out (either one hidden) is left alone.
import { hideOnce, isHidden } from "./catalog";
import { getSongAttachStore } from "./songAttach";
import { getFavoriteIds } from "./useFavorites";
import { getContiState } from "./useConti";
import { getHistoryMap } from "./useHistory";

const PAIRS: [keep: string, hide: string][] = [
  ["b_skoeld", "b_1vu3abp"], // 주님 말씀하시면 / 말씀하시면
  ["b_wql4ly", "b_1vlhep6"], // 좋으신 하나님 인자와 자비 / 좋으신 하나님
  ["h_078", "b_bhyyzl"], // 오 놀라운 구세주 예수 내 주 / 오 놀라운 구세주
  ["c_zdzn0z", "c_1ev8li8"], // 당신은 시간을 뚫고 / 시간을 뚫고
  ["b_1q2tv26", "h_099"], // 아침 해가 돋을 때 / 아침 해 돋을 때 (552장)
];

function inUse(id: string): boolean {
  const attach = getSongAttachStore()[id];
  return (
    (!!attach && Object.keys(attach).length > 0) ||
    getFavoriteIds().includes(id) ||
    id in getHistoryMap() ||
    getContiState().contis.some((c) => c.items.some((it) => it.id === id))
  );
}

export function hideDuplicateSongs() {
  hideOnce(
    "hide-duplicates-1",
    PAIRS.filter(([a, b]) => !isHidden(a) && !isHidden(b)).map(([keep, hide]) =>
      inUse(hide) && !inUse(keep) ? keep : hide
    )
  );
}
