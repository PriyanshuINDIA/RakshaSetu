import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://browmylyinqukfqpcvuv.supabase.co';

// IMPORTANT:
// Paste your publishable key here.
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_IGa6TRg6C3CRIK0BoElOqg_TOjZaF3B';

export const CITIZEN_STORAGE_KEY = 'rakshasetu-citizen-auth-token';


export const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
        auth: {
            storageKey: CITIZEN_STORAGE_KEY,
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true
        }
    }
);