"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Downloads a PNG of the closest ancestor matching `target` (default: the
 * enclosing <section>). Elements marked data-snapshot-ignore are left out, so
 * the button itself is not in the picture.
 *
 * With `optional`, clicking opens a menu to take the picture with or without
 * the elements matching `optional.selector` (e.g. a column of codes).
 */
export function SnapshotButton({
  fileName,
  target = "section",
  optional,
}: {
  fileName: string;
  target?: string;
  optional?: { label: string; selector: string };
}) {
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function close(event: MouseEvent | KeyboardEvent) {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !wrapperRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menuOpen]);

  async function capture(includeOptional: boolean) {
    setMenuOpen(false);
    const node = wrapperRef.current?.closest<HTMLElement>(target);
    if (!node) return;
    setBusy(true);
    try {
      const { toPng } = await import("html-to-image");
      const url = await toPng(node, {
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        cacheBust: true,
        filter: (element) => {
          if (!(element instanceof HTMLElement)) return true;
          if (element.dataset.snapshotIgnore !== undefined) return false;
          return includeOptional || !optional || !element.matches(optional.selector);
        },
      });
      const suffix = optional && !includeOptional ? ` (no ${optional.label})` : "";
      const link = document.createElement("a");
      link.href = url;
      link.download = `${fileName.replace(/[\\/:*?"<>|]+/g, "-")}${suffix}.png`;
      link.click();
    } catch (error) {
      console.error("Snapshot failed:", error);
      window.alert("Could not create the image.");
    } finally {
      setBusy(false);
    }
  }

  const menuItem =
    "flex w-full items-center whitespace-nowrap rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-stone-700 hover:bg-stone-100 hover:text-stone-950";

  return (
    <span ref={wrapperRef} data-snapshot-ignore className="relative inline-flex">
      <button
        type="button"
        disabled={busy}
        onClick={() => (optional ? setMenuOpen((open) => !open) : void capture(true))}
        title="Download this box as an image"
        aria-label="Download this box as an image"
        aria-haspopup={optional ? "menu" : undefined}
        aria-expanded={optional ? menuOpen : undefined}
        className="inline-flex size-7 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-600 hover:bg-stone-100 hover:text-stone-950 disabled:opacity-50"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`size-4 ${busy ? "animate-pulse" : ""}`} aria-hidden="true">
          <path d="M4 8a2 2 0 0 1 2-2h1.5l1.5-2h6l1.5 2H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM12 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
        </svg>
      </button>
      {optional && menuOpen ? (
        <span role="menu" className="absolute right-0 top-full z-20 mt-1 w-40 rounded-lg border border-stone-200 bg-white p-1 shadow-lg">
          <button type="button" role="menuitem" className={menuItem} onClick={() => void capture(true)}>
            With {optional.label}
          </button>
          <button type="button" role="menuitem" className={menuItem} onClick={() => void capture(false)}>
            Without {optional.label}
          </button>
        </span>
      ) : null}
    </span>
  );
}
