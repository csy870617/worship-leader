// Routes the Android/browser back button to transient UI — overlays (lightbox,
// conti viewer, crop modal) and floating popups (menus, confirm dialogs). Each
// registrant pushes a tagged history entry; a SINGLE global popstate listener
// sends a back press to the TOP registrant only, so nested popups close one at a
// time instead of all at once (or closing their parent).
import { useEffect, useRef } from "react";

type Entry = { onBack: () => void };
const stack: Entry[] = [];
let ignore = 0; // popstate events caused by our own history.back() to swallow
let seq = 0;
let listening = false;

function handlePop() {
  if (ignore > 0) {
    ignore--;
    return;
  }
  const top = stack.pop();
  top?.onBack();
}

/**
 * Register a dismissable popup/overlay with the back stack. Pushes a tagged
 * history entry and returns a `dismiss(popHistory)` to remove it:
 *  - `onBack` runs when the user presses back (the entry is already off history).
 *  - call the returned fn with `true` to close programmatically; it pops our
 *    history entry only if it's still on top — so navigating elsewhere (which
 *    replaces the top entry) never gets undone.
 */
export function registerBack(onBack: () => void): (popHistory: boolean) => void {
  if (!listening) {
    window.addEventListener("popstate", handlePop);
    listening = true;
  }
  const id = ++seq;
  const entry: Entry = { onBack };
  stack.push(entry);
  window.history.pushState({ __wlBack: id }, "");
  let removed = false;
  return (popHistory: boolean) => {
    if (removed) return;
    removed = true;
    const idx = stack.lastIndexOf(entry);
    if (idx !== -1) stack.splice(idx, 1);
    if (popHistory && (window.history.state as any)?.__wlBack === id) {
      ignore++;
      window.history.back();
    }
  };
}

/**
 * Hook: while `open`, the back button (and our history entry) will close the
 * popup via `onClose` instead of navigating away. Pair with a backdrop/outside
 * click for pointer dismissal.
 */
export function useBackDismiss(open: boolean, onClose: () => void) {
  const cb = useRef(onClose);
  cb.current = onClose;
  useEffect(() => {
    if (!open) return;
    const dismiss = registerBack(() => cb.current());
    return () => dismiss(true);
  }, [open]);
}
