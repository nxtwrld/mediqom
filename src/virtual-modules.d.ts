// TypeScript declarations for Vite virtual modules
// Provides type safety for build-time loaded configs and prompts

declare module "virtual:prompts" {
  export const prompts: {
    serenityFormAnalysis: string;
  };
}

declare module "virtual:configs" {
  import type { ModelConfiguration } from "$lib/config/model-config";
  import type { TranscriptionConfig } from "$lib/ai/providers/transcription-abstraction";

  export const configs: {
    modelsYaml: ModelConfiguration | null;
    transcription: TranscriptionConfig | null;
    serenityFormSchemas: {
      pre: any;
      post: any;
    };
  };
}
