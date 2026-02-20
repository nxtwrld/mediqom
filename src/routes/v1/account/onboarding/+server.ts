import { error, json, type RequestHandler } from "@sveltejs/kit";
import { verifyHash } from "$lib/encryption/hash";
import { log } from "$lib/logging/logger";

export const POST: RequestHandler = async ({
  request,
  locals: { supabase, safeGetSession, user },
}) => {
  const { session } = await safeGetSession();

  if (!session || !user) {
    return error(401, { message: "Unauthorized" });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return error(400, { message: "Invalid JSON body" });
  }

  const {
    fullName,
    avatarUrl,
    language,
    subscription,
    passphrase,
    publicKey,
    privateKey,
    key_hash,
    documents,
  } = body;

  if (!fullName || !publicKey || !privateKey || !key_hash) {
    return error(400, { message: "Missing required fields" });
  }

  if (passphrase && !(await verifyHash(passphrase, key_hash))) {
    return json({ error: "Invalid passphrase" }, { status: 400 });
  }

  // Update profile
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      fullName,
      avatarUrl,
      subscription,
      language,
      publicKey,
      updated_at: new Date(),
    })
    .eq("owner_id", user.id)
    .eq("auth_id", user.id);

  if (profileError) {
    log.api.error("profile error", profileError);
    return json({ error: profileError.message }, { status: 500 });
  }

  // Store private key
  log.api.debug("update private key");

  const { error: keyError } = await supabase.from("private_keys").upsert({
    id: user.id,
    privateKey,
    key_hash,
    key_pass: passphrase ?? null,
    updated_at: new Date(),
  });

  if (keyError) {
    log.api.error("key error", keyError);
    await clear(["profiles"], supabase, user);
    return json({ error: keyError.message }, { status: 500 });
  }

  // Create default profile documents
  if (documents && Array.isArray(documents)) {
    for (const doc of documents) {
      const { type, metadata, content, keys } = doc;

      log.api.debug("document", type);
      const { data: documentInsert, error: documentInsertError } =
        await supabase
          .from("documents")
          .insert([
            {
              user_id: user.id,
              type,
              metadata,
              content,
              author_id: user.id,
              attachments: [],
            },
          ])
          .select("id");

      if (documentInsertError) {
        log.api.error("Error inserting document", documentInsertError);
        await clear(
          ["profiles", "private_keys", "documents", "keys"],
          supabase,
          user,
        );
        return json({ error: "Error inserting document" }, { status: 500 });
      }

      const document_id = documentInsert[0].id;

      keys.forEach((key: any) => {
        key.user_id = user.id;
        key.owner_id = user.id;
        key.document_id = document_id;
        key.author_id = user.id;
        log.api.debug("key", key);
      });

      const { error: keysInsertError } = await supabase
        .from("keys")
        .insert(keys);

      if (keysInsertError) {
        log.api.error("Error inserting keys", keysInsertError);
        await clear(
          ["profiles", "private_keys", "documents", "keys"],
          supabase,
          user,
        );
        return json({ error: "Error inserting keys" }, { status: 500 });
      }
    }
  }

  return json({ success: true });
};

function clear(clearing: string[], supabase: any, user: any) {
  return Promise.all(
    clearing.map(async (table) => {
      switch (table) {
        case "profiles":
          await supabase.from("profiles").upsert({
            id: user.id,
            auth_id: user.id,
            fullName: null,
            avatarUrl: null,
            subscription: null,
            publicKey: null,
          });
          break;
        case "private_keys":
          await supabase.from("private_keys").delete().eq("id", user.id);
          break;
        case "documents":
          await supabase.from("documents").delete().eq("user_id", user.id);
          break;
        case "keys":
          await supabase.from("keys").delete().eq("user_id", user.id);
          break;
      }
    }),
  );
}
