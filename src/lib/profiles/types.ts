/**
 * Profile loading type definitions
 */

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
}
