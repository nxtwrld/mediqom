import { error, json, type RequestHandler } from "@sveltejs/kit";

export const GET: RequestHandler = async ({
  request,
  locals: { supabase, safeGetSession, user },
}) => {
  // Removed noisy console.log

  try {
    const { session } = await safeGetSession();

    if (!session || !user) {
      return error(401, { message: "Unauthorized" });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select(
        `fullName, subscription, publicKey, avatarUrl, auth_id, id, language, private_keys(privateKey, key_hash, key_pass)`,
      )
      .eq("auth_id", user.id)
      .single();

    const { data: subscription, error: subscriptionError } = await supabase
      .from("subscriptions")
      .select("scans_base, scans_used, scans_credits")
      .eq("id", user.id)
      .single();

    if (profileError) {
      if (profileError.code === "PGRST116") {
        return error(404, { message: "Profile not found" });
      } else {
        throw profileError;
      }
    }
    if (subscriptionError && subscriptionError.code !== "PGRST116") {
      throw subscriptionError;
    }

    const scansAvailable = subscription
      ? (subscription.scans_base ?? 0) + (subscription.scans_credits ?? 0) - (subscription.scans_used ?? 0)
      : 10;

    (profile as any).subscriptionStats = {
      profiles: 5,
      scans: scansAvailable,
      default_scans: 10,
      default_profiles: 5,
    };

    return json(profile);
  } catch (authError) {
    console.error("[API] /v1/med/user - Unexpected error:", authError);
    return error(500, { message: "Internal server error" });
  }
};
