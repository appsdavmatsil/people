-- Configurable staff-intake form definition.
--
-- A single row (id = true) holds the entire form configuration as JSON so the
-- Form Builder can edit fields, documents and naming rules, and the public
-- form + upload API read from it. Written only by the server (service role)
-- which bypasses RLS; no anon/authenticated access.

create table public.staff_intake_config (
  id boolean primary key default true,
  config jsonb not null,
  updated_at timestamptz not null default now(),
  constraint staff_intake_config_singleton check (id = true)
);

alter table public.staff_intake_config enable row level security;
revoke all on table public.staff_intake_config from public, anon, authenticated;

-- Seed with the current configuration.
-- Add a generic jsonb column to submissions to capture all field values,
-- including any custom fields added via the Form Builder.
alter table public.staff_intake_submissions
  add column if not exists data jsonb not null default '{}'::jsonb;

insert into public.staff_intake_config (id, config)
values (
  true,
  '{
    "textFields": [
      { "name": "fullName", "label": "Full name", "type": "text", "required": true, "autoComplete": "name", "help": "Enter your name exactly as it appears on your passport." },
      { "name": "email", "label": "Email", "type": "email", "required": true, "autoComplete": "email" },
      { "name": "dateOfBirth", "label": "Date of birth", "type": "date", "required": true },
      { "name": "phone", "label": "Phone number", "type": "phone", "required": true, "help": "Select your country code, then enter your number." },
      { "name": "whatsapp", "label": "WhatsApp phone number", "type": "phone", "required": true, "help": "The number you use on WhatsApp." },
      { "name": "joiningDate", "label": "Joining date", "type": "date", "required": true },
      { "name": "nationality", "label": "Nationality", "type": "text", "required": true, "autoComplete": "country-name" },
      { "name": "passportNumber", "label": "Passport number", "type": "text", "required": true },
      { "name": "passportExpiry", "label": "Passport expiry date", "type": "date", "required": true, "help": "The expiry date printed on your passport." },
      { "name": "emiratesIdNumber", "label": "Emirates ID number", "type": "text", "required": true, "help": "The 15-digit number on the front of your Emirates ID (784-...)." },
      { "name": "emiratesIdExpiry", "label": "Emirates ID expiry date", "type": "date", "required": true, "help": "The expiry date printed on your Emirates ID." },
      { "name": "visaExpiry", "label": "Residence visa expiry date", "type": "date", "required": true, "help": "The expiry date on your residence visa." }
    ],
    "documents": [
      { "field": "profilePhoto", "label": "Profile Photo", "required": true, "help": "A clear, recent photo of your face." },
      { "field": "passportImage", "label": "Passport", "dateField": "passportExpiry", "required": true, "help": "Photo or scan of your passport photo page." },
      { "field": "emiratesIdFront", "label": "Emirates ID Front", "dateField": "emiratesIdExpiry", "required": true, "help": "Front side of your Emirates ID." },
      { "field": "emiratesIdBack", "label": "Emirates ID Back", "dateField": "emiratesIdExpiry", "required": true, "help": "Back side of your Emirates ID." },
      { "field": "visaImage", "label": "Residence Visa", "dateField": "visaExpiry", "required": true, "help": "Photo or scan of your residence visa." }
    ],
    "naming": {
      "folderPattern": "{name}",
      "filePattern": "{label}_{name}_{date}"
    }
  }'::jsonb
);
