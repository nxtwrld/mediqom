import type { Link } from "$lib/common.types.d";

export interface ShareRecord {
  uid: string;
  title: string;
  href: string;
  url: string;
  contact: string;
  password: string | undefined;
  publicKey: string | undefined;
  created: string;
  links: Link[];
}

/**
 * Share export format
 * Items is list of encrypted items
 * 1. if the items are encrypted with shared PublicKey no salt is needed
 * 2. if we are deriving encryption key from password, salt is needed
 * 3. encryptionPublicKey is needed if we want the shared party to add messages or update our report
 * 4. signingPublicKey is needed if we want the shared party to be able to verify our reports
 * 5. passwordHash is needed if password was set up. This is used to authenticate against the server without access to the password
 */
export interface ShareExport {
  items: ShareItem[];
  salt?: string;
  encryptionPublicKey?: string;
  signingPublicKey?: string;
  passwordHash?: string;
}

export interface ShareItem {
  uid: string;
  type: string;
  key: string;
  data: string;
  metadata: string;
}

/** A document share record as returned from the API */
export interface DocumentShare {
  id: string;
  sharer_id: string;
  owner_id: string;
  recipient_email: string;
  recipient_id: string | null;
  document_id: string;
  status: "pending" | "active" | "revoked";
  created_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  /** Document metadata (joined) */
  document?: {
    id: string;
    metadata: any;
    type: string;
  };
}

/** Result from the recipient lookup endpoint */
export interface RecipientInfo {
  exists: boolean;
  publicKey?: string;
  profile_id?: string;
}

/** One share entry in the create request */
export interface ShareCreateItem {
  document_id: string;
  owner_id: string;
  /** AES key encrypted with recipient's RSA public key (existing user) */
  encrypted_key_for_recipient: string | null;
  /** AES key encrypted with share_secret (new user) */
  pending_encrypted_key: string | null;
}

/** Body for POST /v1/share/create */
export interface ShareCreateBody {
  recipient_email: string;
  /** One-time share secret — only present for new users */
  share_secret?: string;
  shares: ShareCreateItem[];
}

/** Body for POST /v1/share/accept */
export interface ShareAcceptBody {
  share_id: string;
  /** AES key re-encrypted with User B's RSA public key */
  encrypted_key_for_me: string;
}
