import user from "$lib/user";
import {
  writable,
  type Writable,
  type Readable,
  derived,
  get,
} from "svelte/store";
import {
  importKey,
  exportKey,
  encrypt as encryptAES,
  decrypt as decryptAES,
  prepareKey,
} from "$lib/encryption/aes";
import { pemToKey, encrypt as encryptRSA } from "$lib/encryption/rsa";
import { profile, profiles } from "$lib/profiles";
import Errors from "$lib/Errors";
import type { Profile } from "$lib/types.d";
import {
  DocumentType,
  type DocumentPreload,
  type DocumentEncrypted,
  type Document,
  type DocumentNew,
  type Attachment,
} from "$lib/documents/types.d";
import { base64ToArrayBuffer } from "$lib/arrays";
import { logger } from "$lib/logging/logger";
import { profileContextManager } from "$lib/context/integration/profile-context";
import { apiFetch } from "$lib/api/client";
// Removed embedding migration import - now using medical terms classification

export const documents: Writable<(DocumentPreload | Document)[]> = writable([]);

export function byUser(id: string): Readable<(DocumentPreload | Document)[]> {
  return profileStores[id];
}

const byID: {
  [key: string]: DocumentPreload | Document;
} = {};

export const profileStores: {
  [key: string]: Readable<(DocumentPreload | Document)[]>;
} = {};

export default {
  subscribe: documents.subscribe,
  get: getDocument,
  byUser,
  loadDocument,
  addDocument,
};

function updateIndex() {
  get(documents).forEach((doc) => {
    byID[doc.id] = doc;
    const user_id = doc.user_id;
    if (!profileStores[user_id]) {
      (() => {
        profileStores[user_id] = derived(documents, ($documents, set) => {
          const userDocuments = $documents.filter(
            (doc) =>
              doc.user_id === user_id && doc.type === DocumentType.document,
          );
          logger.documents.debug("Update profile store", {
            user_id,
          });
          set(userDocuments);
        });
      })();
    }
  });
}

export async function getDocument(id: string): Promise<Document | undefined> {
  await loadingDocuments;
  const document = byID[id];
  if (!document) {
    throw new Error("Document not found");
  }
  if (!document.content) {
    return await loadDocument(id);
  }
  return document as Document;
}

let loadingDocumentsResolve: (value: boolean) => void;
let loadingDocuments: Promise<boolean> = new Promise(
  (resolve) => (loadingDocumentsResolve = resolve),
);

export async function loadDocuments(
  profile_id: string,
): Promise<(DocumentPreload | Document)[]> {
  const documentsResponse = await apiFetch(
    `/v1/med/profiles/${profile_id}/documents`,
  );
  const result = await documentsResponse.json();
  return await importDocuments(result);
}

export async function importDocuments(
  documentsEncrypted: DocumentEncrypted[] = [],
): Promise<(Document | DocumentPreload)[]> {
  // Reuse non-mutating decrypt helper, then batch update the store once
  // If keys are not available (unlock disabled), skip quietly
  if (!(user as any)?.keyPair?.isReady?.()) {
    logger.documents.warn("Skipping importDocuments: user keys not available");
    return [];
  }
  const docs = await decryptDocumentsNoStore(documentsEncrypted);
  setDocuments(docs);
  return docs;
}

/**
 * Decrypt documents without mutating the global documents store.
 * Useful for callers that need decrypted metadata/content but want to
 * manage store updates themselves (e.g. batch updates).
 */
