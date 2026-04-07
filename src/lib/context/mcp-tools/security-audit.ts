/**
 * MCP Security and Audit System
 *
 * Provides security validation, access control, and audit logging
 * for all MCP medical tool operations to ensure HIPAA compliance.
 */

import { logger } from "$lib/logging/logger";
import type { User } from "@supabase/supabase-js";

const auditLogger = logger.namespace("MCPAudit");

export interface MCPSecurityContext {
  user: User;
  profileId: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface MCPAccessPolicy {
  requireAuthentication: boolean;
  requireProfileOwnership: boolean;
  requireClinicalRole?: boolean;
  rateLimit?: {
    maxRequests: number;
    windowMs: number;
  };
  sensitivityLevel: "low" | "medium" | "high" | "critical";
}

export interface MCPAuditEntry {
  id: string;
  timestamp: string;
  userId: string;
  profileId: string;
  toolName: string;
  operation: string;
  parameters: any;
  result: "success" | "denied" | "error";
  errorMessage?: string;
  accessLevel: string;
  sensitivityLevel: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  dataAccessed?: string[];
  processingTimeMs?: number;
}

export class MCPSecurityService {
  private accessPolicies = new Map<string, MCPAccessPolicy>();
  private rateLimitStore = new Map<
    string,
    { count: number; resetTime: number }
  >();
  private auditStore: MCPAuditEntry[] = [];

  constructor() {
    this.initializeAccessPolicies();
  }

  /**
   * Initialize access policies for each MCP tool
   */
  private initializeAccessPolicies() {
    // Basic search and context tools
    this.accessPolicies.set("searchDocuments", {
      requireAuthentication: true,
      requireProfileOwnership: true,
      sensitivityLevel: "medium",
      rateLimit: { maxRequests: 100, windowMs: 60000 }, // 100 requests per minute
    });

    this.accessPolicies.set("getAssembledContext", {
      requireAuthentication: true,
      requireProfileOwnership: true,
      sensitivityLevel: "medium",
      rateLimit: { maxRequests: 50, windowMs: 60000 },
    });

    // Profile and medical history access
    this.accessPolicies.set("getProfileData", {
      requireAuthentication: true,
      requireProfileOwnership: true,
      sensitivityLevel: "high",
      rateLimit: { maxRequests: 20, windowMs: 60000 },
    });

    this.accessPolicies.set("queryMedicalHistory", {
      requireAuthentication: true,
      requireProfileOwnership: true,
      sensitivityLevel: "high",
      rateLimit: { maxRequests: 30, windowMs: 60000 },
    });

    // Document access
    this.accessPolicies.set("getDocumentById", {
      requireAuthentication: true,
      requireProfileOwnership: true,
      sensitivityLevel: "high",
      rateLimit: { maxRequests: 50, windowMs: 60000 },
    });

    // Advanced medical analysis tools
    this.accessPolicies.set("getPatientTimeline", {
      requireAuthentication: true,
      requireProfileOwnership: true,
      sensitivityLevel: "high",
      rateLimit: { maxRequests: 20, windowMs: 60000 },
    });

    this.accessPolicies.set("analyzeMedicalTrends", {
      requireAuthentication: true,
      requireProfileOwnership: true,
      sensitivityLevel: "high",
      rateLimit: { maxRequests: 10, windowMs: 60000 },
    });

    this.accessPolicies.set("getMedicationHistory", {
      requireAuthentication: true,
      requireProfileOwnership: true,
      sensitivityLevel: "critical",
      rateLimit: { maxRequests: 20, windowMs: 60000 },
    });

    this.accessPolicies.set("getTestResultSummary", {
      requireAuthentication: true,
      requireProfileOwnership: true,
      sensitivityLevel: "critical",
      rateLimit: { maxRequests: 20, windowMs: 60000 },
    });

    this.accessPolicies.set("identifyMedicalPatterns", {
      requireAuthentication: true,
      requireProfileOwnership: true,
      sensitivityLevel: "high",
      rateLimit: { maxRequests: 10, windowMs: 60000 },
    });

    this.accessPolicies.set("generateClinicalSummary", {
      requireAuthentication: true,
      requireProfileOwnership: true,
      sensitivityLevel: "critical",
      requireClinicalRole: true,
      rateLimit: { maxRequests: 5, windowMs: 60000 },
    });

    this.accessPolicies.set("searchBySymptoms", {
      requireAuthentication: true,
      requireProfileOwnership: true,
      sensitivityLevel: "medium",
      rateLimit: { maxRequests: 30, windowMs: 60000 },
    });

    this.accessPolicies.set("getSpecialtyRecommendations", {
      requireAuthentication: true,
      requireProfileOwnership: true,
      sensitivityLevel: "medium",
      rateLimit: { maxRequests: 20, windowMs: 60000 },
    });
  }

