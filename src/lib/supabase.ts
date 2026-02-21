//import { createClient } from "@supabase/supabase-js";
//import { env } from '$env/dynamic/public'
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import {
  PUBLIC_SUPABASE_URL,
  PUBLIC_SUPABASE_ANON_KEY,
} from "$env/static/public";
import { isCapacitorBuild } from "$lib/config/platform";

const clients = new Map<string, SupabaseClient>();

// Storage adapter that uses @capacitor/preferences (native key-value store)
// so the Supabase session survives full app restarts on iOS/Android.
const capacitorStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const { Preferences } = await import("@capacitor/preferences");
      const { value } = await Preferences.get({ key });
      return value;
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      const { Preferences } = await import("@capacitor/preferences");
      await Preferences.set({ key, value });
    } catch {}
  },
  async removeItem(key: string): Promise<void> {
    try {
      const { Preferences } = await import("@capacitor/preferences");
      await Preferences.remove({ key });
    } catch {}
  },
};

export function setClient(
  client: SupabaseClient,
  clientName: string = "default",
) {
  const existingClient = clients.get(clientName);
  if (existingClient != undefined) {
    // Only warn if trying to set a different client instance
    if (existingClient !== client) {
      console.warn(
        `Supabase client ${clientName} already exists with different instance`,
      );
    }
    // Don't warn for same client instance (common during hydration)
    return;
  }
  clients.set(clientName, client);
}

export function getClient(clientName: string = "default"): SupabaseClient {
  if (!PUBLIC_SUPABASE_URL || !PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error("Supabase environment variables are not set");
  }

  const client = clients.get(clientName);
  if (client == undefined) {
    if (clientName == "default") {
      const newClient = isCapacitorBuild()
        ? createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
            auth: {
              flowType: "implicit",
              detectSessionInUrl: false,
              persistSession: true,
              autoRefreshToken: true,
              storage: capacitorStorage,
            },
          })
        : createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
      clients.set("default", newClient);
      return newClient;
    } else {
      throw new Error(`Supabase client ${clientName} not found`);
    }
  }
  return client;
}
