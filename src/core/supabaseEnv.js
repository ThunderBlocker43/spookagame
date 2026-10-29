// ==========================================
// SUPABASE ENVIRONMENT
// ==========================================
// Only the public "publishable"/anon key is used. Both values end up in the
// client bundle by design (see .env.local).

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
