import type { SupabaseClient } from "@supabase/supabase-js";
import { error, json, type RequestHandler } from "@sveltejs/kit";

export const GET: RequestHandler = async ({
  request,
  params,
  locals: { supabase, safeGetSession, user },
}) => {
  const { session } = await safeGetSession();

  if (!session || !user) {
    return error(401, { message: "Unauthorized" });
  }

  const { data, error: errorDb } = await supabase
    .from("profiles_links")
    .select(
      "profiles!profiles_links_profile_id_fkey(id, fullName, language, avatarUrl, publicKey), status",
    )
    .eq("profile_id", params.pid)
    .eq("parent_id", user.id)
    .single();

  if (errorDb) {
    return error(500, { message: "Database error" });
  }

  console.log("get profile", params.pid);

  return json(data);
};

export const DELETE: RequestHandler = async ({
  request,
  params,
  locals: { supabase, safeGetSession, user },
}) => {
  const { session } = await safeGetSession();

  if (!session || !user) {
    return error(401, { message: "Unauthorized" });
  }

  // map proper profile and parent ids
  const url = new URL(request.url);
  let profile_id = params.pid;
  let parent_id = user.id;

  // we are deleting a profile link from a parent
  if (url.searchParams.get("link_type") == "parent") {
    profile_id = user.id;
    parent_id = params.pid || '';
  }

  if (profile_id != user.id) {
    // let's check if the profile is a virtual profile and you are the owner of it and if so, delete the whole profile
    const { data: profile, error: errorProfile } = await supabase
      .from("profiles")
      .select("auth_id, owner_id")
      .eq("id", params.pid)
      .single();

    if (errorProfile) {
      return error(500, { message: "Database error" });
    }

    if (profile.auth_id == null && profile.owner_id == user.id) {
      // delete the profile if it has not auth_id (virutal profile) and you are the owner of it
      const { error: errorDelete } = await supabase
        .from("profiles")
        .delete()
        .eq("id", profile_id);

      if (errorDelete) {
        return error(500, { message: "Database error" });
      }
      // profile deleted and links and ll profile data cascade with it
      return json({ message: "Profile links and profile removed" });
    }
  }

  // delete just the link between profile and parent
  const { error: errorDelete } = await supabase
    .from("profiles_links")
    .delete()
    .eq("profile_id", profile_id)
    .eq("parent_id", parent_id);

  if (errorDelete) {
    return error(500, { message: "Database error" });
  }

  return json({ message: "Profile link removed" });
};
