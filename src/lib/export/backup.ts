import { prepareKey, encrypt as aesEncrypt, exportKey } from '$lib/encryption/aes';
import { wrapKey } from '$lib/encryption/keys';

export interface BackupFile {
    version: 'mediqom-backup-v1';
    encrypted: string;  // base64: iv + AES-GCM ciphertext
    key: string;        // base64: RSA-OAEP encrypted AES key
    metadata: {
        title: string;
        date: string;
    };
}

export async function createEncryptedBackup(item: any, publicKeyPem: string, kemPublicKey?: string | null): Promise<BackupFile> {
    // 1. Generate ephemeral AES-256-GCM key
    const aesKey = await prepareKey();

    // 2. Encrypt document JSON with AES key
    const json = JSON.stringify(item, null, 2);
    const encrypted = await aesEncrypt(aesKey, json);

    // 3. Export AES key bytes, then wrap with recipient's keys (hybrid if KEM available)
    const aesKeyB64 = await exportKey(aesKey);
    const encryptedKey = await wrapKey(publicKeyPem, kemPublicKey ?? null, aesKeyB64);

    const meta = item.metadata ?? {};
    return {
        version: 'mediqom-backup-v1',
        encrypted,
        key: encryptedKey,
        metadata: {
            title: meta.title || 'Medical Record',
            date: meta.date || new Date().toISOString().split('T')[0]
        }
    };
}

export function downloadBackup(backup: BackupFile, filename?: string): void {
    const name = filename ?? `${backup.metadata.title} - ${backup.metadata.date}.mediqom-backup.json`;
    const a = document.createElement('a');
    a.href = 'data:application/json,' + encodeURIComponent(JSON.stringify(backup, null, 2));
    a.download = name;
    a.click();
}
