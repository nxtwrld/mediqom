import type { VCard } from "$lib/contact/types.d";

export enum SexEnum {
  male = "male",
  female = "female",
  intersex = "intersex",
}

export enum BloodType {
  "A+" = "A+",
  "A-" = "A-",
  "B+" = "B+",
  "B-" = "B-",
  "AB+" = "AB+",
  "AB-" = "AB-",
  "O+" = "O+",
  "O-" = "O-",
}

export interface Profile {
  id: string;
  fullName: string;
  language: string;
  vcard: any;
  health: any;
  insurance: any;
  publicKey: string;
  status: string;
  avatarUrl?: string;
  birthDate?: string;
  profileDocumentId?: string;
  healthDocumentId?: string;
}

export interface ProfileNew {
  fullName: string;
  birthDate?: string;
  language?: string;
  insurance?: any;
  vcard?: VCard;
  health?: any;
}

export enum ANALYZE_STEPS {
  transcript = "transcript",
  diagnosis = "diagnosis",
}

export type Signal = {
  signal: string;
  value: any;
  unit: string;
  reference: string;
  date: string;
  urgency?: number;
  source?: "input" | string;
  refId?: string;
};