export async function decryptDocumentsNoStore(
  documentsEncrypted: DocumentEncrypted[] = [],
): Promise<(Document | DocumentPreload)[]> {
  // If keys are not available (unlock disabled), skip quietly
  if (!(user as any)?.keyPair?.isReady?.()) {
    logger.documents.warn(
      "Skipping decryptDocumentsNoStore: user keys not available",
    );
    return [];
  }
  const documentsDecrypted: (DocumentPreload | Document)[] = await Promise.all(
    documentsEncrypted.map(async (document) => {
      const key = document.keys[0].key;

      const encrypted = [document.metadata];
      if (document.content) {
        encrypted.push(document.content);
      }
      const dec = await decrypt(encrypted, key);

      const parsedMetadata = JSON.parse(dec[0]);
      const embeddings = parsedMetadata.embeddings || {};

      // Normalize attachments to Attachment[]
      const normalizedAttachments: Attachment[] = (
        document.attachments || []
      ).map((att: any) =>
        typeof att === "string" ? { url: att, path: att } : (att as Attachment),
      );

      const base: Document | DocumentPreload = {
        key,
        id: document.id,
        user_id: document.user_id,
        type: document.type,
        metadata: parsedMetadata,
        content: undefined,
        owner_id: document.keys[0].owner_id,
        author_id: document.author_id,
        attachments: normalizedAttachments,
      };

      // Attach embedding metadata on the object without affecting type checks
      (base as any).embedding_summary = embeddings.summary;
      (base as any).embedding_vector = embeddings.vector;
      (base as any).embedding_provider = embeddings.provider;
      (base as any).embedding_model = embeddings.model;
      (base as any).embedding_timestamp = embeddings.timestamp;

      if (dec[1]) {
        (base as Document).content = JSON.parse(dec[1]);
        return base as Document;
      }
      return base as DocumentPreload;
    }),
  );

  return documentsDecrypted;
}

/**
 * Replace the global documents store in one batched update and rebuild indices.
 */
export function setDocuments(
  docs: (DocumentPreload | Document)[],
): (DocumentPreload | Document)[] {
  documents.set(docs);
  updateIndex();
  loadingDocumentsResolve(true);
  return docs;
}

