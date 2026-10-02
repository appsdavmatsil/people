import type { Metadata } from "next";
import { StaffIntakeForm } from "@/components/staff-intake-form";

export const metadata: Metadata = {
  title: "Staff Details",
  description: "Submit your staff details and documents.",
};

export default function OnboardingPage() {
  return (
    <main className="min-h-dvh overflow-y-auto bg-stone-100 px-5 py-10">
      <div className="mx-auto w-full max-w-xl">
        <header className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-stone-950">Staff Details</h1>
          <p className="mt-2 text-sm text-stone-600">
            Please fill in your details and upload clear photos of your documents.
            Your files are stored securely by HR.
          </p>
        </header>
        <StaffIntakeForm />
      </div>
    </main>
  );
}
