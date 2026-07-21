/**
 * HIPAA Audit Logging Utility (45 CFR § 164.312)
 *
 * Fire-and-forget audit trail for all ePHI access, modifications, sharing, and key management.
 * Zero-knowledge: logs contain IDs, types, actions — never plaintext medical data.
 *
 * Usage:
 *   import { auditFromEvent } from '$lib/audit/index.server';
 *   auditFromEvent(event, { action: 'read', resource_type: 'document', resource_id: params.did });
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";
import type { RequestEvent } from "@sveltejs/kit";

// Reuse a single service-role client for all audit writes
let _auditClient: SupabaseClient | null = null;
function getAuditClient(): SupabaseClient {
  if (!_auditClient) {
    _auditClient = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  }
  return _auditClient;
}

export type AuditAction =
  | "read"
  | "create"
  | "update"
  | "delete"
  | "share"
  | "revoke"
  | "accept"
  | "recover"
  | "encrypt_change"
  | "process"
  | "login";

export type AuditResourceType =
  | "document"
  | "profile"
  | "share"
  | "import_job"
  | "chat"
  | "session"
  | "encryption"
  | "account"
  | "auth"
  | "careplan";

export interface AuditEntry {
  user_id?: string | null;
  actor_type?: "user" | "anonymous" | "system";
  actor_email?: string;
  action: AuditAction;
  resource_type: AuditResourceType;
  resource_id?: string;
  ip_address?: string;
  user_agent?: string;
  endpoint?: string;
  http_method?: string;
  metadata?: Record<string, unknown>;
  status_code?: number;
  success?: boolean;
  error_message?: string;
}

/**
 * Extract IP and User-Agent from a Request object.
 */
export function extractRequestContext(request: Request): {
  ip_address?: string;
  user_agent?: string;
} {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    undefined;
  const user_agent = request.headers.get("user-agent") || undefined;
  return { ip_address: ip, user_agent };
}

/**
 * Fire-and-forget audit log INSERT. Never throws, never blocks.
 */
export function auditLog(entry: AuditEntry): void {
  const client = getAuditClient();

  Promise.resolve(
    client
      .from("audit_logs")
      .insert({
        user_id: entry.user_id ?? null,
        actor_type: entry.actor_type ?? "user",
        actor_email: entry.actor_email,
        action: entry.action,
        resource_type: entry.resource_type,
        resource_id: entry.resource_id,
        ip_address: entry.ip_address,
        user_agent: entry.user_agent,
        endpoint: entry.endpoint,
        http_method: entry.http_method,
        metadata: entry.metadata ?? {},
        status_code: entry.status_code,
        success: entry.success ?? true,
        error_message: entry.error_message,
      }),
  )
    .then(({ error }) => {
      if (error) {
        console.warn("[Audit] Failed to write audit log:", error.message);
      }
    })
    .catch((err: unknown) => {
      console.warn("[Audit] Unexpected audit log error:", err);
    });
}

/**
 * Convenience: extract user_id, IP, UA, endpoint, method from a SvelteKit RequestEvent
 * and merge with provided audit details. Fire-and-forget.
 */
export function auditFromEvent(
  event: RequestEvent,
  details: Omit<AuditEntry, "user_id" | "ip_address" | "user_agent" | "endpoint" | "http_method"> & {
    user_id?: string | null;
    actor_email?: string;
  },
): void {
  const { request, url } = event;
  const user = (event.locals as any).user;
  const { ip_address, user_agent } = extractRequestContext(request);

  auditLog({
    user_id: details.user_id ?? user?.id ?? null,
    ip_address,
    user_agent,
    endpoint: url.pathname,
    http_method: request.method,
    ...details,
  });
}
