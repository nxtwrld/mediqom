export interface VCard {
  fn?: string;
  n?: {
    familyName?: string;
    givenName?: string;
    additionalName?: string;
    additionalNames?: string[];
    honorificPrefix?: string;
    honorificPrefixes?: string[];
    honorificSufix?: string;
    honorificSuffixes?: string[];
  };
  org?: string;
  title?: string;
  tel?: Array<{
    type?: string;
    value?: string;
  }>;
  email?: Array<{
    type?: string;
    value?: string;
  }>;
  adr?: Array<{
    streetAddress?: string;
    locality?: string;
    region?: string;
    postalCode?: string;
    countryName?: string;
  }>;
  specialty?: string[];
  publicKey?: string;
}
