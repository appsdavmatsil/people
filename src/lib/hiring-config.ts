import { createServiceClient } from "@/lib/supabase/service";
import type { FormConfig } from "@/lib/form-config";

/** Default hiring form config — full maine-forms application question set. CV + Photo only for docs. */
export const DEFAULT_HIRING_CONFIG: FormConfig = {
  textFields: [
    { name: "firstName", label: "First Name", type: "text", required: true, autoComplete: "given-name" },
    { name: "lastName", label: "Last Name", type: "text", required: true, autoComplete: "family-name" },
    { name: "phone", label: "Phone Number", type: "phone", required: true },
    { name: "email", label: "Email Address", type: "email", required: true, autoComplete: "email" },
    { name: "dateOfBirth", label: "Date of Birth", type: "date", required: true },
    { name: "nationality", label: "Nationality", type: "country", required: true },
    { name: "currentAddress", label: "Current Address", type: "text", required: true, help: "City, Country" },
    { name: "instagram", label: "Instagram Handle", type: "text", required: false, help: "@yourhandle (optional)" },
    { name: "positionApplied", label: "Position Applied For", type: "select", required: true, options: ["Senior Sous Chef", "Sous Chef", "Junior Sous Chef", "Chef de Partie (CDP)", "Demi Chef de Partie (DCDP)", "Commis 1", "Commis 2", "Commis 3", "Pastry Chef", "Kitchen Steward"] },
    { name: "uaeDrivingLicense", label: "UAE Driving License?", type: "select", required: true, options: ["Yes", "No"] },
    { name: "requiresAccommodation", label: "Do you require company accommodation?", type: "select", required: true, options: ["Yes", "No"] },
    { name: "uaeEligibility", label: "UAE Work Eligibility", type: "select", required: true, options: ["Yes – Current company sponsors my visa", "Yes – On own/spouse/family visa", "No – Would need visa sponsorship", "Currently outside UAE"] },
    { name: "joiningAvailability", label: "Joining Availability", type: "select", required: true, options: ["Immediately", "15 Days Notice Period", "30 Days Notice Period", "60 Days Notice Period", "Other"] },
    { name: "otherLanguages", label: "Other Languages", type: "text", required: false, help: "e.g. Arabic, French, Spanish" },
    { name: "currentPosition", label: "Current / Last Position", type: "text", required: true, help: "e.g. Demi Chef" },
    { name: "experienceYears", label: "Years of Experience", type: "text", required: true, help: "e.g. 5" },
    { name: "currentWorkplace", label: "Current / Last Workplace", type: "text", required: false, help: "Restaurant name & city" },
    { name: "previousWorkplaces", label: "Previous Workplaces", type: "textarea", required: false, help: "One per line: workplace, position, dates" },
    { name: "salaryExpectation", label: "Salary Expectation (AED/month)", type: "text", required: true, help: "e.g. 4500" },
    { name: "education", label: "Highest Education Level", type: "text", required: true, help: "e.g. Culinary Diploma, Bachelor's in Hospitality" },
    { name: "coursesWorkshops", label: "Courses & Workshops", type: "textarea", required: false, help: "Any relevant training (optional)" },
    { name: "skillsExpertise", label: "Skills & Expertise", type: "textarea", required: true, help: "Describe your skills, specialties, and what makes you stand out…" },
    { name: "employmentReferences", label: "Employment References", type: "textarea", required: false, help: "Name, workplace, position, contact" },
    { name: "hobbies", label: "Hobbies & Personal Interests", type: "textarea", required: false, help: "What do you like to do outside of work?" },
    { name: "challengeStory", label: "Tell us about a time you faced a major challenge in the kitchen and how you handled it.", type: "textarea", required: true, help: "Describe the situation, your actions, and the outcome…" },
    { name: "teamInspiration", label: "How do you inspire and work with your team to maintain high standards under pressure?", type: "textarea", required: true, help: "Share your approach to team leadership and motivation…" },
    { name: "essentialTechnique", label: "Which cooking technique do you consider essential for a great chef, and why?", type: "textarea", required: true, help: "Name the technique and explain its importance to you…" },
    { name: "previousRolesStyle", label: "Can you tell us about your previous roles and how they have shaped your culinary style?", type: "textarea", required: true, help: "Describe your journey and how each role influenced you…" },
    { name: "chefMeaning", label: "What does being a chef mean to you, beyond cooking?", type: "textarea", required: true, help: "Share your deeper motivation and passion for the craft…" },
  ],
  documents: [
    { field: "profilePhoto", label: "Profile Photo", required: true, help: "A clear, recent photo of your face." },
    { field: "cv", label: "CV / Resume", required: true, help: "PDF preferred." },
  ],
  naming: {
    folderPattern: "{name}",
    filePattern: "{label}_{name}_{date}",
  },
};

function isValidConfig(value: unknown): value is FormConfig {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  return (
    Array.isArray(c.textFields) &&
    Array.isArray(c.documents) &&
    typeof c.naming === "object" &&
    c.naming !== null
  );
}

/** Loads the hiring form config from the DB, falling back to defaults. */
export async function loadHiringConfig(): Promise<FormConfig> {
  const supabase = createServiceClient();
  if (!supabase) {
    return DEFAULT_HIRING_CONFIG;
  }

  const { data, error } = await supabase
    .from("hiring_form_config")
    .select("config")
    .eq("id", true)
    .maybeSingle();

  if (error || !data || !isValidConfig(data.config)) {
    return DEFAULT_HIRING_CONFIG;
  }

  return data.config;
}

/** Saves a new hiring form config (service role). */
export async function saveHiringConfig(config: FormConfig): Promise<{ error?: string }> {
  const supabase = createServiceClient();
  if (!supabase) {
    return { error: "Server not configured." };
  }

  const { error } = await supabase
    .from("hiring_form_config")
    .upsert({ id: true, config, updated_at: new Date().toISOString() });

  if (error) {
    return { error: error.message };
  }
  return {};
}
