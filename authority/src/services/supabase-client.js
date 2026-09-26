/* ==========================================================================
   RakshaSetu Authority - Supabase Client Module
   Dedicated client for the Authority EOC Dashboard.
   Uses only the public anon key. Never exposes service role key in browser.
   ========================================================================== */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const SUPABASE_URL = 'https://browmylyinqukfqpcvuv.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_IGa6TRg6C3CRIK0BoElOqg_TOjZaF3B';

// Ensure isolated storage key for Authority to prevent session collision with Citizen PWA
export const AUTHORITY_STORAGE_KEY = 'rakshasetu-authority-auth-token';


export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      storageKey: AUTHORITY_STORAGE_KEY,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    },
    realtime: {
      params: {
        eventsPerSecond: 10
      }
    }
  }
);
