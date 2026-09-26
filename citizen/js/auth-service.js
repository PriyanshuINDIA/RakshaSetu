import { supabase } from './supabase-client.js';

class AuthService {

    getCitizenCallbackUrl() {
        if (typeof window === 'undefined') return null;
        const origin = window.location.origin;
        const pathname = window.location.pathname;
        const citizenBase = pathname.includes('/citizen')
            ? pathname.substring(0, pathname.indexOf('/citizen') + '/citizen'.length)
            : '';
        return `${origin}${citizenBase}/auth/callback.html`;
    }

    getResetPasswordCallbackUrl() {
        if (typeof window === 'undefined') return null;
        const origin = window.location.origin;
        const pathname = window.location.pathname;
        const citizenBase = pathname.includes('/citizen')
            ? pathname.substring(0, pathname.indexOf('/citizen') + '/citizen'.length)
            : '';
        return `${origin}${citizenBase}/auth/reset-password.html`;
    }

    async signUp({
        email,
        password,
        fullName,
        phone = null,
        bloodGroup = null,
        dateOfBirth = null,
        address = null,
        district = null,
        state = null,
        emergencyContacts = [],
        emailRedirectTo = null
    }) {
        const redirectUrl = emailRedirectTo || this.getCitizenCallbackUrl();

        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: fullName,
                    phone,
                    blood_group: bloodGroup,
                    date_of_birth: dateOfBirth,
                    address,
                    district,
                    state,
                    emergency_contacts: emergencyContacts
                },
                ...(redirectUrl ? { emailRedirectTo: redirectUrl } : {})
            }
        });

        if (error) {
            throw error;
        }

        return data;
    }


    async signIn(email, password) {
        console.log('[RakshaSetu][Auth] Login attempt:', {
            email,
            hasPassword: Boolean(password)
        });

        const { data, error } =
            await supabase.auth.signInWithPassword({
                email,
                password
            });

        if (error) {
            console.error('[RakshaSetu][Auth] Supabase sign-in error:', {
                message: error?.message,
                status: error?.status,
                code: error?.code
            });
            throw error;
        }

        return data;
    }


    async signOut() {

        const { error } = await supabase.auth.signOut();

        if (error) {
            throw error;
        }
    }


    async resetPasswordForEmail(email, redirectTo = null) {
        const targetRedirect = redirectTo || this.getResetPasswordCallbackUrl();
        console.log('[RakshaSetu][Auth] Requesting password reset:', {
            email,
            redirectTo: targetRedirect
        });

        const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: targetRedirect
        });

        if (error) {
            console.error('[RakshaSetu][Auth] Password reset request error:', {
                message: error?.message,
                status: error?.status,
                code: error?.code
            });
            throw error;
        }

        return data;
    }


    async updatePassword(newPassword) {
        console.log('[RakshaSetu][Auth] Updating password for authenticated recovery session');
        const { data, error } = await supabase.auth.updateUser({
            password: newPassword
        });

        if (error) {
            console.error('[RakshaSetu][Auth] Password update error:', {
                message: error?.message,
                status: error?.status,
                code: error?.code
            });
            throw error;
        }

        return data;
    }


    async getCurrentUser() {
        try {
            const {
                data: { user },
                error
            } = await supabase.auth.getUser();

            if (error || !user) {
                return null;
            }

            return user;
        } catch {
            return null;
        }
    }


    async getCurrentProfile(userId = null, retryCount = 3) {
        let uid = userId;
        if (!uid) {
            const user = await this.getCurrentUser();
            if (!user) {
                return null;
            }
            uid = user.id;
        }

        for (let attempt = 0; attempt <= retryCount; attempt++) {
            try {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', uid)
                    .maybeSingle();

                if (!error && data) {
                    return data;
                }
            } catch (err) {
                console.warn('[RakshaSetu][Auth] Profile lookup attempt warning:', err);
            }

            if (attempt < retryCount) {
                // Short wait to allow the database trigger to complete inserting the profiles row
                await new Promise(r => setTimeout(r, 350 * (attempt + 1)));
            }
        }

        return null;
    }


    onAuthStateChange(callback) {

        return supabase.auth.onAuthStateChange(
            (event, session) => {
                callback(event, session);
            }
        );
    }
}

export const authService = new AuthService();