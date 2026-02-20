import * as env from "$env/static/public";

export const FEATURE_FLAGS = {
  ENHANCED_SIGNAL_PROCESSING:
    (env as any).PUBLIC_ENABLE_ENHANCED_SIGNALS === "true",
  MULTI_PROVIDER_AI: (env as any).PUBLIC_ENABLE_MULTI_PROVIDER_AI === "true",
  EXTERNAL_VALIDATION:
    (env as any).PUBLIC_ENABLE_EXTERNAL_VALIDATION === "true",
  SPECIALIZED_UI: (env as any).PUBLIC_ENABLE_SPECIALIZED_UI === "true",
  // Encryption enabled by default for security - set to 'false' to disable during debugging
  ENCRYPTED_IMPORT_CACHE:
    (env as any).PUBLIC_ENABLE_ENCRYPTED_IMPORT_CACHE !== "false",
};

// Helper function to check if a feature is enabled
export function isFeatureEnabled(feature: keyof typeof FEATURE_FLAGS): boolean {
  return FEATURE_FLAGS[feature];
}

// Export individual flags for convenience
export const {
  ENHANCED_SIGNAL_PROCESSING,
  MULTI_PROVIDER_AI,
  EXTERNAL_VALIDATION,
  SPECIALIZED_UI,
  ENCRYPTED_IMPORT_CACHE,
} = FEATURE_FLAGS;