  /**
   * Validate access to MCP tool
   */
  async validateAccess(
    toolName: string,
    context: MCPSecurityContext,
    parameters?: any,
  ): Promise<{ allowed: boolean; reason?: string }> {
    const policy = this.accessPolicies.get(toolName);

    if (!policy) {
      auditLogger.warn("Access attempt to unknown tool", {
        toolName,
        userId: context.user?.id,
      });
      return { allowed: false, reason: "Unknown tool" };
    }

    // Check authentication
    if (policy.requireAuthentication && !context.user) {
      return { allowed: false, reason: "Authentication required" };
    }

    // Check profile ownership
    if (policy.requireProfileOwnership) {
      const ownsProfile = await this.checkProfileOwnership(
        context.user.id,
        context.profileId,
      );
      if (!ownsProfile) {
        return { allowed: false, reason: "Profile access denied" };
      }
    }

    // Check clinical role if required
    if (policy.requireClinicalRole) {
      const hasClinicalRole = await this.checkClinicalRole(context.user.id);
      if (!hasClinicalRole) {
        return { allowed: false, reason: "Clinical role required" };
      }
    }

    // Check rate limits
    if (policy.rateLimit) {
      const rateLimitKey = `${context.user.id}:${toolName}`;
      if (!this.checkRateLimit(rateLimitKey, policy.rateLimit)) {
        return { allowed: false, reason: "Rate limit exceeded" };
      }
    }

    return { allowed: true };
  }

  /**
   * Log tool access for audit trail
   */
  async logAccess(
    toolName: string,
    operation: string,
    context: MCPSecurityContext,
    parameters: any,
    result: "success" | "denied" | "error",
    errorMessage?: string,
    dataAccessed?: string[],
    processingTimeMs?: number,
  ): Promise<void> {
    const policy = this.accessPolicies.get(toolName);
    const auditEntry: MCPAuditEntry = {
      id: this.generateAuditId(),
      timestamp: new Date().toISOString(),
      userId: context.user?.id || "anonymous",
      profileId: context.profileId,
      toolName,
      operation,
      parameters: this.sanitizeParameters(parameters),
      result,
      errorMessage,
      accessLevel: context.user ? "authenticated" : "anonymous",
      sensitivityLevel: policy?.sensitivityLevel || "unknown",
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      sessionId: context.sessionId,
      dataAccessed,
      processingTimeMs,
    };

    // Store audit entry
    this.auditStore.push(auditEntry);

    // Log based on sensitivity and result
    if (result === "denied" || result === "error") {
      auditLogger.warn("MCP tool access issue", {
        toolName,
        operation,
        userId: context.user?.id,
        result,
        reason: errorMessage,
      });
    } else if (policy?.sensitivityLevel === "critical") {
      auditLogger.info("Critical data access", {
        toolName,
        operation,
        userId: context.user?.id,
        profileId: context.profileId,
        dataAccessed: dataAccessed?.length || 0,
      });
    }

    // Persist to database for long-term storage (implement based on your needs)
    await this.persistAuditEntry(auditEntry);
  }

