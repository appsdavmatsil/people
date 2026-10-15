import { createServiceClient } from "@/lib/supabase/service";
import type { FormConfig, LandingConfig } from "@/lib/form-config";

export const DEFAULT_HIRING_LANDING: LandingConfig = {
  title: "Group Careers • Job Application Form",
  intro:
    "The heart and soul of our company are our people, and as our company expands, so do the opportunities. Do you have a passion for people? Do you know what it means to serve with soul? Can you handle working in a high octane environment?",
  headline:
    "Start your application here if you want to become part of The Maine Group, one of the best restaurant groups based in Dubai.",
  note: "We are currently hiring for multiple positions. Please follow the instructions to submit your application.",
  headerLogo: "/the-maine-logo.png",
  logo: "/the-maine-seal.png",
  disclaimerTitle: "Please read before you begin",
  disclaimerBody:
    "Complete every section carefully and follow the instructions for each question. Answer honestly and in full, upload clear and legible documents, and make sure your contact details are correct.\n\nApplications that are incomplete, inaccurate, or not filled out according to the instructions will be automatically disqualified and will not be reviewed. Take your time and submit only when you are confident everything is correct.",
  successTitle: "Application received",
  successMessage: "Thank you for applying to The Maine. Our team will review your application and be in touch.",
  successNote: "Please visit our website for more information, and don't forget to follow our social channels.",
  website: "",
  instagram: "",
  facebook: "",
};

/** The saved landing texts, with defaults for anything not saved yet. */
export function landingOf(config: FormConfig): LandingConfig {
  return { ...DEFAULT_HIRING_LANDING, ...config.landing };
}

/** Default hiring form config — full maine-forms application question set. CV + Photo only for docs. */
export const DEFAULT_HIRING_CONFIG: FormConfig = {
  textFields: [
    { name: "fullName", label: "Full Name", type: "text", required: true, autoComplete: "name" },
    { name: "phone", label: "Phone Number", type: "phone", required: true },
    { name: "email", label: "Email Address", type: "email", required: true, autoComplete: "email" },
    { name: "dateOfBirth", label: "Date of Birth", type: "date", required: true },
    { name: "nationality", label: "Nationality", type: "country", required: true },
    { name: "currentCountry", label: "Current Country", type: "country", required: true },
    { name: "currentCity", label: "Current City", type: "text", required: true, autoComplete: "address-level2" },
    { name: "instagram", label: "Instagram Handle", type: "text", required: false, help: "@yourhandle (optional)" },
    { name: "positionApplied", label: "Position Applied For", type: "select", required: true, options: ["Senior Sous Chef", "Sous Chef", "Junior Sous Chef", "Chef de Partie (CDP)", "Demi Chef de Partie (DCDP)", "Commis 1", "Commis 2", "Commis 3", "Pastry Chef", "Kitchen Steward"] },
    { name: "uaeDrivingLicense", label: "UAE Driving License?", type: "select", required: true, options: ["Yes", "No"] },
    { name: "requiresAccommodation", label: "Do you require company accommodation?", type: "select", required: true, options: ["Yes", "No"] },
    { name: "uaeEligibility", label: "UAE Work Eligibility", type: "select", required: true, options: ["Yes – Current company sponsors my visa", "Yes – On own/spouse/family visa", "No – Would need visa sponsorship", "Currently outside UAE"] },
    { name: "otherLanguages", label: "Other Languages", type: "text", required: false, help: "e.g. Arabic, French, Spanish" },
    { name: "currentPosition", label: "Current / Last Position", type: "text", required: true, help: "e.g. Demi Chef" },
    { name: "salaryExpectation", label: "Salary Expectation (AED/month)", type: "text", required: true, help: "e.g. 4500" },
    { name: "experienceYears", label: "Years of Experience", type: "text", required: true, help: "e.g. 5" },
    { name: "employmentStatus", label: "Employment Status", type: "select", required: true, options: ["Currently Working", "Currently Not Working"] },
    { name: "joiningAvailability", label: "Joining Availability", type: "select", required: true, options: ["Immediately", "15 Days Notice Period", "30 Days Notice Period", "60 Days Notice Period", "Other"] },
    { name: "currentWorkplace", label: "Current / Last Workplace", type: "text", required: false, help: "Restaurant name & city" },
    { name: "previousWorkplaces", label: "Previous Workplaces", type: "textarea", required: false, help: "One per line: workplace, position, dates" },
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
    { field: "portfolio", label: "Portfolio", required: false, help: "One document showing your best work — the dishes, cooking style and techniques that define you. Optional, 4 MB max." },
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

  return withDirectoryOptions(supabase, data.config);
}

type ServiceClient = NonNullable<ReturnType<typeof createServiceClient>>;

/** Replaces options of fields linked to the Staff Directory with its positions, in directory order. */
async function withDirectoryOptions(supabase: ServiceClient, config: FormConfig): Promise<FormConfig> {
  if (!config.textFields.some((f) => f.optionsSource === "directory-positions")) return config;

  const { data } = await supabase
    .from("workspace_documents")
    .select("payload")
    .eq("doc_key", "people.directory-lookups")
    .maybeSingle();
  let lookups: { departments?: { id: string; name: string }[]; positions?: { departmentId: string; name: string }[] } = {};
  try {
    lookups = typeof data?.payload === "string" ? JSON.parse(data.payload) : (data?.payload ?? {});
  } catch {
    return config;
  }
  const departmentName = new Map((lookups.departments ?? []).map((d) => [d.id, d.name]));
  const positionsFor = (department?: string) =>
    (lookups.positions ?? [])
      .filter((p) => !department || departmentName.get(p.departmentId)?.toLowerCase() === department.toLowerCase())
      .map((p) => p.name.trim())
      .filter((name, index, all) => name && all.indexOf(name) === index);

  return {
    ...config,
    textFields: config.textFields.map((f) => {
      if (f.optionsSource !== "directory-positions") return f;
      const options = positionsFor(f.optionsDepartment);
      return options.length ? { ...f, options } : f;
    }),
  };
}

/** Saves a new hiring form config (service role). */
export async function saveHiringConfig(
  config: FormConfig,
  expectedVersion?: string | null,
): Promise<{ error?: string; stale?: boolean; version?: string }> {
  const supabase = createServiceClient();
  if (!supabase) {
    return { error: "Server not configured." };
  }

  if (expectedVersion !== undefined) {
    const current = await loadHiringConfigVersion();
    if (current && current !== expectedVersion) {
      return { stale: true, error: "The form was changed somewhere else since this page was opened. Reload the page to get the latest version, then make your changes again." };
    }
  }

  const version = new Date().toISOString();
  const { error } = await supabase
    .from("hiring_form_config")
    .upsert({ id: true, config, updated_at: version });

  if (error) {
    return { error: error.message };
  }
  return { version: await loadHiringConfigVersion() ?? version };
}

/** The saved config's last-updated timestamp, used to reject saves from stale builder pages. */
export async function loadHiringConfigVersion(): Promise<string | null> {
  const supabase = createServiceClient();
  if (!supabase) return null;
  const { data } = await supabase.from("hiring_form_config").select("updated_at").eq("id", true).maybeSingle();
  return data?.updated_at ? new Date(data.updated_at).toISOString() : null;
}
