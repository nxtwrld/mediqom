export interface Content {
  type: "text" | "image_url";
  text?: string;
  image_url?: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
}

type TokenUsage = {
  total: number;
  [key: string]: number;
};
