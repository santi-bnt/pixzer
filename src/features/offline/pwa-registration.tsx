"use client";

import { useEffect } from "react";

export function PwaRegistration() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !window.isSecureContext ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    void navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch(() => {
        // PWA support is optional. The online application remains usable if
        // registration is unavailable or the worker cannot be installed.
      });
  }, []);

  return null;
}
