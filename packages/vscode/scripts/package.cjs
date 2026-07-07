/**
 * VSIX packager.
 *
 * Why staging: this is a pnpm workspace, so node_modules is a symlink farm
 * vsce can't traverse, and `vsce package --no-dependencies` used to ship a
 * VSIX with NO dependencies at all while the bundle still `require`d the
 * native/external ones (broken install on any other machine).
 *
 * Flow:
 *   1. esbuild bundles all pure-JS deps into dist/extension.js (see
 *      esbuild.config.mjs); only native/wasm/@ai-sdk/google stay external.
 *   2. Copy manifest + dist + media + docs into a staging dir.
 *   3. `npm install --omit=dev` in staging — real npm layout containing ONLY
 *      the runtime externals declared in "dependencies".
 *   4. `vsce package` in staging (full dependency walk now works), copy the
 *      .vsix back next to this package.
 */
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const pkgRoot = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(pkgRoot, "package.json"), "utf8"));

function run(cmd, cwd) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd });
}

// 1. Fresh build
run("node esbuild.config.mjs", pkgRoot);

if (!fs.existsSync(path.join(pkgRoot, "dist", "extension.js"))) {
  console.error("dist/extension.js missing after build");
  process.exit(1);
}

// 2. Stage
const staging = fs.mkdtempSync(path.join(os.tmpdir(), "crayon-vsix-"));
console.log(`Staging in ${staging}`);

const stagedManifest = { ...manifest };
delete stagedManifest.private; // publish-blocker is for npm, not vsce
delete stagedManifest.devDependencies; // bundled — not needed in the VSIX
delete stagedManifest.scripts;
fs.writeFileSync(path.join(staging, "package.json"), JSON.stringify(stagedManifest, null, 2));

for (const entry of ["dist", "media", "README.md", "CHANGELOG.md", "LICENSE"]) {
  const src = path.join(pkgRoot, entry);
  if (fs.existsSync(src)) {
    fs.cpSync(src, path.join(staging, entry), { recursive: true });
  }
}
// Don't ship sourcemaps in the VSIX
for (const f of fs.readdirSync(path.join(staging, "dist"))) {
  if (f.endsWith(".map")) fs.rmSync(path.join(staging, "dist", f));
}

// 3. Real npm install of the runtime externals
run("npm install --omit=dev --no-package-lock --no-audit --no-fund", staging);

// 4. Package and copy back
run("npx --yes @vscode/vsce package --allow-missing-repository --out extension.vsix", staging);

const outName = `${manifest.name}-${manifest.version}.vsix`;
const outPath = path.join(pkgRoot, outName);
fs.copyFileSync(path.join(staging, "extension.vsix"), outPath);
fs.rmSync(staging, { recursive: true, force: true });
console.log(`\nPackaged: ${outPath}`);
