/**
 * Mobile Authentication Handler
 *
 * Handles authentication flow for Capacitor native apps:
 * - Deep link handling for magic link callbacks
 * - Client-side OTP verification
 * - Session management via Capacitor Preferences
 */

import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { isNativePlatform } from '$lib/config/platform';
import { getClient } from '$lib/supabase';
import type { SupabaseClient, Session } from '@supabase/supabase-js';

// Deep link configuration
const DEEP_LINK_SCHEME = 'mediqom';
const AUTH_CALLBACK_PATH = 'auth/callback';

// Session state store for mobile
let currentSession: Session | null = null;

/**
 * Initialize mobile authentication listeners
 * Call this once when the app starts
 */
export async function initMobileAuth(): Promise<void> {
  if (!browser || !isNativePlatform()) return;

  console.log('[Mobile Auth] Initializing...');

  try {
    // Dynamically import Capacitor App plugin
    const { App } = await import('@capacitor/app');

    // Listen for deep links (app opened via URL)
    App.addListener('appUrlOpen', async ({ url }) => {
      console.log('[Mobile Auth] Deep link received:', url);
      await handleDeepLink(url);
    });

    // Listen for app state changes
    App.addListener('appStateChange', async ({ isActive }) => {
      if (isActive) {
        // Refresh session when app becomes active
        await refreshSession();
      }
    });

    // Check for existing session on init
    await refreshSession();

    console.log('[Mobile Auth] Initialized successfully');
  } catch (error) {
    console.error('[Mobile Auth] Failed to initialize:', error);
  }
}

/**
 * Handle deep link URL
 */
async function handleDeepLink(url: string): Promise<void> {
  try {
    const urlObj = new URL(url);

    // Check if this is an auth callback
    if (urlObj.pathname.includes(AUTH_CALLBACK_PATH) || urlObj.host === AUTH_CALLBACK_PATH) {
      await handleAuthCallback(url);
    }
  } catch (error) {
    console.error('[Mobile Auth] Failed to handle deep link:', error);
  }
}

/**
 * Handle authentication callback from magic link
 */
async function handleAuthCallback(url: string): Promise<void> {
  console.log('[Mobile Auth] Processing auth callback...');

  try {
    const urlObj = new URL(url);
    // Check both search params and hash params (Supabase uses both)
    const searchParams = new URLSearchParams(urlObj.search);
    const hashParams = new URLSearchParams(urlObj.hash.substring(1));

    // Try to get tokens from either location
    const accessToken = searchParams.get('access_token') || hashParams.get('access_token');
    const refreshToken = searchParams.get('refresh_token') || hashParams.get('refresh_token');
    const tokenHash = searchParams.get('token_hash') || hashParams.get('token_hash');
    const type = searchParams.get('type') || hashParams.get('type');

    const supabase = getClient();

    if (accessToken && refreshToken) {
      // OAuth flow or magic link with tokens
      console.log('[Mobile Auth] Setting session from tokens...');
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error) {
        console.error('[Mobile Auth] Failed to set session:', error);
        goto('/auth?error=session_failed');
        return;
      }

      currentSession = data.session;
      console.log('[Mobile Auth] Session established, redirecting to /med');
      goto('/med');
    } else if (tokenHash && type) {
      // Magic link OTP flow
      console.log('[Mobile Auth] Verifying OTP...');
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as 'email' | 'magiclink',
      });

      if (error) {
        console.error('[Mobile Auth] OTP verification failed:', error);
        goto('/auth?error=verification_failed');
        return;
      }

      currentSession = data.session;
      console.log('[Mobile Auth] OTP verified, redirecting to /med');
      goto('/med');
    } else {
      console.warn('[Mobile Auth] No valid auth params in callback URL');
      goto('/auth?error=invalid_callback');
    }
  } catch (error) {
    console.error('[Mobile Auth] Auth callback error:', error);
    goto('/auth?error=unknown');
  }
}

/**
 * Sign in with magic link (email OTP)
 * Returns the redirect URL for the magic link email
 */
export async function signInWithMagicLink(email: string): Promise<{ error: Error | null }> {
  const supabase = getClient();

  // Build redirect URL based on platform
  const redirectUrl = isNativePlatform()
    ? `${DEEP_LINK_SCHEME}://${AUTH_CALLBACK_PATH}`
    : `${window.location.origin}/auth/confirm`;

  console.log('[Mobile Auth] Signing in with magic link:', { email, redirectUrl });

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectUrl,
      shouldCreateUser: true,
    },
  });

  if (error) {
    console.error('[Mobile Auth] Magic link error:', error);
    return { error };
  }

  return { error: null };
}

/**
 * Sign out the current user
 */
export async function signOut(): Promise<void> {
  const supabase = getClient();
  await supabase.auth.signOut();
  currentSession = null;

  // Clear any stored session data
  if (isNativePlatform()) {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      await Preferences.remove({ key: 'supabase_session' });
    } catch (error) {
      console.error('[Mobile Auth] Failed to clear preferences:', error);
    }
  }

  goto('/auth');
}

/**
 * Refresh the current session
 */
export async function refreshSession(): Promise<Session | null> {
  const supabase = getClient();

  try {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
      console.error('[Mobile Auth] Session refresh error:', error);
      currentSession = null;
      return null;
    }

    currentSession = session;
    return session;
  } catch (error) {
    console.error('[Mobile Auth] Session refresh failed:', error);
    currentSession = null;
    return null;
  }
}

/**
 * Get the current session
 */
export function getSession(): Session | null {
  return currentSession;
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  return currentSession !== null;
}

/**
 * Set up auth state change listener
 */
export function onAuthStateChange(
  callback: (session: Session | null) => void
): () => void {
  const supabase = getClient();

  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (_event, session) => {
      currentSession = session;
      callback(session);
    }
  );

  return () => {
    subscription.unsubscribe();
  };
}

/**
 * Store session in Capacitor Preferences for persistence
 */
export async function persistSession(session: Session): Promise<void> {
  if (!isNativePlatform()) return;

  try {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.set({
      key: 'supabase_session',
      value: JSON.stringify(session),
    });
  } catch (error) {
    console.error('[Mobile Auth] Failed to persist session:', error);
  }
}

/**
 * Restore session from Capacitor Preferences
 */
export async function restoreSession(): Promise<Session | null> {
  if (!isNativePlatform()) return null;

  try {
    const { Preferences } = await import('@capacitor/preferences');
    const { value } = await Preferences.get({ key: 'supabase_session' });

    if (value) {
      const session = JSON.parse(value) as Session;

      // Validate and set the session
      const supabase = getClient();
      const { data, error } = await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });

      if (!error && data.session) {
        currentSession = data.session;
        return data.session;
      }
    }
  } catch (error) {
    console.error('[Mobile Auth] Failed to restore session:', error);
  }

  return null;
}