export async function loadDocument(
  id: string,
  profile_id: string | null = null,
): Promise<Document> {
  const user_id = user.getId();
  profile_id = profile_id || user_id;
  let document = byID[id] as DocumentPreload | Document;

  if (document && document.content) {
    return document as Document;
  }
  if (document && document.user_id) {
    profile_id = document.user_id;
  }

  if (!user_id) {
    throw new Error(Errors.Unauthenticated);
  }

  const documentEncrypted = await apiFetch(
    "/v1/med/profiles/" + profile_id + "/documents/" + id,
  )
    .then((r) => r.json())
    .catch((e) => {
      logger.documents.error("Failed to fetch document", { error: e });
      throw new Error(Errors.NetworkError);
    });
  // decrypt content data
  const documentDecrypted = await decrypt(
    [documentEncrypted.metadata, documentEncrypted.content],
    documentEncrypted.keys[0].key,
  );

  documents.update((docs) => {
    const index = docs.findIndex((doc) => doc.id === id);
    if (index < 0) {
      docs.push({
        key: documentEncrypted.keys[0].key,
        id: documentEncrypted.id,
        user_id: documentEncrypted.user_id,
        type: documentEncrypted.type,
        metadata: JSON.parse(documentDecrypted[0]),
        content: JSON.parse(documentDecrypted[1]),
        owner_id: documentEncrypted.keys[0].owner_id,
        author_id: documentEncrypted.author_id,
        attachments: documentEncrypted.attachments || [],
      });
    }
    if (index >= 0) {
      docs[index].content = JSON.parse(documentDecrypted[1]);
      document = docs[index] as Document;
      byID[id] = document;
      logger.documents.info("Document loaded", { document: docs[index] });
    }
    return docs;
  });
  updateIndex();

  // Ensure document has embeddings before returning
  const loadedDocument = byID[id] as Document;
  if (loadedDocument.content) {
    try {
      // Medical terms are now generated during LangGraph workflow processing
      // No need for separate embedding generation step
      const documentWithTerms = loadedDocument;

      // Document is already processed with medical terms
      if (documentWithTerms !== loadedDocument) {
        documents.update((docs) => {
          const index = docs.findIndex((doc) => doc.id === id);
          if (index >= 0) {
            docs[index] = documentWithTerms;
            byID[id] = documentWithTerms;
          }
          return docs;
        });
        updateIndex();
        return documentWithTerms;
      }
    } catch (error) {
      logger.documents.warn("Failed to process document with medical terms", {
        documentId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      // Continue with original document if medical terms processing fails
    }
  }

  return loadedDocument;
}

export async function updateDocument(documentData: Document) {
  // get current document
  const document = await getDocument(documentData.id);
  if (!document) {
    throw new Error(Errors.DocumentNotFound);
  }
  const user_id = user.getId();
  const key = await user.keyPair.decrypt(document.key);

  // prepare new metadata
  let metadata = deriveMetadata(
    documentData,
    Object.assign(document.metadata, documentData.metadata),
  );

  // encrypt attachments and map them to content with thumbnails
  // Separate new attachments (with file data) from existing ones (with URLs)
  const newAttachments = (documentData.attachments || []).filter(
    (a) => !a.url && a.file,
  );
  const existingAttachments = (documentData.attachments || []).filter(
    (a) => a.url,
  );

  logger.documents.debug("Update attachments to process", {
    attachmentsCount: documentData.attachments?.length || 0,
    newWithFileData: newAttachments.length,
    existingWithUrls: existingAttachments.length,
    withThumbnails:
      documentData.attachments?.filter((a) => a.thumbnail).length || 0,
  });

  const attachmentsToEncrypt = newAttachments.map((a) => {
    return JSON.stringify({
      file: a.file,
      type: a.type,
    });
  });
  const { data: attachmentsEncrypted } = await encrypt(
    attachmentsToEncrypt,
    key,
  );

  logger.documents.debug("Update attachments encrypted", {
    attachmentsEncrypted,
  });
  const attachmentsUrls = await saveAttachements(
    attachmentsEncrypted,
    document.user_id,
  );

  // Map attachments: new ones get fresh URLs, existing ones keep their URLs, all preserve thumbnails
  logger.documents.debug("Update attachments remapping", { document });
  document.content.attachments = [
    ...newAttachments.map((a, i) => ({
      url: attachmentsUrls[i].url,
      path: attachmentsUrls[i].path,
      type: a.type,
      thumbnail: a.thumbnail, // Preserve thumbnail from original attachment
    })),
    ...existingAttachments.map((a) => ({
      url: a.url,
      path: a.path,
      type: a.type,
      thumbnail: a.thumbnail, // Preserve thumbnail from existing attachment
    })),
  ];

  const { data: enc } = await encrypt(
    [JSON.stringify(documentData.content), JSON.stringify(metadata)],
    key,
  );

  return await apiFetch(
    "/v1/med/profiles/" + document.user_id + "/documents/" + document.id,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        metadata: enc[1],
        content: enc[0],
        attachments: document.content.attachments.map((a: Attachment) => a.url),
      }),
    },
  )
    .then((r) => r.json())
    .catch(async (e) => {
      logger.documents.error("Failed to update document", { error: e });
      await removeAttachments(attachmentsUrls);
      throw new Error(Errors.NetworkError);
    });
}

/**
 * TODO: Add attachments
 *  - convert files to base64
 *  - encrypt them
 *  - save them to storage XX post them to sercer for server to save them and create references
 */

