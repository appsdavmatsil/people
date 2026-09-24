"use client";

import { useEffect, useRef } from "react";

const iconButtonClass =
  "inline-flex size-8 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-950";

export function isArchived(item: { archived?: boolean }) {
  return item.archived === true;
}

export function ShowArchivedButton({
  show,
  count,
  onToggle,
}: {
  show: boolean;
  count: number;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="inline-flex h-9 items-center justify-center rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-stone-800 hover:bg-stone-50"
      aria-pressed={show}
      onClick={onToggle}
    >
      {show ? "Hide archived" : "Show archived"}
      {count > 0 ? <span className="ml-1.5 text-stone-500">{count}</span> : null}
    </button>
  );
}

export function RowActions({
  archived = false,
  onEdit,
  onArchive,
  onDelete,
  leading,
}: {
  archived?: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  leading?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-end gap-0.5">
      {leading}
      <IconButton label="Edit" onClick={onEdit}>
        <PencilIcon />
      </IconButton>
      <IconButton label={archived ? "Restore" : "Archive"} onClick={onArchive}>
        {archived ? <RestoreIcon /> : <ArchiveIcon />}
      </IconButton>
      <IconButton label="Delete" onClick={onDelete}>
        <TrashIcon />
      </IconButton>
    </div>
  );
}

export function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={iconButtonClass}
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

export function DeleteConfirmDialog({
  open,
  title,
  message,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const node = dialogRef.current;
    if (!node) {
      return;
    }

    if (open && !node.open) {
      node.showModal();
    }

    if (!open && node.open) {
      node.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="delete-confirm-title"
      className="m-auto h-fit w-[min(100%-2rem,28rem)] rounded-2xl border border-stone-200 bg-white p-0 text-stone-950 shadow-xl backdrop:bg-stone-950/40"
      onClose={onCancel}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <form
        className="flex flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm();
        }}
      >
        <div className="flex items-start gap-3 px-5 py-4">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-700">
            <TrashIcon />
          </span>
          <div>
            <h2 id="delete-confirm-title" className="text-base font-semibold tracking-tight">
              {title}
            </h2>
            <p className="mt-1 text-sm text-stone-500">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-stone-200 px-5 py-4">
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-stone-800 hover:bg-stone-50"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="inline-flex h-9 items-center justify-center rounded-lg bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800"
          >
            Delete
          </button>
        </div>
      </form>
    </dialog>
  );
}

export function DialogHeading({
  titleId,
  title,
  description,
  icon,
  onClose,
}: {
  titleId: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="flex shrink-0 items-start justify-between gap-4 border-b border-stone-200 px-5 py-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-700">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-semibold tracking-tight">
            {title}
          </h2>
          <p className="mt-1 text-sm text-stone-500">{description}</p>
        </div>
      </div>
      <button
        type="button"
        className="flex size-8 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-950"
        aria-label="Close"
        onClick={onClose}
      >
        <CloseIcon />
      </button>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M3 3l8 8M11 3 3 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function PencilIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
      <path
        d="M9.2 2.4 12.6 5.8M2.2 12.8l.4-2.6L10.4 2.4a1.2 1.2 0 0 1 1.7 0l.5.5a1.2 1.2 0 0 1 0 1.7L4.8 12.4l-2.6.4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ArchiveIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
      <path
        d="M2.2 3.2h10.6v2.1H2.2V3.2Zm.8 2.1h8.8v6.5H3V5.3Zm2.6 2.2h3.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
      <path
        d="M3 7.5A4.5 4.5 0 1 0 4.4 4.2M3 2.8v2.8h2.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
      <path
        d="M7.5 2.8v9.4M2.8 7.5h9.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
      <path
        d="M3.2 4.2h8.6M5.6 4.2V3h3.8v1.2M4.4 4.2l.5 8h5.2l.5-8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function HireIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
      <circle cx="6.2" cy="5" r="2.1" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M2.4 12.2c.7-1.8 2.1-2.7 3.8-2.7 1 0 1.9.3 2.6.9M11 7.2v4M9 9.2h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
