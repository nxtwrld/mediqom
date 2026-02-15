import { error, json, type RequestHandler } from "@sveltejs/kit";
const DOCUMENT_TYPES = ["document", "profile", "health"];
const UNIQUE_TYPES = ["profile", "health"];

export const GET: RequestHandler = async ({
  request,
  params,
  locals: { supabase, safeGetSession, user },
}) => {
  const { session } = await safeGetSession();

  const url = new URL(request.url);
  const types = url.searchParams.get("types")?.split(",") || DOCUMENT_TYPES;
  const full = url.searchParams.get("full") === "true";
  if (!session || !user) {
    return error(401, { message: "Unauthorized" });
  }
  const query = full
    ? "id, metadata, type, user_id, content, attachments, author_id, keys!inner(*)(key, owner_id)"
    : "id, metadata, type, user_id, author_id, keys!inner(*)(key, owner_id)";

  const { data: documentsLoad, error: documentsError } = await supabase
    .from("documents")
    .select(query)
    .eq("user_id", params.pid)
    .eq("keys.user_id", user.id)
    .in("type", types);

  if (documentsError) {
    console.error("Error loading documents", documentsError);
    return error(500, { message: "Error loading documents" });
  }

  return json(documentsLoad);
};

export const POST: RequestHandler = async ({
  request,
  params,
  locals: { supabase, safeGetSession, user },
}) => {
  const { session } = await safeGetSession();

  if (!session || !user) {
    return error(401, { message: "Unauthorized" });
  }

  const { type, metadata, content, attachments, keys } = await request.json();

  // Debug logging
  console.log('📝 [Documents API] POST request:', {
    hasType: !!type,
    type: type,
    hasMetadata: !!metadata,
    metadataKeys: metadata ? Object.keys(metadata) : [],
    hasContent: !!content,
    hasAttachments: !!attachments,
    hasKeys: !!keys,
    keysLength: keys?.length,
    keysIsArray: Array.isArray(keys),
  });

  if (!type || !metadata) {
    console.error('❌ [Documents API] Invalid request - missing type or metadata');
    return error(400, { message: "Invalid request" });
  }

  if (!DOCUMENT_TYPES.includes(type)) {
    return error(400, { message: "Invalid document type" });
  }

  if (UNIQUE_TYPES.includes(type)) {
    const { data: documentExists, error: documentExistsError } = await supabase
      .from("documents")
      .select("id")
      .eq("user_id", params.pid)
      .eq("type", type);

    if (documentExistsError) {
      console.error(
        "Error checking for existing document",
        documentExistsError,
      );
      return error(500, { message: "Error checking for existing document" });
    }

    if (documentExists.length) {
      console.error("Document already exists", type, params.pid);
      return error(400, { message: "Document already exists" });
    }
  }

  const { data: documentInsert, error: documentInsertError } = await supabase
    .from("documents")
    .insert([
      {
        user_id: params.pid,
        type,
        metadata,
        content,
        author_id: user.id,
        attachments,
      },
    ])
    .select("id");

  if (documentInsertError) {
    console.error("Error inserting document", documentInsertError);
    return error(500, { message: "Error inserting document" });
  }

  const document_id = documentInsert[0].id;

  if (!keys || !Array.isArray(keys) || keys.length === 0) {
    console.error('❌ [Documents API] Invalid keys array', { keys, type: typeof keys });
    await supabase.from("documents").delete().eq("id", document_id);
    return error(400, { message: "Invalid keys - keys must be a non-empty array" });
  }

  keys.forEach((key: any) => {
    key.document_id = document_id;
    key.author_id = user.id;
  });

  const { data: keysInsert, error: keysInsertError } = await supabase
    .from("keys")
    .insert(keys);

  if (keysInsertError) {
    console.error("Error inserting keys", keysInsertError);
    await supabase.from("documents").delete().eq("id", document_id);
    return error(500, { message: "Error inserting keys" });
  }

  return json({ id: document_id });
};
