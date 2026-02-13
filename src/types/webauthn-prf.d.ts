/**
 * WebAuthn PRF Extension Types
 *
 * TypeScript definitions for the WebAuthn PRF (Pseudo-Random Function)
 * extension which allows deriving cryptographic keys from passkey authentication.
 */

/**
 * PRF extension input for credential creation
 */
export interface AuthenticationExtensionsPRFInputs {
  prf?: {
    /**
     * Evaluate PRF with these inputs during credential creation
     */
    eval?: {
      /**
       * First input to the PRF (required)
       */
      first: BufferSource;
      /**
       * Second input to the PRF (optional)
       */
      second?: BufferSource;
    };
    /**
     * Multiple PRF evaluations by credential ID
     */
    evalByCredential?: Record<string, {
      first: BufferSource;
      second?: BufferSource;
    }>;
  };
}

/**
 * PRF extension output from credential creation/assertion
 */
export interface AuthenticationExtensionsPRFOutputs {
  prf?: {
    /**
     * Whether PRF is enabled for this credential
     */
    enabled?: boolean;
    /**
     * Result of PRF evaluation
     */
    results?: {
      /**
       * PRF output from first input (32 bytes)
       */
      first?: ArrayBuffer;
      /**
       * PRF output from second input if provided (32 bytes)
       */
      second?: ArrayBuffer;
    };
  };
}

/**
 * Extended PublicKeyCredentialCreationOptions with PRF support
 */
export interface PublicKeyCredentialCreationOptionsWithPRF
  extends PublicKeyCredentialCreationOptions {
  extensions?: AuthenticationExtensionsClientInputs & AuthenticationExtensionsPRFInputs;
}

/**
 * Extended PublicKeyCredentialRequestOptions with PRF support
 */
export interface PublicKeyCredentialRequestOptionsWithPRF
  extends PublicKeyCredentialRequestOptions {
  extensions?: AuthenticationExtensionsClientInputs & AuthenticationExtensionsPRFInputs;
}

/**
 * Extended AuthenticatorAttestationResponse with PRF extension results
 */
export interface AuthenticatorAttestationResponseWithPRF
  extends AuthenticatorAttestationResponse {
  getClientExtensionResults(): AuthenticationExtensionsClientOutputs & AuthenticationExtensionsPRFOutputs;
}

/**
 * Extended AuthenticatorAssertionResponse with PRF extension results
 */
export interface AuthenticatorAssertionResponseWithPRF
  extends AuthenticatorAssertionResponse {
  getClientExtensionResults(): AuthenticationExtensionsClientOutputs & AuthenticationExtensionsPRFOutputs;
}

/**
 * Extended PublicKeyCredential with PRF support
 */
export interface PublicKeyCredentialWithPRF extends PublicKeyCredential {
  response: AuthenticatorAttestationResponseWithPRF | AuthenticatorAssertionResponseWithPRF;
  getClientExtensionResults(): AuthenticationExtensionsClientOutputs & AuthenticationExtensionsPRFOutputs;
}

// Augment the global CredentialCreationOptions
declare global {
  interface AuthenticationExtensionsClientInputs {
    prf?: {
      eval?: {
        first: BufferSource;
        second?: BufferSource;
      };
      evalByCredential?: Record<string, {
        first: BufferSource;
        second?: BufferSource;
      }>;
    };
  }

  interface AuthenticationExtensionsClientOutputs {
    prf?: {
      enabled?: boolean;
      results?: {
        first?: ArrayBuffer;
        second?: ArrayBuffer;
      };
    };
  }
}
