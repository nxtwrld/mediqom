export interface AppRecord {
  uid: string;
  name: string;
  description: string;
  icon: string;
  url: string;
  author: string;
  category: string;
  credits: number;
  connect?: AppUri;
  tags: string[];
  requires: string[];
  permissions: string[];
  connections: ConnectionType[];
  publicKey: string;
}

export type AppUri = {
  uri: string;
  type: string;
};

export enum AppConnectionType {
  "Report" = "report",
  "Question" = "question",
  "Allergy" = "allergy",
  "Focus" = "focus",
  "Vaccination" = "vaccination",
}
