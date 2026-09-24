import type { Metadata } from "next";
import { ProfileSettings } from "@/components/profile-settings";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Profile settings",
};

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const userId = user?.id ?? "";
  const email = user?.email ?? "";
  let name = "";

  if (userId) {
    const { data: account } = await supabase
      .from("users")
      .select("name")
      .eq("id", userId)
      .maybeSingle();
    name = account?.name ?? "";
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto px-4 py-5 md:px-6">
      <ProfileSettings userId={userId} name={name} email={email} />
    </div>
  );
}
