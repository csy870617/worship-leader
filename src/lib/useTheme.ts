import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const KEY = "wl.theme";

function getInitial(): Theme {
  // storage can throw (blocked site data): that must not take the app down
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch {
    /* fall back to the OS setting */
  }
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitial);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* not persisted — the theme still applies for this visit */
    }
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));
  return { theme, toggle };
}
