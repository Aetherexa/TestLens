import { runTests } from '@vscode/test-electron';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
  await runTests({
    extensionDevelopmentPath: root,
    extensionTestsPath: resolve(root, 'test/suite.cjs'),
    launchArgs: ['--disable-workspace-trust', '--skip-welcome', '--skip-release-notes'],
  });
} catch (error) {
  console.error('VS Code extension-host smoke test failed:', error);
  process.exitCode = 1;
}
