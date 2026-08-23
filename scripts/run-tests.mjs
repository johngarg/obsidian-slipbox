import { spawn } from "node:child_process";
import { readdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const output = resolve(root, "dist");
const testOutput = resolve(output, "test");
const typeScriptCli = resolve(root, "node_modules", "typescript", "bin", "tsc");

await rm(output, { recursive: true, force: true });
await run(process.execPath, [typeScriptCli, "-p", "tsconfig.test.json"]);

const testFiles = (await readdir(testOutput, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith(".test.js"))
  .map((entry) => resolve(testOutput, entry.name))
  .sort();

if (testFiles.length === 0) {
  throw new Error("No compiled test files were found");
}

await run(process.execPath, ["--test", ...testFiles]);

function run(command, arguments_) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, arguments_, {
      cwd: root,
      stdio: "inherit",
      shell: false,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(
        signal === null
          ? `${command} exited with code ${code ?? "unknown"}`
          : `${command} exited after signal ${signal}`,
      ));
    });
  });
}
