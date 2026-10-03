import { createServiceClient } from "@/lib/supabase/service";

export type FieldType = "text" | "email" | "tel" | "phone" | "date";

export type ConfigTextField = {
  name: string;
  label: string;
  type: FieldType;
  required: boolean;
  autoComplete?: string;
  /** Optional instruction/help text shown under the field on the form. */
  help?: string;
};

export type ConfigDocument = {
  field: string;
  label: string;
  dateField?: string;
  required: boolean;
  /** Optional instruction/help text shown under the document upload. */
  help?: string;
};

export type NamingRules = {
  folderPattern: string;
  filePattern: string;
};

export type FormConfig = {
  textFields: ConfigTextField[];
  documents: ConfigDocument[];
  naming: NamingRules;
};

/** Built-in default used when the DB config row is missing. Mirrors the seed. */
export const DEFAULT_FORM_CONFIG: FormConfig = {
  textFields: [
    { name: "fullName", label: "Full name", type: "text", required: true, autoComplete: "name", help: "Enter your name exactly as it appears on your passport." },
    { name: "email", label: "Email", type: "email", required: true, autoComplete: "email" },
    { name: "dateOfBirth", label: "Date of birth", type: "date", required: true },
    { name: "phone", label: "Phone number", type: "phone", required: true, help: "Select your country code, then enter your number." },
    { name: "whatsapp", label: "WhatsApp phone number", type: "phone", required: true, help: "The number you use on WhatsApp." },
    { name: "joiningDate", label: "Joining date", type: "date", required: true },
    { name: "nationality", label: "Nationality", type: "text", required: true, autoComplete: "country-name" },
    { name: "passportNumber", label: "Passport number", type: "text", required: true },
    { name: "passportExpiry", label: "Passport expiry date", type: "date", required: true, help: "The expiry date printed on your passport." },
    { name: "emiratesIdNumber", label: "Emirates ID number", type: "text", required: true, help: "The 15-digit number on the front of your Emirates ID (784-...)." },
    { name: "emiratesIdExpiry", label: "Emirates ID expiry date", type: "date", required: true, help: "The expiry date printed on your Emirates ID." },
    { name: "visaExpiry", label: "Residence visa expiry date", type: "date", required: true, help: "The expiry date on your residence visa." },
  ],
  documents: [
    { field: "profilePhoto", label: "Profile Photo", required: true, help: "A clear, recent photo of your face." },
    { field: "passportImage", label: "Passport", dateField: "passportExpiry", required: true, help: "Photo or scan of your passport photo page." },
    { field: "emiratesIdFront", label: "Emirates ID Front", dateField: "emiratesIdExpiry", required: true, help: "Front side of your Emirates ID." },
    { field: "emiratesIdBack", label: "Emirates ID Back", dateField: "emiratesIdExpiry", required: true, help: "Back side of your Emirates ID." },
    { field: "visaImage", label: "Residence Visa", dateField: "visaExpiry", required: true, help: "Photo or scan of your residence visa." },
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

/** Loads the form config from the DB, falling back to defaults. */
export async function loadFormConfig(): Promise<FormConfig> {
  const supabase = createServiceClient();
  if (!supabase) {
    return DEFAULT_FORM_CONFIG;
  }

  const { data, error } = await supabase
    .from("staff_intake_config")
    .select("config")
    .eq("id", true)
    .maybeSingle();

  if (error || !data || !isValidConfig(data.config)) {
    return DEFAULT_FORM_CONFIG;
  }

  return data.config;
}

/** Saves a new form config (service role). */
export async function saveFormConfig(config: FormConfig): Promise<{ error?: string }> {
  const supabase = createServiceClient();
  if (!supabase) {
    return { error: "Server not configured." };
  }

  const { error } = await supabase
    .from("staff_intake_config")
    .upsert({ id: true, config, updated_at: new Date().toISOString() });

  if (error) {
    return { error: error.message };
  }
  return {};
}
