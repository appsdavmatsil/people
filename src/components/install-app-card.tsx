"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Image from "next/image";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

export function InstallAppCard() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [appInstalled, setAppInstalled] = useState(false);
  const [copied, setCopied] = useState(false);
  const standalone = useSyncExternalStore(subscribeToDisplayMode, isStandalone, () => false);
  const isIos = useSyncExternalStore(
    () => () => undefined,
    () => /iphone|ipad|ipod/i.test(navigator.userAgent),
    () => false,
  );
  const installed = standalone || appInstalled;

  useEffect(() => {
    function onInstallPrompt(event: Event) {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    }

    function onInstalled() {
      setAppInstalled(true);
      setPrompt(null);
    }

    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") {
      setAppInstalled(true);
      setPrompt(null);
    }
  }

  async function share() {
    const shareData = {
      title: "Install People",
      text: "Install the People staff management app on your phone.",
      url: window.location.href,
    };

    if (navigator.share) {
      await navigator.share(shareData).catch(() => undefined);
      return;
    }

    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-6 shadow-xl shadow-stone-950/10 sm:p-8">
      <div className="flex items-center gap-4">
        <Image
          src="/icons/apple-touch-icon.png"
          alt="People app icon"
          width={80}
          height={80}
          className="size-20 rounded-[1.4rem] shadow-md"
        />
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-emerald-800 uppercase">People</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-stone-950">Install the app</h1>
          <p className="mt-1 text-sm text-stone-500">Fast, full-screen staff management.</p>
        </div>
      </div>

      {installed ? (
        <div className="mt-6 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
          People is installed on this device. Open it from your Home Screen or app launcher.
        </div>
      ) : prompt ? (
        <button
          type="button"
          onClick={install}
          className="mt-6 flex h-12 w-full items-center justify-center rounded-xl bg-stone-950 px-4 text-sm font-semibold text-white hover:bg-stone-800"
        >
          Install People
        </button>
      ) : null}

      <section className="mt-6 border-t border-stone-200 pt-6">
        <h2 className="font-semibold text-stone-950">
          {isIos ? "Install on iPhone or iPad" : "Install on your phone"}
        </h2>
        <ol className="mt-3 space-y-3 text-sm text-stone-600">
          <li className="flex gap-3">
            <Step number="1" />
            <span>Open this page in {isIos ? "Safari" : "your phone browser"}.</span>
          </li>
          <li className="flex gap-3">
            <Step number="2" />
            <span>{isIos ? "Tap the Share button in Safari." : "Open the browser menu."}</span>
          </li>
          <li className="flex gap-3">
            <Step number="3" />
            <span>
              Choose <strong className="font-semibold text-stone-900">Add to Home Screen</strong>
              {isIos ? ", then tap Add." : " or Install app."}
            </span>
          </li>
        </ol>
      </section>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={share}
          className="h-11 rounded-xl border border-stone-300 bg-white px-3 text-sm font-medium text-stone-900 hover:bg-stone-50"
        >
          Share install link
        </button>
        <button
          type="button"
          onClick={copyLink}
          className="h-11 rounded-xl border border-stone-300 bg-white px-3 text-sm font-medium text-stone-900 hover:bg-stone-50"
        >
          {copied ? "Link copied" : "Copy link"}
        </button>
      </div>

      <a href="/dashboard" className="mt-5 block text-center text-sm font-medium text-emerald-800 hover:text-emerald-950">
        Continue to People
      </a>
    </div>
  );
}

function subscribeToDisplayMode(onChange: () => void) {
  const query = window.matchMedia("(display-mode: standalone)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function Step({ number }: { number: string }) {
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-stone-950 text-xs font-semibold text-white">
      {number}
    </span>
  );
}
