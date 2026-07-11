// Publish the packaged VS Code extension to the VS Code Marketplace and Open
// VSX during semantic-release. Runs AFTER prepareCmd has built the .vsix.
//
// Non-fatal by design: if a token is absent the corresponding publish is
// skipped (so releases keep working until the tokens are configured).
//   VSCE_PAT — Azure DevOps PAT for the marketplace publisher
//   OVSX_PAT — Open VSX access token
import { execSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const dir = 'packages/vscode';
const vsix = readdirSync(dir).filter((f) => f.endsWith('.vsix')).sort().pop();

if (!vsix) {
  console.error('publish-vscode: no .vsix found in packages/vscode — did prepare run? Skipping.');
  process.exit(0);
}
const pkgPath = path.join(dir, vsix);
const { VSCE_PAT, OVSX_PAT } = process.env;

if (VSCE_PAT) {
  console.log(`publish-vscode: publishing ${vsix} to the VS Code Marketplace…`);
  execSync(`npx --yes @vscode/vsce publish --packagePath "${pkgPath}" --pat "${VSCE_PAT}"`, { stdio: 'inherit' });
} else {
  console.log('publish-vscode: VSCE_PAT not set — skipping VS Code Marketplace publish.');
}

if (OVSX_PAT) {
  console.log(`publish-vscode: publishing ${vsix} to Open VSX…`);
  execSync(`npx --yes ovsx publish "${pkgPath}" --pat "${OVSX_PAT}"`, { stdio: 'inherit' });
} else {
  console.log('publish-vscode: OVSX_PAT not set — skipping Open VSX publish.');
}
