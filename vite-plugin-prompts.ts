// Vite Plugin for Loading LLM Prompts at Build Time
// Enables serverless deployment by inlining prompts as virtual modules

import type { Plugin } from "vite";
import { readFileSync } from "fs";
import { resolve } from "path";

export function promptsPlugin(): Plugin {
  const VIRTUAL_MODULE_ID = "virtual:prompts";
  const RESOLVED_ID = "\0" + VIRTUAL_MODULE_ID;

  return {
    name: "prompts",
    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) {
        return RESOLVED_ID;
      }
    },
    load(id) {
      if (id === RESOLVED_ID) {
        try {
          // Load all prompts at build time
          const prompts = {
            serenityFormAnalysis: readFileSync(
              resolve(
                process.cwd(),
                "src/lib/prompts/serenity-form-analysis.md",
              ),
              "utf-8",
            ),
            // Add other prompts here as needed
          };

          // Return as ES module with inlined prompt data
          return `export const prompts = ${JSON.stringify(prompts, null, 2)};`;
        } catch (error) {
          console.error("Failed to load prompts:", error);
          // Return empty object as fallback
          return "export const prompts = {};";
        }
      }
    },
  };
}
