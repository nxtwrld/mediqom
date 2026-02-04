# Supabase Magic Link Auth for SvelteKit + Capacitor Mobile Apps

Step-by-step guide for integrating Supabase magic link authentication in a SvelteKit app deployed as a native iOS/Android app via Capacitor, using Universal Links (iOS) / App Links (Android).

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Supabase Project Setup](#2-supabase-project-setup)
3. [Platform Detection](#3-platform-detection)
4. [Supabase Client — Dual Mode](#4-supabase-client--dual-mode)
5. [Magic Link Service](#5-magic-link-service)
6. [Auth Callback Page](#6-auth-callback-page)
7. [Deep Link Handler](#7-deep-link-handler)
8. [Root Layout — Auth Listener](#8-root-layout--auth-listener)
9. [Auth Store](#9-auth-store)
10. [Vite Mobile Build Config](#10-vite-mobile-build-config)
11. [Capacitor Config](#11-capacitor-config)
12. [iOS — Universal Links](#12-ios--universal-links)
13. [Android — App Links](#13-android--app-links)
14. [Mobile Build Script](#14-mobile-build-script)
15. [Testing Checklist](#15-testing-checklist)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. Prerequisites

- SvelteKit project with TypeScript
- `@supabase/supabase-js` and `@supabase/ssr` installed
- Capacitor 6+ initialized (`npx cap init`)
- Capacitor plugins: `@capacitor/app`, `@capacitor/preferences`, `@capacitor/status-bar`

```bash
npm install @supabase/supabase-js @supabase/ssr
npm install @capacitor/core @capacitor/app @capacitor/preferences
```

---

## 2. Supabase Project Setup

### Dashboard Configuration

1. Go to **Authentication → URL Configuration** in the Supabase dashboard.

2. **Site URL**: Set to your production web URL (e.g. `https://yourapp.com`).

3. **Redirect URLs**: Add both web and mobile callback URLs:
   ```
   https://yourapp.com/auth/callback
   https://yourapp.com/auth/callback/**
   ```
   The mobile Universal Link uses the same `https://` domain — Supabase doesn't need to know about custom URL schemes.

4. **Auth Providers → Email**: Ensure "Enable Email OTP" is on and "Confirm email" is enabled.

### Key Concept — Why Universal Links, Not Custom Schemes

Use `https://yourapp.com/auth/callback` as the redirect URL for both web and mobile. On mobile, iOS/Android intercept this HTTPS URL via Universal Links / App Links and open the app directly instead of the browser. This avoids issues with custom URL schemes (`myapp://`) being blocked by email clients.

---

## 3. Platform Detection

Create a module that detects whether the app is running as a Capacitor native build or in the browser.

**`src/lib/config/platform.ts`**

```typescript
import { browser } from '$app/environment';

declare global {
  interface Window {
    __CAPACITOR_BUILD__?: boolean;
  }
  const __CAPACITOR_BUILD__: boolean | undefined;
}

/** Build-time flag — set via Vite `define` in the mobile config */
export function isCapacitorBuild(): boolean {
  try {
    return typeof __CAPACITOR_BUILD__ !== 'undefined' && __CAPACITOR_BUILD__ === true;
  } catch {
    return false;
  }
}

/** Runtime check — Capacitor native platform */
export function isNativePlatform(): boolean {
  if (!browser) return false;
  if (isCapacitorBuild()) return true;
  if (window.__CAPACITOR_BUILD__) return true;
  try {
    const w = window as Record<string, unknown>;
    const cap = w['Capacitor'] as { isNativePlatform?: () => boolean } | undefined;
    return cap?.isNativePlatform?.() ?? false;
  } catch {
    return false;
  }
}

/** Returns 'ios', 'android', or 'web' */
export function getPlatform(): 'ios' | 'android' | 'web' {
  if (!browser) return 'web';
  try {
    const w = window as Record<string, unknown>;
    const cap = w['Capacitor'] as { getPlatform?: () => string } | undefined;
    const platform = cap?.getPlatform?.();
    if (platform === 'ios' || platform === 'android') return platform;
  } catch { /* Capacitor not available */ }
  return 'web';
}

/** Auth redirect URL — Universal Link on mobile, origin-relative on web */
export function getAuthRedirectUrl(): string {
  if (isNativePlatform()) {
    return 'https://yourapp.com/auth/callback';  // <-- Your domain
  }
  if (browser) {
    return `${window.location.origin}/auth/callback`;
  }
  return '/auth/callback';
}
```

---

## 4. Supabase Client — Dual Mode

This is the critical piece. `@supabase/ssr`'s `createBrowserClient` **hardcodes `flowType: 'pkce'`** internally, silently overriding any `flowType: 'implicit'` option you pass. PKCE requires a `code_verifier` stored in cookies/sessionStorage, which is lost when the app restarts via a Universal Link tap.

The fix: on mobile, use `createClient` from `@supabase/supabase-js` directly.

**`src/lib/services/auth/supabase.ts`**

```typescript
import { createBrowserClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_KEY } from '$env/static/public';
import { isCapacitorBuild } from '$lib/config/platform';

function buildClient() {
  if (isCapacitorBuild()) {
    // Mobile: use createClient directly with implicit flow.
    // @supabase/ssr's createBrowserClient hardcodes flowType:'pkce' which
    // breaks deep link auth (code_verifier is lost on app restart).
    return createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_KEY, {
      auth: {
        flowType: 'implicit',
        detectSessionInUrl: false, // we handle deep links manually
        persistSession: true,
        autoRefreshToken: true,
      }
    });
  }
  // Web: use SSR-aware client for cookie-based auth
  return createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_KEY);
}

export const supabase = buildClient();
export const auth = supabase.auth;
```

### Why This Works

| | Web | Mobile |
|---|---|---|
| **Client** | `createBrowserClient` (SSR) | `createClient` (standard) |
| **Flow** | PKCE (default) | Implicit |
| **Session storage** | Cookies (server-readable) | localStorage (persisted in WebView) |
| **Redirect format** | `?code=abc123` | `#access_token=...&refresh_token=...` |
| **Token exchange** | `exchangeCodeForSession(code)` | `setSession({ access_token, refresh_token })` |

---

## 5. Magic Link Service

**`src/lib/services/auth/magicLink.ts`**

```typescript
import { supabase } from './supabase';
import { getAuthRedirectUrl } from '$lib/config/platform';

export class MagicLinkAuth {
  static async sendEmailLink(email: string) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: getAuthRedirectUrl(),
        shouldCreateUser: true,
      }
    });
    if (error) throw error;
    return { success: true, message: 'Check your email for the magic link!' };
  }

  static async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }
}
```

The key: `emailRedirectTo` uses `getAuthRedirectUrl()`, which returns the Universal Link URL on mobile. Supabase generates the magic link pointing to that URL. When tapped, iOS/Android intercepts it and opens the app.

---

## 6. Auth Callback Page

**`src/routes/auth/callback/+page.svelte`**

This page handles the redirect on **web**. On mobile, the deep link handler (step 7) usually fires first, but this page serves as a fallback.

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/services/auth/supabase';
  import { isNativePlatform } from '$lib/config/platform';

  let processing = $state(true);
  let error = $state('');

  onMount(async () => {
    try {
      // On mobile, try to extract tokens from URL fragment (implicit flow)
      if (isNativePlatform() && window.location.hash) {
        const params = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');

        if (accessToken && refreshToken) {
          const { error: setError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          });
          if (!setError) {
            goto('/app', { replaceState: true });
            return;
          }
        }
      }

      // Web: Supabase client auto-processes the URL parameters
      await new Promise(resolve => setTimeout(resolve, 1000));
      const { data } = await supabase.auth.getSession();

      if (data.session) {
        goto('/app', { replaceState: true });
        return;
      }

      error = 'Authentication failed. Please try again.';
    } catch (err) {
      error = 'An unexpected error occurred.';
    } finally {
      processing = false;
    }

    // Redirect to login on error after a brief delay
    if (error) {
      setTimeout(() => {
        const target = isNativePlatform() ? '/onboarding' : '/login';
        goto(target, { replaceState: true });
      }, 3000);
    }
  });
</script>

<div class="auth-callback">
  {#if error}
    <p>{error}</p>
  {:else if processing}
    <p>Signing you in...</p>
  {:else}
    <p>Success! Redirecting...</p>
  {/if}
</div>
```

---

## 7. Deep Link Handler

This module is called by the Capacitor `appUrlOpen` listener when the app receives a Universal Link.

**`src/lib/services/auth/deepLinkHandler.ts`**

```typescript
import { supabase } from './supabase';
import { goto } from '$app/navigation';

export async function handleDeepLinkAuth(url: string): Promise<void> {
  try {
    const parsed = new URL(url);

    // 1. PKCE flow fallback — exchange authorization code
    const code = parsed.searchParams.get('code');
    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error && data.session) {
        // Update your auth store here
        await goto('/app', { replaceState: true });
        return;
      }
    }

    // 2. Implicit flow — extract tokens from URL fragment
    const fragment = parsed.hash.startsWith('#') ? parsed.hash.substring(1) : '';
    if (fragment) {
      const params = new URLSearchParams(fragment);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (accessToken && refreshToken) {
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        });
        if (!error && data.session) {
          // Update your auth store here
          await goto('/app', { replaceState: true });
          return;
        }
      }
    }

    // 3. Fallback — check if Supabase auto-detected the session
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await goto('/app', { replaceState: true });
      return;
    }

    await goto('/login?error=auth_failed', { replaceState: true });
  } catch (err) {
    console.error('Deep link auth handler error:', err);
    await goto('/login?error=auth_failed', { replaceState: true });
  }
}
```

---

## 8. Root Layout — Auth Listener

Register Capacitor deep link listeners and Supabase auth state change handlers on app mount.

**`src/routes/+layout.svelte`** (relevant parts)

```svelte
<script lang="ts">
  import { supabase } from '$lib/services/auth/supabase';
  import { isNativePlatform } from '$lib/config/platform';
  import { onMount } from 'svelte';

  onMount(() => {
    // Initialize mobile features (deep link listeners, etc.)
    if (isNativePlatform()) {
      initMobile();
    }

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        // Update your auth store / invalidate server data
        // On mobile, update auth store directly (no server to invalidate)
        if (isNativePlatform()) {
          // authStore.updateFromServer(session);
        }
      }
    });

    return () => subscription.unsubscribe();
  });

  async function initMobile() {
    const { App } = await import('@capacitor/app');

    // Deep link listener — app is already running
    App.addListener('appUrlOpen', async (data: { url: string }) => {
      const url = new URL(data.url);
      if (url.pathname.includes('/auth/callback')) {
        const { handleDeepLinkAuth } = await import('$lib/services/auth/deepLinkHandler');
        await handleDeepLinkAuth(data.url);
      }
    });

    // Cold start — app launched from a Universal Link
    const launchUrl = await App.getLaunchUrl();
    if (launchUrl?.url) {
      const url = new URL(launchUrl.url);
      if (url.pathname.includes('/auth/callback')) {
        const { handleDeepLinkAuth } = await import('$lib/services/auth/deepLinkHandler');
        await handleDeepLinkAuth(launchUrl.url);
      }
    }
  }
</script>

<slot />
```

---

## 9. Auth Store

A reactive store (Svelte 5 runes) that holds the current session state. On mobile, it initializes from the Supabase client directly (no server session).

**`src/lib/stores/auth.svelte.ts`** (simplified)

```typescript
import { supabase } from '$lib/services/auth/supabase';
import type { User, Session } from '@supabase/supabase-js';

class AuthStore {
  user = $state<User | null>(null);
  session = $state<Session | null>(null);

  get isAuthenticated() {
    return !!this.user;
  }

  /** Initialize from client session — used on mobile where there's no SSR */
  async initializeFromClient() {
    const { data: { session } } = await supabase.auth.getSession();
    this.updateFromServer(session);
  }

  /** Update state from a session object */
  updateFromServer(session: Session | null) {
    this.session = session;
    this.user = session?.user ?? null;
  }

  async signOut() {
    await supabase.auth.signOut();
    this.user = null;
    this.session = null;
  }
}

export const authStore = new AuthStore();
```

---

## 10. Vite Mobile Build Config

The mobile build uses a separate Vite config that:
- Sets `__CAPACITOR_BUILD__` to `true` at build time (for platform detection)
- Injects a `window.__CAPACITOR_BUILD__` flag into the HTML (for runtime detection)
- Defines the API base URL (mobile needs absolute URLs since there's no same-origin server)

**`vite.config.mobile.ts`**

```typescript
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

/** Injects mobile-specific scripts into the HTML */
function mobileInitPlugin(): Plugin {
  return {
    name: 'mobile-init',
    transformIndexHtml(html) {
      const script = `
<script>
  window.global = window;
  window.__CAPACITOR_BUILD__ = true;

  // Intercept SvelteKit __data.json fetches (no server in static SPA)
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
    if (url.includes('__data.json')) {
      return Promise.resolve(new Response(JSON.stringify({ type: 'data', nodes: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    return originalFetch.apply(this, args);
  };
</script>`;
      return html.replace('</head>', `${script}\n</head>`);
    }
  };
}

export default defineConfig({
  plugins: [sveltekit(), mobileInitPlugin()],
  define: {
    __CAPACITOR_BUILD__: 'true',
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify(
      process.env.VITE_API_BASE_URL || 'https://yourapp.com'
    )
  },
  build: {
    outDir: 'mobile/dist',
    target: 'esnext',
  }
});
```

You also need a mobile SvelteKit config that uses `adapter-static`:

**`svelte.config.mobile.js`**

```javascript
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: 'mobile/dist',
      assets: 'mobile/dist',
      fallback: 'index.html',  // SPA fallback
      strict: false
    }),
    prerender: {
      entries: []  // No prerendering for mobile SPA
    }
  }
};

export default config;
```

---

## 11. Capacitor Config

**`capacitor.config.ts`**

```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yourcompany.yourapp',
  appName: 'YourApp',
  webDir: 'mobile/dist',
  server: {
    // IMPORTANT: use https scheme so Universal Links work
    androidScheme: 'https',
    iosScheme: 'https'
  }
};

export default config;
```

The `iosScheme: 'https'` and `androidScheme: 'https'` settings are essential — they make the WebView use `https://` URLs internally, which is required for Universal Links / App Links to fire correctly.

---

## 12. iOS — Universal Links

### 12a. Apple App Site Association (AASA) File

Host this at `https://yourapp.com/.well-known/apple-app-site-association` (no file extension, `Content-Type: application/json`):

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAMID.com.yourcompany.yourapp",
        "paths": ["/auth/callback", "/auth/callback/*"]
      }
    ]
  }
}
```

Replace `TEAMID` with your Apple Developer Team ID and `com.yourcompany.yourapp` with your `appId` from `capacitor.config.ts`.

### 12b. Xcode — Associated Domains

1. Open the project in Xcode: `npx cap open ios`
2. Select your target → **Signing & Capabilities** → **+ Capability** → **Associated Domains**
3. Add: `applinks:yourapp.com`

### 12c. Xcode — Info.plist URL Types (optional fallback)

If you also want a custom URL scheme as a fallback:

1. **Info** tab → **URL Types** → **+**
2. Set **URL Schemes** to `yourapp` (e.g., `yourapp://`)
3. Set **Identifier** to `com.yourcompany.yourapp`

