import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { browser } from '$app/environment';

// @ts-ignore - __CAPACITOR_BUILD__ is defined at build time
const IS_CAPACITOR = typeof __CAPACITOR_BUILD__ !== 'undefined' && __CAPACITOR_BUILD__ === true;

export const load: PageLoad = async ({ url }) => {
  console.log('[Root Page] Load called', { IS_CAPACITOR, browser, pathname: url?.pathname });

  // For Capacitor builds, redirect to auth page
  // Use throw redirect for server-side, but for client-side SPA we need to be more careful
  if (IS_CAPACITOR) {
    console.log('[Root Page] Capacitor build - redirecting to /auth');
    // Use 303 for proper redirect handling in SPA mode
    redirect(303, '/auth');
  }

  return {};
};
