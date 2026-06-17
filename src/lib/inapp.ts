// Google blocks OAuth inside embedded/in-app browsers (WebViews) with
// "disallowed_useragent". Detect those so we can guide the user to a real
// browser instead of showing a broken Google login button.
export function isInAppBrowser(): boolean {
  const ua = navigator.userAgent || "";
  return /KAKAOTALK|FBAN|FBAV|FB_IAB|Instagram|Line\/|NAVER|DaumApps|everytimeApp|band_|kakaostory|Snapchat|Twitter|Threads/i.test(
    ua
  );
}

/**
 * Best-effort: jump out to the system browser.
 * Returns true if it triggered an app-specific external-open scheme.
 */
export function tryOpenExternal(): boolean {
  const ua = navigator.userAgent || "";
  const url = location.href;
  if (/KAKAOTALK/i.test(ua)) {
    location.href = "kakaotalk://web/openExternal?url=" + encodeURIComponent(url);
    return true;
  }
  if (/Line\//i.test(ua)) {
    location.href = url + (url.includes("?") ? "&" : "?") + "openExternalBrowser=1";
    return true;
  }
  return false;
}
