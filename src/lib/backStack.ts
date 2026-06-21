// Routes the Android/browser back button to overlays (lightbox, conti viewer,
// crop modal, …). Each overlay pushes a history entry on open; a SINGLE global
// popstate listener sends a back press to the TOP overlay only — so nested
// overlays don't all close at once when one back is pressed.

type Entry = { onBack: () => void };
const stack: Entry[] = [];
let ignore = 0; // popstate events caused by our own history.back() to swallow
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
 * Register an overlay with the back stack. Pushes a history entry and returns a
 * `dismiss(popHistory)` to remove it:
 *  - `onBack` runs when the user presses back (the history entry is already gone).
 *  - call the returned fn with `true` to close programmatically (also pops history),
 *    or `false` on unmount cleanup without touching history.
 */
export function registerBack(onBack: () => void): (popHistory: boolean) => void {
  if (!listening) {
    window.addEventListener("popstate", handlePop);
    listening = true;
  }
  const entry: Entry = { onBack };
  stack.push(entry);
  window.history.pushState({ wlOverlay: true }, "");
  let removed = false;
  return (popHistory: boolean) => {
    if (removed) return;
    removed = true;
    const idx = stack.lastIndexOf(entry);
    if (idx !== -1) stack.splice(idx, 1);
    if (popHistory) {
      ignore++;
      window.history.back();
    }
  };
}
