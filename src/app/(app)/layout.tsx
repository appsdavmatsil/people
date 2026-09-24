import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : "";
  const email =
    typeof data?.claims?.email === "string" ? data.claims.email : "";
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
    <AppShell userId={userId} name={name} email={email}>
      {children}
    </AppShell>
  );
}
