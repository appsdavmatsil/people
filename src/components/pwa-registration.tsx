"use client";

import { useEffect } from "react";

export function PwaRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    const { hostname } = window.location;
    const localDevelopment =
      process.env.NODE_ENV !== "production" ||
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "127.0.0.1";
    if (localDevelopment) {
      void navigator.serviceWorker.getRegistrations().then((registrations) =>
        Promise.all(
          registrations
            .filter((registration) => registration.scope.startsWith(window.location.origin))
            .map((registration) => registration.unregister()),
        ),
      );
      if ("caches" in window) {
        void caches.keys().then((keys) =>
          Promise.all(
            keys.filter((key) => key.startsWith("people-shell-")).map((key) => caches.delete(key)),
          ),
        );
      }
      return;
    }

    let reloading = false;

    function onControllerChange() {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    }

    function register() {
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((registration) => registration.update())
        .catch(() => undefined);
    }

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    if (document.readyState === "complete") {
      register();
      return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    }

    window.addEventListener("load", register, { once: true });
    return () => {
      window.removeEventListener("load", register);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
