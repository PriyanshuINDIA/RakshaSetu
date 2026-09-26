/* ==========================================================================
   RakshaSetu Authority - Authentication & RBAC Service
   Enforces that only users with profiles.role = 'authority' or 'admin'
   can access the live Authority EOC dashboard.
   ========================================================================== */

import { supabase } from './supabase-client.js';

class AuthorityAuthService {
  /**
   * Authenticate user with Supabase Auth
   */
  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    if (error) {
      console.error('[RakshaSetu][Authority][Auth] Sign in failed:', error.message);
      throw error;
    }
    return data;
  }

  /**
   * Sign out current user
   */
  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('[RakshaSetu][Authority][Auth] Sign out error:', error.message);
      throw error;
    }
    console.log('[RakshaSetu][Authority][Auth] Signed out successfully');
  }

  /**
   * Get current Supabase session
   */
  async getSession() {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session) return null;
      return session;
    } catch (err) {
      console.warn('[RakshaSetu][Authority][Auth] Failed to get session:', err.message);
      return null;
    }
  }

  /**
   * Get current authenticated user from session
   */
  async getCurrentUser() {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) {
        return null;
      }
      return user;
    } catch (err) {
      console.warn('[RakshaSetu][Authority][Auth] Failed to get current user:', err.message);
      return null;
    }
  }

  /**
   * Fetch profiles record from Supabase for the authenticated user
   */
  async getCurrentProfile(userId) {
    if (!userId) return null;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('[RakshaSetu][Authority][Auth] Failed to load user profile:', error.message);
        return null;
      }
      return data;
    } catch (err) {
      console.error('[RakshaSetu][Authority][Auth] Unexpected profile query error:', err);
      return null;
    }
  }

  /**
   * Verify if the user profile role qualifies for Authority EOC access
   */
  isAuthorizedAuthority(profile) {
    if (!profile) return false;
    const role = String(profile.role || '').toLowerCase().trim();
    return role === 'authority' || role === 'admin';
  }

  /**
   * Listen to Supabase auth state transitions
   */
  onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange((event, session) => {
      callback(event, session);
    });
  }
}

export const authService = new AuthorityAuthService();
