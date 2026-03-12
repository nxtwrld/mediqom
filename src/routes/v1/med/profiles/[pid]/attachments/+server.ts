import { error, json, type RequestHandler } from "@sveltejs/kit";
import { Buffer } from "node:buffer";
import { type Attachment } from "$lib/documents/types.d";

export const GET: RequestHandler = async ({
  request,
  params,
  locals: { supabase, safeGetSession, user },
}) => {
  const { session } = await safeGetSession();
  if (!session || !user) {
    return error(401, "Unauthorized");
  }
  const url = new URL(request.url);
  const path = url.searchParams.get("path");
  if (!path) {
    return error(400, "Path parameter required");
  }
  const { data, error: errorDownload } = await supabase.storage
    .from("attachments")
    .download(path);

  if (errorDownload) {
    return json({ error: errorDownload.message || "Failed to download attachment" }, { status: 500 });
  }

  // Convert binary back to base64 text for client decryption
  const arrayBuffer = await data.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  return new Response(base64, {
    headers: { "Content-Type": "text/plain" },
  });
};

// upload attachment
export const POST: RequestHandler = async ({
  request,
  params,
  locals: { supabase, safeGetSession, user },
}) => {
  const { session } = await safeGetSession();

  if (!session || !user) {
    return error(401, "Unauthorized");
  }

  const userID = user.id;

  const { file: fileData } = await request.json();
  // generate random filename
  const filename =
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15);

  // Convert base64 encrypted string to binary to reduce storage size by ~33%
  const binaryData = Buffer.from(fileData, "base64");
  const file = new File([binaryData], filename, { type: "application/octet-stream" });

  const { error: errorUploading } = await supabase.storage
    .from("attachments")
    .upload(userID + "/" + filename, file);
  if (errorUploading) {
    console.error("Upload error:", errorUploading.message);
    return json({ error: errorUploading.message || "Failed to upload attachment" }, { status: 500 });
  }

  const { data } = supabase.storage
    .from("attachments")
    .getPublicUrl(userID + "/" + filename);

  return json({
    url: data.publicUrl,
    path: userID + "/" + filename,
  } as Attachment);
};

export const DELETE: RequestHandler = async ({
  request,
  params,
  locals: { supabase, safeGetSession, user },
}) => {
  const { session } = await safeGetSession();
  if (!session || !user) {
    return error(401, "Unauthorized");
  }
  const url = new URL(request.url);
  const path = url.searchParams.get("path");
  const storagePath = path;

  if (!storagePath) {
    return error(400, "Invalid path");
  }

  const { error: errorDelete } = await supabase.storage
    .from("attachments")
    .remove([storagePath]);

  if (errorDelete) {
    return json({ error: errorDelete.message || "Failed to delete attachment" }, { status: 500 });
  }

  return json({ deleted: true });
};
