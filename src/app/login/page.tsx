import type { Metadata } from "next";
import { LoginForm } from "@/components/login-form";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; setPassword?: string; error?: string; email?: string }>;
}) {
  const params = await searchParams;
  const mode =
    params.mode === "create" || params.mode === "recover" ? params.mode : "sign-in";
  const settingPassword = params.setPassword === "1";
  let canSetPassword = false;

  if (settingPassword) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    canSetPassword = typeof data?.claims?.sub === "string";
  }

  const notice =
    params.error === "recovery"
      ? "That recovery link was invalid or expired. Request a new one."
      : undefined;

  return (
    <main className="flex flex-1 items-center justify-center bg-stone-100 px-6 py-16">
      <div className="w-full max-w-sm">
        <img
          src="/people-logo.png"
          alt="People staff management"
          width={1024}
          height={285}
          className="block h-auto w-full"
        />
        <LoginForm
          mode={notice ? "recover" : mode}
          canSetPassword={canSetPassword}
          notice={notice}
          initialEmail={params.email ?? ""}
        />
      </div>
    </main>
  );
}
