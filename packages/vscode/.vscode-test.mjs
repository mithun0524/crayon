import { defineConfig } from '@vscode/test-cli';

// Headless smoke tests: downloads a real VS Code, loads this extension from
// the built dist/, and runs the compiled mocha suite from out-test/.
export default defineConfig({
  files: 'out-test/test/**/*.test.js',
  mocha: { ui: 'bdd', timeout: 120000 },
});
