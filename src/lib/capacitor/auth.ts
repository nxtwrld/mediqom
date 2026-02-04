/**
 * Mobile Authentication Handler
 *
 * Handles authentication flow for Capacitor native apps:
 * - Universal Link / deep link handling for magic link callbacks
 * - Implicit flow (access_token/refresh_token from URL fragment)
 * - PKCE code exchange as fallback
 * - Cold start handling via App.getLaunchUrl()
 * - Session management via CurrentSession store
 */

import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { isNativePlatform } from '$lib/config/platform';
import { getClient } from '$lib/supabase';
import { session as CurrentSession } from '$lib/user';
import type { Session } from '@supabase/supabase-js';

// Auth callback paths to match against
const AUTH_CALLBACK_PATH = '/auth/callback';
const UNIVERSAL_LINK_HOST = 'mediqom.com';

/**
 * Initialize mobile authentication listeners
 * Call this once when the app starts (from +layout.svelte onMount)
 */
export async function initMobileAuth(): Promise<void> {
  if (!browser || !isNativePlatform()) return;

  console.log('[Mobile Auth] Initializing...');

  try {
    const { App } = await import('@capacitor/app');

    // Listen for deep links while the app is running (warm start)
    App.addListener('appUrlOpen', async ({ url }) => {
      console.log('[Mobile Auth] Deep link received:', url);
      await handleDeepLink(url);
    });

    // Cold start: check if the app was launched via a Universal Link
    try {
      const launchUrl = await App.getLaunchUrl();
      if (launchUrl?.url) {
        console.log('[Mobile Auth] Cold start launch URL:', launchUrl.url);
        await handleDeepLink(launchUrl.url);
      }
    } catch (e) {
      console.warn('[Mobile Auth] getLaunchUrl not available:', e);
    }

    // Listen for app state changes
    App.addListener('appStateChange', async ({ isActive }) => {
      if (isActive) {
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
 * Handle deep link URL — supports both custom scheme and Universal Links
 */
async function handleDeepLink(url: string): Promise<void> {
  try {
    const urlObj = new URL(url);

    // Match auth callback from either:
    // - Custom scheme: mediqom://auth/callback
    // - Universal Link: https://mediqom.com/auth/callback
    const isCustomScheme = urlObj.protocol === 'mediqom:' &&
      (urlObj.pathname.includes(AUTH_CALLBACK_PATH) || urlObj.host === 'auth' || urlObj.pathname.startsWith('/callback'));
    const isUniversalLink = urlObj.hostname === UNIVERSAL_LINK_HOST &&
      urlObj.pathname.startsWith(AUTH_CALLBACK_PATH);

    if (isCustomScheme || isUniversalLink) {
      await handleAuthCallback(url);
    }
  } catch (error) {
    console.error('[Mobile Auth] Failed to handle deep link:', error);
  }
}

/**
 * Handle authentication callback from magic link
 *
 * Primary: implicit flow — extract access_token/refresh_token from URL fragment
 * Fallback: PKCE code exchange (if Supabase sends a code param)
 */
async function handleAuthCallback(url: string): Promise<void> {
  console.log('[Mobile Auth] Processing auth callback...');

  try {
    const urlObj = new URL(url);
    const searchParams = new URLSearchParams(urlObj.search);
    const hashParams = new URLSearchParams(urlObj.hash.substring(1));

    // Try to get tokens from URL fragment (implicit flow) or search params
    const accessToken = hashParams.get('access_token') || searchParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token') || searchParams.get('refresh_token');
    const code = searchParams.get('code');

    const supabase = getClient();

    if (accessToken && refreshToken) {
      // Implicit flow: tokens directly in URL fragment
      console.log('[Mobile Auth] Setting session from implicit flow tokens...');
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error) {
        console.error('[Mobile Auth] Failed to set session:', error);
        goto('/auth?error=session_failed');
        return;
      }

      if (data.session) {
        CurrentSession.set(data.session);
        console.log('[Mobile Auth] Session established, redirecting to /med');
        goto('/med');
      }
    } else if (code) {
      // PKCE fallback: exchange authorization code for session
      console.log('[Mobile Auth] Exchanging PKCE code for session...');
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        console.error('[Mobile Auth] Code exchange failed:', error);
        goto('/auth?error=code_exchange_failed');
        return;
      }

      if (data.session) {
        CurrentSession.set(data.session);
        console.log('[Mobile Auth] PKCE session established, redirecting to /med');
        goto('/med');
      }
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
 */
export async function signInWithMagicLink(email: string): Promise<{ error: Error | null }> {
  const supabase = getClient();

  const redirectUrl = isNativePlatform()
    ? `https://${UNIVERSAL_LINK_HOST}${AUTH_CALLBACK_PATH}`
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
  CurrentSession.set(null);

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
      return null;
    }

    if (session) {
      CurrentSession.set(session);
    }
    return session;
  } catch (error) {
    console.error('[Mobile Auth] Session refresh failed:', error);
    return null;
  }
}

/**
 * Get the current session
 */
export function getSession(): Session | null {
  return CurrentSession.get();
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  return CurrentSession.get() !== null;
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
      if (session) {
        CurrentSession.set(session);
      }
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
      const supabase = getClient();
      const { data, error } = await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });

      if (!error && data.session) {
        CurrentSession.set(data.session);
        return data.session;
      }
    }
  } catch (error) {
    console.error('[Mobile Auth] Failed to restore session:', error);
  }

  return null;
}