  /**
   * Get audit trail for a profile
   */
  async getAuditTrail(
    profileId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      toolName?: string;
      userId?: string;
      limit?: number;
    },
  ): Promise<MCPAuditEntry[]> {
    let entries = this.auditStore.filter(
      (entry) => entry.profileId === profileId,
    );

    if (options?.startDate) {
      entries = entries.filter(
        (entry) => new Date(entry.timestamp) >= options.startDate!,
      );
    }

    if (options?.endDate) {
      entries = entries.filter(
        (entry) => new Date(entry.timestamp) <= options.endDate!,
      );
    }

    if (options?.toolName) {
      entries = entries.filter((entry) => entry.toolName === options.toolName);
    }

    if (options?.userId) {
      entries = entries.filter((entry) => entry.userId === options.userId);
    }

    // Sort by timestamp descending
    entries.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    if (options?.limit) {
      entries = entries.slice(0, options.limit);
    }

    return entries;
  }

  /**
   * Check if user owns or has access to profile.
   * Queries the profiles table for ownership, and document_shares for delegated access.
   */
  private async checkProfileOwnership(
    userId: string,
    profileId: string,
  ): Promise<boolean> {
    const client = this.getSupabaseClient();
    if (!client) {
      // No Supabase client available (client-side context) — fall back to strict ID match
      auditLogger.warn("No Supabase client for profile ownership check, using strict ID match");
      return userId === profileId;
    }

    try {
      // Direct ownership check: profile belongs to this user
      const { data: profile, error: profileError } = await client
        .from("profiles")
        .select("id, user_id")
        .eq("id", profileId)
        .single();

      if (profileError || !profile) {
        auditLogger.warn("Profile lookup failed", { profileId, userId, error: profileError?.message });
        return false;
      }

      if (profile.user_id === userId) {
        return true;
      }

      // Delegated access: check document_shares for an accepted share
      const { data: share, error: shareError } = await client
        .from("document_shares")
        .select("id")
        .eq("profile_id", profileId)
        .eq("recipient_user_id", userId)
        .eq("status", "accepted")
        .limit(1);

      if (shareError) {
        auditLogger.warn("Share lookup failed", { profileId, userId, error: shareError.message });
        return false;
      }

      return share !== null && share.length > 0;
    } catch (err) {
      auditLogger.error("Profile ownership check error", { profileId, userId, error: err });
      return false;
    }
  }

  /**
   * Set the Supabase client for server-side queries.
   * Must be called with a service role client before profile ownership checks.
   */
  setSupabaseClient(client: any) {
    this._supabaseClient = client;
  }

  private getSupabaseClient() {
    return this._supabaseClient;
  }
  private _supabaseClient: any;

  /**
   * Check if user has clinical role.
   * Until clinical role verification is fully implemented via user metadata
   * or a dedicated roles table, this returns false — which means clinical-only
   * tools (like generateClinicalSummary) are gated. Clinical mode itself still
   * works but includes an educational-purposes disclaimer via the prompt config.
   */
  private async checkClinicalRole(userId: string): Promise<boolean> {
    try {
      const client = this.getSupabaseClient();
      if (!client) return false;

      // Check for clinical role in user profile metadata
      const { data: profile, error: profileError } = await client
        .from("profiles")
        .select("metadata")
        .eq("user_id", userId)
        .single();

      if (profileError || !profile?.metadata) return false;

      const metadata = typeof profile.metadata === "string"
        ? JSON.parse(profile.metadata)
        : profile.metadata;

      return metadata?.role === "clinical" || metadata?.role === "provider";
    } catch {
      return false;
    }
  }

  /**
   * Check rate limits
   */
  private checkRateLimit(
    key: string,
    limit: { maxRequests: number; windowMs: number },
  ): boolean {
    const now = Date.now();
    const rateLimitInfo = this.rateLimitStore.get(key);

    if (!rateLimitInfo || now > rateLimitInfo.resetTime) {
      // New window or expired window
      this.rateLimitStore.set(key, {
        count: 1,
        resetTime: now + limit.windowMs,
      });
      return true;
    }

    if (rateLimitInfo.count >= limit.maxRequests) {
      return false;
    }

    rateLimitInfo.count++;
    return true;
  }

