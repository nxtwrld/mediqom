import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKIP_MARKER = path.join(__dirname, "..", ".auth", "skip");

/** Check if tests requiring a real authenticated session should be skipped
 * (missing credentials or auth-setup failure — see auth-setup.ts). */
export function shouldSkip(): string | false {
  if (fs.existsSync(SKIP_MARKER)) {
    return fs.readFileSync(SKIP_MARKER, "utf-8");
  }
  return false;
}
