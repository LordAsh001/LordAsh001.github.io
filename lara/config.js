// LARA: site settings.
// Fill these in from Supabase > Project Settings > API (see README.md, step 5).
// The anon/publishable key is meant to be public; your data is protected by the
// database rules in supabase/schema.sql. Never put the service_role/secret key here.
window.LARA_CONFIG = {
  SUPABASE_URL: "https://drxqetamznkqpjoryfde.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-ANON-OR-PUBLISHABLE-KEY",

  // Shown on the privacy page as the contact for data questions.
  CONTACT_EMAIL: "",

  // Set to true after you enable Google sign-in in Supabase (README, optional step).
  ENABLE_GOOGLE: false,
};
