/**
 * Profile loading type definitions
 */

import type { Document } from "$lib/documents/types.d";

/** Core profile data from database */
export interface ProfileCore {
  profiles: {
    id: string;
    fullName: string;
    [key: string]: any;
  };
  status: string;
}

/** Result of profile loading operation */
export interface ProfileLoadResult {
  profileData: any;
  roots: Document[];
}