export async function addDocument(document: DocumentNew): Promise<Document> {
  const user_id = user.getId();
  if (!user_id) {
    throw new Error(Errors.Unauthenticated);
  }

  const profile_id = document.user_id || user_id;

  // prepare metadata
  let metadata = deriveMetadata(document, document.metadata);

  // encrypt attachments and map them to content with thumbnails
  // Only process attachments that have file data
  const attachmentsWithFiles = (document.attachments || []).filter(
    (a) => a.file,
  );
  const attachmentsWithoutFiles = (document.attachments || []).filter(
    (a) => !a.file && a.url,
  );

  logger.documents.debug("Attachments to process", {
    attachmentsCount: document.attachments?.length || 0,
    withFileData: attachmentsWithFiles.length,
    withoutFileData: attachmentsWithoutFiles.length,
    withThumbnails:
      document.attachments?.filter((a) => a.thumbnail).length || 0,
  });

  const attachmentsToEncrypt: string[] = attachmentsWithFiles.map((a) => {
    return JSON.stringify({
      file: a.file,
      type: a.type,
    });
  });
  const { data: attachmentsEncrypted, key } =
    await encrypt(attachmentsToEncrypt);

  logger.documents.debug("Attachments encrypted", {
    attachmentsEncrypted: attachmentsEncrypted.length,
  });

  // save encrypted attachments
  const attachmentsUrls = await saveAttachements(
    attachmentsEncrypted,
    profile_id,
  );

  logger.documents.debug("Attachments saved to storage", {
    attachmentsUrls: attachmentsUrls.length,
  });

  // map attachments to content, preserving thumbnails from original attachments
  document.content.attachments = [
    ...attachmentsWithFiles.map((a: Attachment, i: number) => ({
      url: attachmentsUrls[i].url,
      path: attachmentsUrls[i].path,
      type: a.type,
      thumbnail: a.thumbnail, // Preserve thumbnail from original attachment
    })),
    ...attachmentsWithoutFiles.map((a: Attachment) => ({
      url: a.url,
      path: a.path,
      type: a.type,
      thumbnail: a.thumbnail, // Preserve thumbnail from existing attachment
    })),
  ];
  logger.documents.info("Add document", { document });
  // encrypt document, metadata using the same key as attachments
  const { data: enc } = await encrypt(
    [JSON.stringify(document.content), JSON.stringify(metadata)],
    key,
  );
  const keys = [
    {
      user_id: user_id,
      owner_id: profile_id || user_id,
      key: await user.keyPair.encrypt(key),
    },
  ];

  // if we are saving a document for a another profile, add the key to the profile
  if (profile_id && profile_id !== user_id) {
    try {
      keys.push({
        user_id: profile_id,
        owner_id: profile_id,
        key: await encryptKeyForProfile(key, profile_id),
      });
    } catch (e: any) {
      if (e.message !== Errors.PublicKeyNotFound) {
        throw e;
      }
    }
  }

  // save the report itself
  const response = await apiFetch(
    "/v1/med/profiles/" + (profile_id || user_id) + "/documents",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: document.type || DocumentType.document,
        metadata: enc[1],
        content: enc[0],
        attachments: attachmentsUrls,
        keys,
      }),
    },
  ).catch(async (e) => {
    logger.documents.error("Failed to add document - network error", {
      error: e,
    });
    await removeAttachments(attachmentsUrls);
    throw new Error(Errors.NetworkError);
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.documents.error("Failed to add document - server error", {
      status: response.status,
      statusText: response.statusText,
      body: errorBody,
      requestType: document.type,
      hasMetadata: !!enc[1],
      hasContent: !!enc[0],
      keysCount: keys.length,
    });
    await removeAttachments(attachmentsUrls);
    throw new Error(`Server error: ${response.status} - ${errorBody}`);
  }

  const data = await response.json();

  // update local documents
  const newDocument = await loadDocument(data.id, profile_id || user_id);

  // Add document to context (simplified for medical terms system)
  try {
    await profileContextManager.addDocumentToContext(
      profile_id || user_id,
      newDocument,
    );
  } catch (error) {
    logger.documents.warn("Failed to add document to context", {
      documentId: data.id,
      profileId: profile_id || user_id,
      error,
    });
  }

  return newDocument;
}

