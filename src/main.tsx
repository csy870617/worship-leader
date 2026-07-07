import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);

// Keep an installed PWA from getting stuck on a stale cached build. The service
// worker already uses skipWaiting + clientsClaim, so a new build activates and
// takes control immediately; we just need to (a) poll for it on launch and each
// time the app is refocused, and (b) reload once it takes over so the fresh
// assets are actually used. The `hadController` guard skips the reload on the
// very first install (when there was no controller yet).
if ("serviceWorker" in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .then((reg) => {
        reg.update();
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") reg.update();
        });
      })
      .catch(() => {
        /* registration failed — the app still works online */
      });
  });
}
