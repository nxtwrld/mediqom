// Vite Plugin for Loading Configuration Files at Build Time
// Handles YAML and JSON configs for serverless deployment

import type { Plugin } from "vite";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { load as yamlLoad } from "js-yaml";

export function configsPlugin(): Plugin {
  const VIRTUAL_MODULE_ID = "virtual:configs";
  const RESOLVED_ID = "\0" + VIRTUAL_MODULE_ID;

  return {
    name: "configs",
    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) {
        return RESOLVED_ID;
      }
    },
    load(id) {
      if (id === RESOLVED_ID) {
        try {
          // Model config (YAML)
          const modelsYamlPath = resolve(
            process.cwd(),
            "src/lib/config/models.yaml",
          );
          const modelsYaml = existsSync(modelsYamlPath)
            ? yamlLoad(readFileSync(modelsYamlPath, "utf-8"))
            : null;

          // Transcription config (JSON)
          const transcriptionPath = resolve(
            process.cwd(),
            "config/audio-transcription.json",
          );
          const transcription = existsSync(transcriptionPath)
            ? JSON.parse(readFileSync(transcriptionPath, "utf-8"))
            : null;

          // Serenity form schemas (JSON)
          const serenityPrePath = resolve(
            process.cwd(),
            "src/lib/selfassess/forms/form.serenity-therapeutic-pre.json",
          );
          const serenityPostPath = resolve(
            process.cwd(),
            "src/lib/selfassess/forms/form.serenity-therapeutic-post.json",
          );

          const serenityPre = existsSync(serenityPrePath)
            ? JSON.parse(readFileSync(serenityPrePath, "utf-8"))
            : null;
          const serenityPost = existsSync(serenityPostPath)
            ? JSON.parse(readFileSync(serenityPostPath, "utf-8"))
            : null;

          const configs = {
            modelsYaml,
            transcription,
            serenityFormSchemas: {
              pre: serenityPre,
              post: serenityPost,
            },
          };

          console.log("✅ Build-time configs loaded:", {
            modelsYaml: !!modelsYaml,
            transcription: !!transcription,
            serenityPre: !!serenityPre,
            serenityPost: !!serenityPost,
          });

          // Return as ES module with inlined config data
          return `export const configs = ${JSON.stringify(configs, null, 2)};`;
        } catch (error) {
          console.error("Failed to load configs:", error);
          // Return empty object as fallback
          return "export const configs = {};";
        }
      }
    },
  };
}