  /**
   * Sanitize parameters for audit logging
   */
  private sanitizeParameters(parameters: any): any {
    if (!parameters) return {};

    // Remove or mask sensitive data
    const sanitized = { ...parameters };

    // Don't log full document content
    if (sanitized.documentContent) {
      sanitized.documentContent = "[REDACTED]";
    }

    // Mask any potential PII
    if (sanitized.query && sanitized.query.length > 100) {
      sanitized.query = sanitized.query.substring(0, 100) + "...[TRUNCATED]";
    }

    return sanitized;
  }

  /**
   * Generate unique audit ID
   */
  private generateAuditId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Persist audit entry to database via audit_logs table.
   * Routes through a lightweight server endpoint since MCP tools may run client-side.
   */
  private async persistAuditEntry(entry: MCPAuditEntry): Promise<void> {
    try {
      const client = this.getSupabaseClient();
      if (!client) {
        auditLogger.warn("Cannot persist audit — no Supabase client available");
        return;
      }

      const { error: insertError } = await client
        .from("audit_logs")
        .insert({
          user_id: entry.userId === "anonymous" ? null : entry.userId,
          actor_type: entry.userId === "anonymous" ? "anonymous" : "user",
          action: entry.result === "denied" ? "read" : "read",
          resource_type: "document" as const,
          resource_id: entry.profileId,
          ip_address: entry.ipAddress,
          user_agent: entry.userAgent,
          endpoint: `mcp/${entry.toolName}`,
          http_method: "TOOL",
          metadata: {
            tool_name: entry.toolName,
            operation: entry.operation,
            result: entry.result,
            sensitivity_level: entry.sensitivityLevel,
            data_accessed_count: entry.dataAccessed?.length || 0,
            processing_time_ms: entry.processingTimeMs,
          },
          success: entry.result === "success",
          error_message: entry.errorMessage,
        });

      if (insertError) {
        auditLogger.warn("Failed to persist MCP audit entry", { error: insertError.message });
      }
    } catch (err) {
      auditLogger.warn("Unexpected error persisting MCP audit entry", { error: err });
    }
  }

  /**
   * Clean up old rate limit entries
   */
  cleanupRateLimits(): void {
    const now = Date.now();
    for (const [key, info] of this.rateLimitStore.entries()) {
      if (now > info.resetTime) {
        this.rateLimitStore.delete(key);
      }
    }
  }

  /**
   * Export audit logs for compliance
   */
  async exportAuditLogs(
    startDate: Date,
    endDate: Date,
    format: "json" | "csv" = "json",
  ): Promise<string> {
    const entries = this.auditStore.filter((entry) => {
      const timestamp = new Date(entry.timestamp);
      return timestamp >= startDate && timestamp <= endDate;
    });

    if (format === "json") {
      return JSON.stringify(entries, null, 2);
    } else {
      // CSV format
      const headers = [
        "ID",
        "Timestamp",
        "User ID",
        "Profile ID",
        "Tool Name",
        "Operation",
        "Result",
        "Sensitivity Level",
        "IP Address",
      ];

      const rows = entries.map((entry) => [
        entry.id,
        entry.timestamp,
        entry.userId,
        entry.profileId,
        entry.toolName,
        entry.operation,
        entry.result,
        entry.sensitivityLevel,
        entry.ipAddress || "",
      ]);

      return [headers, ...rows].map((row) => row.join(",")).join("\n");
    }
  }
}

// Export singleton instance
export const mcpSecurityService = new MCPSecurityService();

// Cleanup rate limits periodically
if (typeof window !== "undefined") {
  setInterval(() => {
    mcpSecurityService.cleanupRateLimits();
  }, 60000); // Every minute
}
