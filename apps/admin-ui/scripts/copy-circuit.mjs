// Copies the nargo-compiled circuit artifact into admin-ui/public so the
// /refresh page can fetch it at runtime. Runs as predev/prebuild.
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../../../circuits/zkma-auth/target/zkma_auth.json");
const dst = resolve(here, "../public/circuit/zkma_auth.json");

if (!existsSync(src)) {
  console.error(`circuit artifact not found at ${src}`);
  console.error("run: cd circuits/zkma-auth && nargo compile");
  process.exit(1);
}
mkdirSync(dirname(dst), { recursive: true });
copyFileSync(src, dst);
console.log(`copied circuit artifact -> ${dst}`);
