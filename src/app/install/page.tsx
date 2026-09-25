import type { Metadata } from "next";
import { InstallAppCard } from "@/components/install-app-card";

export const metadata: Metadata = {
  title: "Install",
  description: "Install the People staff management app on your phone.",
};

export default function InstallPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[radial-gradient(circle_at_top,#d7eee2_0,#f5f5f4_45%,#e7e5e4_100%)] px-4 py-10">
      <InstallAppCard />
    </main>
  );
}
