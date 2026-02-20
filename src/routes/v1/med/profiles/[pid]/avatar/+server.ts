import { error, json, type RequestHandler } from "@sveltejs/kit";

export const GET: RequestHandler = async ({
  request,
  params,
  locals: { supabase, safeGetSession, user },
}) => {
  const { session } = await safeGetSession();
  if (!session || !user) {
    throw error(401, "Unauthorized");
  }
  const url = new URL(request.url);
  const path = url.searchParams.get("path");
  const storagePath = params.pid + "_" + path;

  const { data, error: errorDownload } = await supabase.storage
    .from("avatars")
    .download(storagePath);

  if (errorDownload) {
    console.error("Error downloading avatar:", errorDownload);
    throw error(404, { message: errorDownload.message || "Avatar not found" });
  }

  return new Response(data);
};

// upload new avatar
export const POST: RequestHandler = async ({
  request,
  params,
  locals: { supabase, safeGetSession, user },
}) => {
  console.log("[Avatar] POST request started for profile:", params.pid);
  try {
    const { session } = await safeGetSession();
    console.log("[Avatar] Session check:", !!session, "User:", !!user);

    if (!session || !user) {
      throw error(401, "Unauthorized");
    }

    const body = await request.json();
    console.log("[Avatar] Request body keys:", Object.keys(body));
    const { file: base64, filename, type } = body;
    console.log(
      "[Avatar] Filename:",
      filename,
      "Type:",
      type,
      "Base64 length:",
      base64?.length,
    );
    // convert base64 to blob
    const base64Data = base64.replace(/^data:image\/\w+;base64,/, "");
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: type });
    console.log("[Avatar] Blob created, size:", blob.size);

    console.log("[Avatar] Uploading to storage...");
    const { error: errorUploading } = await supabase.storage
      .from("avatars")
      .upload(params.pid + "_" + filename, blob, {
        upsert: true,
        contentType: type,
      });
    if (errorUploading) {
      console.error("Error uploading avatar:", errorUploading);
      throw error(500, {
        message: errorUploading.message || "Failed to upload avatar",
      });
    }
    console.log("uploaded", filename);

    const { error: errorUpdate } = await supabase
      .from("profiles")
      .update({ avatarUrl: filename })
      .match({ id: params.pid });
    if (errorUpdate) {
      console.error("Error updating profile:", errorUpdate);
      // Clean up the uploaded file
      await supabase.storage
        .from("avatars")
        .remove([params.pid + "_" + filename]);
      throw error(500, {
        message: errorUpdate.message || "Failed to update profile",
      });
    }

    return json({
      filename,
    });
  } catch (err) {
    // Re-throw SvelteKit errors
    if (err && typeof err === "object" && "status" in err) {
      throw err;
    }
    console.error("Unexpected error in avatar upload:", err);
    throw error(500, {
      message: err instanceof Error ? err.message : "Unexpected error",
    });
  }
};
