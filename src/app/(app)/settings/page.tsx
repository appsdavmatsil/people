import type { Metadata } from "next";
import { SettingsScreen } from "@/components/settings-screen";

export const metadata: Metadata = {
  title: "Settings",
};

const settingsTabs = ["directory", "locations", "events", "team", "privacy"] as const;

type SettingsTab = (typeof settingsTabs)[number];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const initialTab: SettingsTab = settingsTabs.includes(tab as SettingsTab)
    ? (tab as SettingsTab)
    : "directory";

  return <SettingsScreen initialTab={initialTab} />;
}
