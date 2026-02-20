import { zipSync, strToU8 } from "fflate";
import { apiFetch } from "$lib/api/client";
import { decryptDocumentsNoStore, decrypt } from "$lib/documents/index";
import type { DocumentEncrypted } from "$lib/documents/types.d";

export async function exportUserData(
  userInfo: { email: string; fullName: string; userId: string },
  onProgress?: (msg: string) => void,
): Promise<void> {
  const files: Record<string, Uint8Array> = {};

  // Top-level metadata
  files["export-info.json"] = strToU8(
    JSON.stringify(
      {
        exportDate: new Date().toISOString(),
        email: userInfo.email,
        fullName: userInfo.fullName,
        version: "1.0",
      },
      null,
      2,
    ),
  );

  // Fetch all profiles
  onProgress?.("Fetching profiles...");
  const profilesRes = await apiFetch("/v1/med/profiles");
  const profilesData = await profilesRes.json();
  const allProfiles = Array.isArray(profilesData) ? profilesData : [];

  // Only export profiles owned by the current user
  const profiles = allProfiles.filter(
    (p: any) =>
      p.profiles?.auth_id === userInfo.userId ||
      p.profiles?.owner_id === userInfo.userId,
  );

  for (const profile of profiles) {
    const profileId = profile.profiles?.id;
    const profileName = profile.profiles?.fullName || profileId;
    const folderName = sanitizeName(profileName);
    const folder = `profiles/${folderName}`;
    onProgress?.(`Exporting profile: ${profileName}...`);

    // Fetch encrypted documents for this profile
    const docsRes = await apiFetch(
      `/v1/med/profiles/${profileId}/documents?full=true`,
    );
    const docsData = await docsRes.json();
    const encrypted: DocumentEncrypted[] = Array.isArray(docsData)
      ? docsData
      : [];

    // Decrypt all documents
    const decrypted = await decryptDocumentsNoStore(encrypted);

    for (const doc of decrypted) {
      const docType = doc.type ?? "document";
      const title = (doc as any).metadata?.title || doc.id;
      const docName = sanitizeName(title);

      // Profile/health documents go in folder root; others in documents/
      const isTopLevel = docType === "profile" || docType === "health";
      const subFolder = isTopLevel ? folder : `${folder}/documents`;

      files[`${subFolder}/${docName}.json`] = strToU8(
        JSON.stringify(
          {
            id: doc.id,
            type: docType,
            metadata: (doc as any).metadata,
            content: (doc as any).content,
            created_at: (doc as any).created_at,
          },
          null,
          2,
        ),
      );

      // Process attachments
      const attachments = (doc as any).attachments ?? [];
      for (const att of attachments) {
        // att.path/att.url may be a JSON string: '{"url":"https://...","path":"uuid/filename"}'
        let attStoragePath: string = att.path ?? att.url ?? "";
        try {
          const candidate = att.path ?? att.url ?? "";
          if (candidate.startsWith("{")) {
            const parsed = JSON.parse(candidate);
            attStoragePath = parsed.path ?? parsed.url ?? attStoragePath;
          }
        } catch {
          /* not JSON, use as-is */
        }

        if (!attStoragePath) continue;

        onProgress?.(
          `Downloading attachment: ${attStoragePath.split("/").pop()}...`,
        );
        try {
          const attRes = await apiFetch(
            `/v1/med/profiles/${profileId}/attachments?path=${encodeURIComponent(attStoragePath)}`,
          );
          if (!attRes.ok) {
            console.warn(
              "Failed to download attachment, status:",
              attRes.status,
              attStoragePath,
            );
            continue;
          }
          const encryptedText = await attRes.text();

          // Decrypt using document key
          const [decryptedJson] = await decrypt(
            [encryptedText],
            (doc as any).key,
          );
          const { file: base64, type: mimeType } = JSON.parse(decryptedJson);

          // Convert base64 to binary
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++)
            bytes[i] = binary.charCodeAt(i);

          const ext = extensionFromMime(mimeType);
          const filename = attStoragePath.split("/").pop() ?? "attachment";
          files[`${folder}/attachments/${filename}${ext}`] = bytes;
        } catch (e) {
          console.warn("Failed to export attachment:", attStoragePath, e);
        }
      }
    }
  }

  // Generate and trigger download
  onProgress?.("Generating ZIP...");
  const zipped = zipSync(files, { level: 6 });
  const blob = new Blob([zipped], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mediqom-export-${new Date().toISOString().split("T")[0]}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

function sanitizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\-_. ]/g, "_")
    .trim();
}

function extensionFromMime(mimeType: string): string {
  if (!mimeType) return "";
  const map: Record<string, string> = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "text/plain": ".txt",
    "application/json": ".json",
  };
  return map[mimeType] ?? "";
}
