import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const PLUGIN_ID_PATTERN = /^[a-z0-9-]+$/;
const RELEASE_ASSETS = ["main.js", "manifest.json", "styles.css"];

function parseArguments(argv) {
  let root = process.cwd();
  let tag;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--root") {
      root = argv[index + 1];
      index += 1;
    } else if (argument?.startsWith("--root=")) {
      root = argument.slice("--root=".length);
    } else if (argument === "--tag") {
      tag = argv[index + 1];
      index += 1;
    } else if (argument?.startsWith("--tag=")) {
      tag = argument.slice("--tag=".length);
    } else {
      throw new Error(`Unknown argument: ${argument ?? ""}`);
    }
  }
  if (root === undefined || root.length === 0) {
    throw new Error("--root requires a path");
  }
  if (tag !== undefined && tag.length === 0) {
    throw new Error("--tag requires a value");
  }
  return { root: resolve(root), tag };
}

function readJson(root, filename) {
  const path = resolve(root, filename);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${filename} is not valid JSON: ${message}`);
  }
}

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function validateManifest(manifest) {
  const id = requireString(manifest.id, "manifest.id");
  if (
    !PLUGIN_ID_PATTERN.test(id) ||
    id.includes("obsidian") ||
    id.endsWith("plugin")
  ) {
    throw new Error("manifest.id does not satisfy Obsidian's plugin ID rules");
  }
  const name = requireString(manifest.name, "manifest.name");
  if (/obsidian|plugin/i.test(name)) {
    throw new Error("manifest.name must not contain Obsidian or Plugin");
  }
  requireString(manifest.author, "manifest.author");
  requireString(manifest.minAppVersion, "manifest.minAppVersion");
  const description = requireString(manifest.description, "manifest.description");
  if (description.length > 250 || !description.endsWith(".")) {
    throw new Error("manifest.description must be at most 250 characters and end with a period");
  }
  if (typeof manifest.isDesktopOnly !== "boolean") {
    throw new Error("manifest.isDesktopOnly must be a boolean");
  }
}

function validateAssets(root) {
  for (const filename of RELEASE_ASSETS) {
    const path = resolve(root, filename);
    if (!existsSync(path) || !statSync(path).isFile() || statSync(path).size === 0) {
      throw new Error(`${filename} must be a non-empty release asset`);
    }
  }
}

function validateRelease({ root, tag }) {
  const packageJson = readJson(root, "package.json");
  const packageLock = readJson(root, "package-lock.json");
  const manifest = readJson(root, "manifest.json");
  const versions = readJson(root, "versions.json");
  const version = requireString(packageJson.version, "package.version");

  if (!VERSION_PATTERN.test(version)) {
    throw new Error("package.version must use the x.y.z format");
  }
  if (manifest.version !== version) {
    throw new Error("package.json and manifest.json versions must match");
  }
  if (versions[version] !== manifest.minAppVersion) {
    throw new Error("versions.json must map the current version to manifest.minAppVersion");
  }
  if (packageJson.license !== "MIT") {
    throw new Error("package.license must be MIT");
  }
  if (packageJson.private !== true) {
    throw new Error("package.private must remain true");
  }
  if (packageJson.engines?.node !== ">=20") {
    throw new Error("package.engines.node must be >=20");
  }

  const rootPackage = packageLock.packages?.[""];
  if (
    packageLock.version !== version ||
    rootPackage?.version !== version ||
    rootPackage?.name !== packageJson.name ||
    rootPackage?.license !== packageJson.license ||
    rootPackage?.engines?.node !== packageJson.engines.node
  ) {
    throw new Error("package-lock.json root metadata must match package.json");
  }
  const esbuildVersion = packageLock.packages?.["node_modules/esbuild"]?.version;
  const allowedInstallScripts = Object.entries(packageJson.allowScripts ?? {});
  if (
    typeof esbuildVersion !== "string" ||
    allowedInstallScripts.length !== 1 ||
    allowedInstallScripts[0]?.[0] !== `esbuild@${esbuildVersion}` ||
    allowedInstallScripts[0]?.[1] !== true
  ) {
    throw new Error("package.allowScripts must approve only the locked esbuild version");
  }

  validateManifest(manifest);
  validateAssets(root);

  const environmentTag = process.env.GITHUB_REF_TYPE === "tag"
    ? process.env.GITHUB_REF_NAME
    : undefined;
  const expectedTag = tag ?? environmentTag;
  if (expectedTag !== undefined && expectedTag !== version) {
    throw new Error(`release tag ${expectedTag} must equal version ${version}`);
  }

  return version;
}

try {
  const version = validateRelease(parseArguments(process.argv.slice(2)));
  console.log(`Release metadata and assets are valid for ${version}.`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Release validation failed: ${message}`);
  process.exitCode = 1;
}
