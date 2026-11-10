// 1stPaper settings — the only file you need to edit.
// Leave supabaseUrl empty to run in DEMO MODE (sample data kept in this browser only).
window.FIRSTPAPER_CONFIG = {
  // Supabase → Project Settings → API
  supabaseUrl: 'https://drxqetamznkqpjoryfde.supabase.co',   // shared with LARA (1stPaper tables are prefixed fp_)
  supabaseAnonKey: 'sb_publishable_43H2h65_jChEG-UK52KRnA_2wGzZn3I',    // publishable key (safe to publish; RLS protects the data)

  google: true,           // show "Continue with Google" (uses LARA's Google sign-in setup)

  // Links to your sister tools (check these paths match your site)
  links: {
    lara: 'https://shagbaor.com/lara/',
    findJournal: 'https://shagbaor.com/lara/',   // point at LARA's Find a Journal section if it has its own URL
    citadel: 'https://shagbaor.com/citadel.html',
    laureate: 'https://shagbaor.com/laureate/',
    home: 'https://shagbaor.com/'
  }
};
