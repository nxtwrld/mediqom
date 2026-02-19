//import { createClient } from "@supabase/supabase-js";
//import { env } from '$env/dynamic/public'
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import {
  PUBLIC_SUPABASE_URL,
  PUBLIC_SUPABASE_ANON_KEY,
} from "$env/static/public";
import { isCapacitorBuild } from '$lib/config/platform';

const clients = new Map<string, SupabaseClient>();

/*

// curently set in layout - maybe do it here....
clients.set('default', createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY));
*/

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
  console.log("Supabase - setting client:", clientName);
  clients.set(clientName, client);
}

export function getClient(clientName: string = "default"): SupabaseClient {
  if (!PUBLIC_SUPABASE_URL || !PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error("Supabase environment variables are not set");
  }

  const client = clients.get(clientName);
  if (client == undefined) {
    console.log("Supabase - creating client:", clientName, {
      url: PUBLIC_SUPABASE_URL,
    });
    if (clientName == "default") {
      const newClient = isCapacitorBuild()
        ? createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
            auth: {
              flowType: 'implicit',
              detectSessionInUrl: false,
              persistSession: true,
              autoRefreshToken: true,
            },
          })
        : createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
      clients.set("default", newClient);
      return newClient;
    } else {
      throw new Error(`Supabase client ${clientName} not found`);
    }
  }
  console.log("Supabase - getting client:", clientName);
  return client;
}
