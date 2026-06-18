// Remembers the most recent 둘러보기 filter/sort query so that navigating away
// (e.g. to 콘티) and back keeps the selection. In-memory only: it resets when
// the page is fully reloaded or closed, which is the desired behavior.
let lastBrowse = "/browse";

export function setLastBrowse(pathWithQuery: string) {
  lastBrowse = pathWithQuery;
}
export function getLastBrowse(): string {
  return lastBrowse;
}
