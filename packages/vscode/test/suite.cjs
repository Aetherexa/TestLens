const assert = require('node:assert/strict');
const vscode = require('vscode');
async function main() {
  const extension = vscode.extensions.getExtension('aetherexa.testlens');
  assert.ok(extension, 'TestLens extension is discoverable by VS Code');
  await extension.activate();
  assert.equal(extension.isActive, true, 'TestLens extension activates');
  const commands = await vscode.commands.getCommands(true);
  assert.ok(commands.includes('testlens.analyze'), 'Analyze command is registered');
  assert.ok(commands.includes('testlens.runRelated'), 'Run related tests command is registered');
  console.log('TestLens extension host smoke: PASS');
}
module.exports.run = main;
