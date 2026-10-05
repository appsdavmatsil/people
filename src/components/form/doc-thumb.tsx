"use client";

import { useState } from "react";

const MAX_RETRIES = 2;

/**
 * Lazy-loaded document thumbnail that retries a couple of times on error (the
 * preview route can be rate limited when many load at once) and then shows a
 * plain placeholder instead of a broken image.
 */
export function DocThumb({
  fileId,
  label,
  className,
  size,
  version,
}: {
  fileId: string;
  label: string;
  className?: string;
  /** Thumbnail width in pixels (default 400, max 1600). */
  size?: number;
  /** Changes when the file is replaced, so cached thumbnails refresh. */
  version?: string | null;
}) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (failed) {
    return (
      <span className={`flex items-center justify-center bg-stone-100 text-stone-400 ${className ?? ""}`} title={`${label} (preview unavailable)`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5" />
        </svg>
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={attempt}
      src={`/api/staff-intake/file/${fileId}?thumb=1${size ? `&size=${size}` : ""}${version ? `&v=${encodeURIComponent(version)}` : ""}${attempt ? `&retry=${attempt}` : ""}`}
      alt={label}
      loading="lazy"
      decoding="async"
      onLoad={() => setLoaded(true)}
      onError={() => {
        if (attempt < MAX_RETRIES) {
          setTimeout(() => setAttempt((a) => a + 1), 800 * (attempt + 1) + Math.random() * 600);
        } else {
          setFailed(true);
        }
      }}
      className={`${className ?? ""} ${loaded ? "" : "animate-pulse bg-stone-200"}`}
    />
  );
}

/**
 * Full-size preview for any document type: images the browser can show render
 * as-is, PDFs open in the browser viewer, and everything else (Word, HEIC, …)
 * uses a large Drive-generated preview.
 */
export function DocPreview({
  fileId,
  fileName,
  label,
  version,
}: {
  fileId: string;
  fileName: string;
  label: string;
  version?: string | null;
}) {
  const src = `/api/staff-intake/file/${fileId}${version ? `?v=${encodeURIComponent(version)}` : ""}`;
  if (/\.(jpe?g|png|webp|gif|avif|bmp|svg)$/i.test(fileName)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={label} className="mx-auto block max-h-[80dvh] w-auto object-contain" />;
  }
  if (/\.pdf$/i.test(fileName)) {
    return <iframe src={src} title={label} className="h-[80dvh] w-full" />;
  }
  return <DocThumb fileId={fileId} label={label} size={1600} version={version} className="mx-auto block max-h-[80dvh] w-auto object-contain" />;
}
