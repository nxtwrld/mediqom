import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { isNativePlatform, isCapacitorBuild } from '$lib/config/platform';

// @ts-ignore - __CAPACITOR_BUILD__ is defined at build time
const IS_CAPACITOR = typeof __CAPACITOR_BUILD__ !== 'undefined' && __CAPACITOR_BUILD__ === true;

// Disable SSR for Capacitor builds - prevents server load from being expected
export const ssr = !IS_CAPACITOR;

// Ignore trailing slash for Capacitor to prevent redirect issues
export const trailingSlash = IS_CAPACITOR ? 'ignore' : 'always';

export const load: PageLoad = async ({ parent, url }) => {
  console.log('[Auth Page] Load called', { IS_CAPACITOR, pathname: url?.pathname });

  // For Capacitor/mobile builds, handle auth check on client side
  if (IS_CAPACITOR || isNativePlatform() || isCapacitorBuild()) {
    try {
      const { session } = await parent();
      const redirectPath = url.searchParams.get('redirect') || '/med';

      // If user is already logged in, redirect to med
      if (session) {
        console.log('[Auth Page] Mobile: User already logged in, redirecting to:', redirectPath);
        redirect(303, redirectPath);
      }
    } catch (e) {
      console.log('[Auth Page] Mobile: Error getting parent data, continuing without session', e);
    }

    return {
      url: url.origin || '',
      isMobile: true
    };
  }

  // For web, data comes from +page.server.ts
  return {};
};
