interface PasswordCredentialData {
	id: string;
	password: string;
	name?: string;
	iconURL?: string;
}

declare global {
	interface CredentialRequestOptions {
		password?: boolean;
		mediation?: 'silent' | 'optional' | 'required';
	}

	interface Credential {
		id: string;
		type: string;
	}

	class PasswordCredential implements Credential {
		constructor(data: PasswordCredentialData);
		id: string;
		type: 'password';
		password: string;
		name?: string;
		iconURL?: string;
	}

	interface Window {
		PasswordCredential?: typeof PasswordCredential;
	}
}

export {};
