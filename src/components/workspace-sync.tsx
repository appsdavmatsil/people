"use client";

import { useEffect } from "react";
import { profileAvatarEvent, profileAvatarKey } from "@/lib/profile-avatar";
import { createClient } from "@/lib/supabase/client";
import { workspaceDocuments } from "@/lib/workspace-documents";

const avatarKey = "avatar";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function pendingKey(key: string) {
  return `people.sync-pending.${key}`;
}

type DocumentRow = {
  doc_key: string;
  payload: string;
  updated_at: string;
};

export function WorkspaceSync({ userId }: { userId: string }) {
  useEffect(() => {
    if (!userId) {
      return;
    }

    const supabase = createClient();
    let cancelled = false;
    let workspaceId: string | null = null;
    let suppress = false;
    const dirty = new Set<string>();
    const seen = new Map<string, string>();
    const timers = new Map<string, number>();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    function readLocal(key: string) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    }

    function isPending(key: string) {
      return readLocal(pendingKey(key)) === "1";
    }

    function markPending(key: string) {
      try {
        window.localStorage.setItem(pendingKey(key), "1");
      } catch {
        // The in-memory dirty set still covers this visit.
      }
    }

    function clearPending(key: string) {
      try {
        window.localStorage.removeItem(pendingKey(key));
      } catch {
        // The next visit will try the upload again.
      }
    }

    function applyRemote(key: string, payload: string) {
      const document = workspaceDocuments.find((item) => item.key === key);
      if (!document || readLocal(key) === payload) {
        return;
      }

      suppress = true;
      try {
        window.localStorage.setItem(key, payload);
        window.dispatchEvent(new Event(document.event));
      } finally {
        suppress = false;
      }
    }

    function applyAvatar(photo: string) {
      const key = profileAvatarKey(userId);
      if (readLocal(key) === photo) {
        return;
      }

      suppress = true;
      try {
        window.localStorage.setItem(key, photo);
        window.dispatchEvent(new Event(profileAvatarEvent));
      } finally {
        suppress = false;
      }
    }

    async function pushDocument(key: string) {
      if (!workspaceId || cancelled) {
        return;
      }

      const payload = readLocal(key);
      if (!payload) {
        return;
      }

      const { data, error } = await supabase
        .from("workspace_documents")
        .upsert(
          { workspace_id: workspaceId, doc_key: key, payload },
          { onConflict: "workspace_id,doc_key" },
        )
        .select("doc_key, updated_at")
        .maybeSingle();

      if (error) {
        markPending(key);
        console.error(`Could not sync ${key}.`, error.message);
        return;
      }

      if (data?.updated_at) {
        seen.set(data.doc_key, data.updated_at);
      }
      if (readLocal(key) === payload) {
        dirty.delete(key);
        clearPending(key);
      }
    }

    async function pushAvatar() {
      const photo = readLocal(profileAvatarKey(userId));
      if (!photo || cancelled) {
        return;
      }

      const { error } = await supabase.from("users").update({ avatar: photo }).eq("id", userId);
      if (error) {
        markPending(avatarKey);
        console.error("Could not sync the profile picture.", error.message);
        return;
      }

      if (readLocal(profileAvatarKey(userId)) === photo) {
        dirty.delete(avatarKey);
        clearPending(avatarKey);
      }
    }

    function schedule(key: string, push: () => Promise<void>) {
      window.clearTimeout(timers.get(key));
      timers.set(
        key,
        window.setTimeout(() => {
          timers.delete(key);
          void push();
        }, 250),
      );
    }

    function onDocumentEvent(event: Event) {
      if (suppress) {
        return;
      }

      const document = workspaceDocuments.find((item) => item.event === event.type);
      if (!document) {
        return;
      }

      dirty.add(document.key);
      markPending(document.key);
      schedule(document.key, () => pushDocument(document.key));
    }

    function onAvatar() {
      if (suppress) {
        return;
      }

      dirty.add(avatarKey);
      markPending(avatarKey);
      schedule(avatarKey, pushAvatar);
    }

    async function pullDocuments() {
      if (!workspaceId || cancelled) {
        return;
      }

      const { data: stamps, error } = await supabase
        .from("workspace_documents")
        .select("doc_key, updated_at")
        .eq("workspace_id", workspaceId);

      if (error || !stamps || cancelled) {
        if (error) {
          console.error("Could not refresh workspace data.", error.message);
        }
        return;
      }

      const changed = stamps.filter(
        (row) => seen.get(row.doc_key) !== row.updated_at || isPending(row.doc_key),
      );
      if (changed.length === 0) {
        return;
      }

      const { data: rows, error: rowError } = await supabase
        .from("workspace_documents")
        .select("doc_key, payload, updated_at")
        .eq("workspace_id", workspaceId)
        .in(
          "doc_key",
          changed.map((row) => row.doc_key),
        );

      if (rowError || !rows || cancelled) {
        if (rowError) {
          console.error("Could not refresh workspace data.", rowError.message);
        }
        return;
      }

      for (const row of rows as DocumentRow[]) {
        if (isPending(row.doc_key) || dirty.has(row.doc_key)) {
          dirty.add(row.doc_key);
          await pushDocument(row.doc_key);
          continue;
        }

        seen.set(row.doc_key, row.updated_at);
        applyRemote(row.doc_key, row.payload);
      }
    }

    async function pullAvatar() {
      if (cancelled || dirty.has(avatarKey) || isPending(avatarKey)) {
        if (isPending(avatarKey)) {
          await pushAvatar();
        }
        return;
      }

      const { data, error } = await supabase
        .from("users")
        .select("avatar")
        .eq("id", userId)
        .maybeSingle();

      if (error || cancelled) {
        return;
      }

      if (typeof data?.avatar === "string" && data.avatar) {
        applyAvatar(data.avatar);
      }
    }

    async function publishLocalDocuments() {
      if (!workspaceId) {
        return;
      }

      const { data: stamps } = await supabase
        .from("workspace_documents")
        .select("doc_key")
        .eq("workspace_id", workspaceId);

      if (cancelled) {
        return;
      }

      const remoteKeys = new Set((stamps ?? []).map((row) => row.doc_key));
      for (const document of workspaceDocuments) {
        if (remoteKeys.has(document.key) || dirty.has(document.key)) {
          continue;
        }
        if (readLocal(document.key)) {
          await pushDocument(document.key);
        }
      }
    }

    async function publishLocalAvatar() {
      if (dirty.has(avatarKey)) {
        return;
      }

      const { data } = await supabase.from("users").select("avatar").eq("id", userId).maybeSingle();
      if (cancelled || data?.avatar) {
        return;
      }

      if (readLocal(profileAvatarKey(userId))) {
        await pushAvatar();
      }
    }

    async function retryPending() {
      for (const document of workspaceDocuments) {
        if (isPending(document.key)) {
          await pushDocument(document.key);
        }
      }
      if (isPending(avatarKey)) {
        await pushAvatar();
      }
    }

    function onFocus() {
      void pullDocuments();
      void pullAvatar();
      void retryPending();
    }

    function onVisibility() {
      if (document.visibilityState === "visible") {
        onFocus();
      }
    }

    for (const document of workspaceDocuments) {
      window.addEventListener(document.event, onDocumentEvent);
    }
    window.addEventListener(profileAvatarEvent, onAvatar);
    function onPageHide() {
      for (const [key, timer] of timers) {
        window.clearTimeout(timer);
        if (key === avatarKey) {
          void pushAvatar();
        } else {
          void pushDocument(key);
        }
      }
      timers.clear();
    }

    window.addEventListener("focus", onFocus);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);
    const poll = window.setInterval(onFocus, 12000);

    async function start() {
      const { data: account, error } = await supabase
        .from("users")
        .select("workspace_id, avatar")
        .eq("id", userId)
        .maybeSingle();

      if (cancelled || error || !account?.workspace_id || !uuidPattern.test(account.workspace_id)) {
        if (error) {
          console.error("Could not load the workspace.", error.message);
        }
        return;
      }

      workspaceId = account.workspace_id;
      if (isPending(avatarKey) || dirty.has(avatarKey)) {
        await pushAvatar();
      } else if (typeof account.avatar === "string" && account.avatar) {
        applyAvatar(account.avatar);
      } else {
        await publishLocalAvatar();
      }

      await pullDocuments();
      await publishLocalDocuments();
      if (cancelled || !workspaceId) {
        return;
      }

      channel = supabase
        .channel(`workspace-documents:${workspaceId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "workspace_documents",
            filter: `workspace_id=eq.${workspaceId}`,
          },
          (message) => {
            const row = message.new as Partial<DocumentRow>;
            if (!row.doc_key || typeof row.payload !== "string") {
              return;
            }

            if (row.updated_at) {
              seen.set(row.doc_key, row.updated_at);
            }
            if (!dirty.has(row.doc_key)) {
              applyRemote(row.doc_key, row.payload);
            }
          },
        )
        .subscribe();
    }

    void start();

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      for (const timer of timers.values()) {
        window.clearTimeout(timer);
      }
      for (const document of workspaceDocuments) {
        window.removeEventListener(document.event, onDocumentEvent);
      }
      window.removeEventListener(profileAvatarEvent, onAvatar);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [userId]);

  return null;
}
