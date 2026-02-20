import { error, json, type RequestHandler } from "@sveltejs/kit";
import { checkProfileLimit } from "$lib/billing/subscription.server";

export const GET: RequestHandler = async ({
  request,
  locals: { supabase, safeGetSession, user },
}) => {
  try {
    const { session } = await safeGetSession();

    if (!session || !user) {
      return error(401, { message: "Unauthorized" });
    }

    const { data, error: errorDb } = await supabase
      .from("profiles_links")
      .select(
        "profiles!profiles_links_profile_id_fkey(id, auth_id, owner_id, fullName, language, avatarUrl, publicKey), status",
      )
      .eq("parent_id", user.id);

    //console.log('profiles data', data);

    if (errorDb) {
      return error(500, { message: "Database error" });
    }

    return json(data);
  } catch (authError) {
    console.error("[API] /v1/med/profiles - Unexpected error:", authError);
    return error(500, { message: "Internal server error" });
  }
};

export const POST: RequestHandler = async ({
  request,
  locals: { supabase, safeGetSession, user },
}) => {
  try {
    const { session } = await safeGetSession();

    if (!session || !user) {
      return error(401, { message: "Unauthorized" });
    }

    const profileLimit = await checkProfileLimit(user.id);
    if (!profileLimit.can_create) {
      error(403, {
        message: `Profile limit reached (${profileLimit.current_count}/${profileLimit.limit})`,
      });
    }

    console.log("Saving virtual profile");
    // 1. save profile
    const profile = await request.json();

    const { data: profileData, error: errorProfile } = await supabase
      .from("profiles")
      .insert([
        {
          fullName: profile.fullName,
          language: profile.language,
          publicKey: profile.publicKey,
          owner_id: user.id,
        },
      ])
      .select();

    if (errorProfile) {
      console.log("Error saving profile", errorProfile);
      return error(500, { message: "Error saving profile" });
    }

    // 2. store profile private keys

    const { error: errorProfileKeys } = await supabase
      .from("private_keys")
      .insert([
        {
          id: profileData[0].id,
          privateKey: profile.privateKey,
          key_hash: profile.key_hash,
          key_pass: profile.key_pass,
        },
      ]);

    if (errorProfileKeys) {
      console.log("Error saving profile keys", errorProfileKeys);
      return error(500, { message: "Error saving profile keys" });
    }

    // 3. create a profile link
    const { error: errorProfileLink } = await supabase
      .from("profiles_links")
      .insert([
        {
          parent_id: user.id,
          profile_id: profileData[0].id,
          status: "approved",
        },
      ]);

    if (errorProfileLink) {
      console.log("Error saving profile link", errorProfileLink);
      return error(500, { message: "Error saving profile link" });
    }

    // Profile count is tracked via database query on profiles table
    // No need to manually decrement - checkProfileLimit counts actual profiles

    return json(profileData);
  } catch (authError) {
    console.error("[API] /v1/med/profiles POST - Unexpected error:", authError);
    return error(500, { message: "Internal server error" });
  }
};