Universal Links are preferred over custom schemes for magic links because email clients block custom schemes.

---

## 13. Android — App Links

### 13a. Digital Asset Links File

Host at `https://yourapp.com/.well-known/assetlinks.json`:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.yourcompany.yourapp",
    "sha256_cert_fingerprints": ["YOUR_SHA256_FINGERPRINT"]
  }
}]
```

Get your SHA-256 fingerprint:
```bash
keytool -list -v -keystore your-keystore.jks -alias your-alias
```

### 13b. AndroidManifest.xml

Capacitor should auto-generate intent filters, but verify in `android/app/src/main/AndroidManifest.xml`:

```xml
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="https" android:host="yourapp.com" android:pathPrefix="/auth/callback" />
</intent-filter>
```

---

## 14. Mobile Build Script

Automate the config-swap + build + restore cycle:

**`scripts/mobile-build.js`**

```javascript
import { execSync } from 'child_process';
import { copyFileSync, existsSync, unlinkSync, renameSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const SVELTE_CONFIG = resolve(root, 'svelte.config.js');
const SVELTE_BACKUP = resolve(root, 'svelte.config.js.bak');
const SVELTE_MOBILE = resolve(root, 'svelte.config.mobile.js');

// Server route files to remove during mobile builds
const SERVER_FILES = [
  resolve(root, 'src/routes/+layout.server.ts'),
  // Add any other server-only files here
];

try {
  // Backup
  copyFileSync(SVELTE_CONFIG, SVELTE_BACKUP);

  // Swap to mobile config
  copyFileSync(SVELTE_MOBILE, SVELTE_CONFIG);

  // Remove server route files (they cause __data.json 500s in static SPA)
  for (const f of SERVER_FILES) {
    if (existsSync(f)) renameSync(f, f + '.bak');
  }

  // Build
  execSync('npx vite build --config vite.config.mobile.ts', {
    cwd: root, stdio: 'inherit'
  });

  console.log('Mobile build complete! Output in mobile/dist/');
} finally {
  // Restore
  if (existsSync(SVELTE_BACKUP)) {
    copyFileSync(SVELTE_BACKUP, SVELTE_CONFIG);
    unlinkSync(SVELTE_BACKUP);
  }
  for (const f of SERVER_FILES) {
    if (existsSync(f + '.bak')) renameSync(f + '.bak', f);
  }
}
```

Add to `package.json`:
```json
{
  "scripts": {
    "build:mobile": "node scripts/mobile-build.js",
    "cap:sync": "npx cap sync",
    "cap:open:ios": "npx cap open ios",
    "cap:open:android": "npx cap open android"
  }
}
```

---

## 15. Testing Checklist

### Build & Deploy
```bash
npm run build:mobile
npx cap sync
npx cap open ios        # or android
```

Build and run from Xcode / Android Studio on a real device (simulators don't support Universal Links reliably).

### Test Flow

1. Open the app → login screen
2. Enter email → tap "Send magic link"
3. Open email on the **same device**
4. Tap the magic link
5. **Expected**: App opens directly (not the browser), authenticates, and navigates to `/app`
6. Force-quit and reopen the app → session should persist
7. Test on web too — verify SSR/cookie-based flow still works

### Common Mistakes

- **Testing with old magic links**: After switching from PKCE to implicit flow, old links still contain `?code=...`. Request a **new** magic link.
- **Simulator testing**: Universal Links don't work reliably on iOS Simulator. Use a real device.
- **AASA caching**: Apple caches the AASA file aggressively. After updating it, reinstall the app and wait. You can check the CDN at `https://app-site-association.cdn-apple.com/a/v1/yourapp.com`.

---

## 16. Troubleshooting

### `validation_failed` or `code_verifier` errors
**Cause**: The Supabase client is using PKCE flow. The `code_verifier` is stored in cookies/sessionStorage, which is lost when the app restarts via Universal Link.
**Fix**: Ensure mobile builds use `createClient` (not `createBrowserClient`) with `flowType: 'implicit'`. See step 4.

### Magic link opens in browser instead of app
**Cause**: Universal Links / App Links not configured correctly.
**Check**:
- AASA file at `https://yourapp.com/.well-known/apple-app-site-association`
- Associated Domains capability in Xcode: `applinks:yourapp.com`
- `androidScheme: 'https'` in Capacitor config
- App is installed from a build (not via Xcode debug sometimes)

### Session not persisting after app restart
**Cause**: `persistSession: false` or storage not available.
**Fix**: Ensure `persistSession: true` in the mobile client options. Supabase uses `localStorage` by default in the WebView, which persists.

### `detectSessionInUrl` auto-processing
When set to `true` (default), Supabase auto-parses tokens from the URL on page load. On mobile, the deep link handler processes tokens before the page renders, so set `detectSessionInUrl: false` and handle it manually to avoid race conditions.

### Deep link not firing on cold start
The `appUrlOpen` Capacitor listener only fires when the app is already running. For cold starts (app was killed), use `App.getLaunchUrl()` after Capacitor initializes. See step 8.

### `goto()` navigation silently fails on mobile (stuck on redirect screen)
**Cause**: Calling `invalidate('supabase:auth')` on native platforms marks the root layout's server data as stale. When `goto('/app')` runs, SvelteKit's client router tries to re-fetch `__data.json` for the invalidated `+layout.server.ts` data. With adapter-static and `prerender: { entries: [] }`, those files don't exist. Capacitor's server returns the HTML fallback instead of JSON, causing a parse error that silently aborts the navigation.

**Fix**: In the `onAuthStateChange` handler in `+layout.svelte`, skip `invalidate()` on native platforms. The client-side `authStore.updateFromServer(session)` is sufficient:

```svelte
supabase.auth.onAuthStateChange((event, _session) => {
  // On native, update auth store directly and skip invalidate().
  // invalidate() causes SvelteKit to fetch __data.json which doesn't
  // exist in the static SPA build, breaking client-side navigation.
  if (isNativePlatform()) {
    authStore.updateFromServer(_session);
    return;
  }

  // On web, invalidate to sync server and client session state
  if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
    invalidate('supabase:auth');
  } else if (_session?.expires_at !== data.session?.expires_at) {
    invalidate('supabase:auth');
  }
});
```

**Why it happens**: `+layout.server.ts` declares `depends('supabase:auth')`. When `invalidate('supabase:auth')` is called, SvelteKit marks that data as stale. On the next navigation, the client router must re-fetch it. On web (Vercel), the server responds with fresh JSON. On mobile (adapter-static), there's no server — the fetch returns the HTML fallback page, which can't be parsed as JSON.

### Authenticated user stuck on home page / redirected to onboarding on cold start
**Cause**: Race condition between auth initialization and page routing. On mobile, `data.session` from the server layout is `null` (no SSR). Svelte mounts children before parents, so the home page's `onMount` fires before the root layout's `onMount` (which initializes auth from the persisted Supabase session). At this point `authStore.isAuthenticated` is `false`, so the page navigates to `/onboarding` before the session is recovered.

**Fix**: Add a `waitForInitialization()` promise to the auth store and await it before routing:

```typescript
// In AuthStore class
private initResolvers: Array<() => void> = [];

waitForInitialization(): Promise<void> {
  if (this.hasInitialized) return Promise.resolve();
  return new Promise((resolve) => {
    this.initResolvers.push(resolve);
  });
}

// Call resolvers when hasInitialized is set to true in updateFromServer()
```

```svelte
<!-- In +page.svelte -->
<script lang="ts">
  onMount(async () => {
    await authStore.waitForInitialization();
    if (authStore.isAuthenticated) {
      goto('/app');
    } else {
      goto(isNativePlatform() ? '/onboarding' : '/login');
    }
  });
</script>
```