export async function removeDocument(id: string): Promise<void> {
  const document = await getDocument(id);
  if (!document) {
    throw new Error(Errors.DocumentNotFound);
  }
  const user_id = user.getId();
  const key = await user.keyPair.decrypt(document.key);
  logger.documents.info("Remove document", { document });
  // remove attachments
  if (document?.content?.attachments)
    await removeAttachments(document?.content?.attachments);
  // remove document
  await apiFetch("/v1/med/profiles/" + document.user_id + "/documents/" + id, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
  })
    .then((r) => r.json())
    .catch((e) => {
      logger.documents.error("Failed to remove document", { error: e });
      throw new Error(Errors.NetworkError);
    });

  documents.update((docs) => {
    const index = docs.findIndex((doc) => doc.id === id);
    if (index >= 0) {
      docs.splice(index, 1);
    }
    return docs;
  });

  // Remove document from context
  try {
    profileContextManager.removeDocumentFromContext(document.user_id, id);
  } catch (error) {
    logger.documents.warn("Failed to remove document from context", {
      documentId: id,
      profileId: document.user_id,
      error,
    });
  }

  delete byID[id];
  return;
}

async function saveAttachements(
  attachments: string[],
  profile_id: string,
): Promise<Attachment[]> {
  logger.documents.debug("Save attachments to storage", { attachments });
  const user_id = profile_id || user.getId();
  // store attachments
  const urls = await Promise.all(
    attachments.map(async (attachment, i) => {
      const response = await apiFetch(
        "/v1/med/profiles/" + user_id + "/attachments",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            file: attachment,
          }),
        },
      );
      const data = await response.json();
      return data;
    }),
  );

  return urls;
}

async function removeAttachments(attachments: Attachment[]): Promise<void> {
  logger.documents.debug("Delete attachments from storage", { attachments });
  await Promise.all(
    attachments.map(async (attachment) => {
      const response = await apiFetch(
        "/v1/med/profiles/" +
          user.getId() +
          "/attachments?path=" +
          attachment.path,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
      return response.json();
    }),
  );

  return;
}

async function downloadAttachement(attachment: {
  file: string;
  type: string;
  url?: string;
  path?: string;
}) {
  const file = base64ToArrayBuffer(attachment.file);
  const blob = new Blob([file], { type: attachment.type });
  const url = URL.createObjectURL(blob);
  const a = window.document.createElement("a");
  a.href = url;
  a.download = a.name;
  a.click();
  URL.revokeObjectURL(url);
}

export async function encrypt(
  data: string[],
  key: CryptoKey | string | undefined = undefined,
): Promise<{ data: string[]; key: string }> {
  let cryptoKey: CryptoKey;
  if (key instanceof CryptoKey) {
    cryptoKey = key;
  } else if (typeof key === "string") {
    cryptoKey = await importKey(key);
  } else {
    // create random key
    cryptoKey = await prepareKey();
  }
  const encrypted = await Promise.all(
    data.map((d) => encryptAES(cryptoKey, d)),
  );
  const keyExported = await exportKey(cryptoKey);

  return { data: encrypted, key: keyExported };
}

export async function encryptKeyForProfile(
  exportedKey: string,
  profile_id: string,
): Promise<string> {
  const profile = profiles.get(profile_id) as Profile;

  if (!profile) {
    throw new Error(Errors.ProfileNotFound);
  }

  if (!profile.publicKey) {
    throw new Error(Errors.PublicKeyNotFound);
  }

  const profile_key = await pemToKey(profile.publicKey);
  const keyEncrypted = await encryptRSA(profile_key, exportedKey);
  return keyEncrypted;
}

export async function decrypt(
  data: string[],
  keyEncrypted: string,
): Promise<string[]> {
  // decrypt key with user's private key
  const keyDecrypted = await user.keyPair.decrypt(keyEncrypted);
  const cryptoKey = (await importKey(keyDecrypted)) as CryptoKey;

  // decrypt
  const decrypted = await Promise.all(
    data.map((d) => decryptAES(cryptoKey, d)),
  );

  return decrypted;
}

function deriveMetadata(
  document: Document | DocumentNew,
  metadata?: { [key: string]: any },
): { [key: string]: any } {
  let result: { [key: string]: any } = {
    title: document.content.title,
    tags: document.content.tags || [],
    date: document.content.date || new Date().toISOString(),
    ...metadata,
  };

  // Include embeddings if available from server analysis
  // Medical terms are now generated during workflow processing
  // No need for separate embedding handling

  return result;
}
