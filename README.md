# TestLens

**See Beyond Test Coverage.**

TestLens is a local-first VS Code extension prototype for identifying code-coverage gaps in changed lines and suggesting related test files.

## Capabilities

- Parse Git unified diffs, LCOV and Istanbul coverage.
- Distinguish verified coverage gaps from missing or ambiguous evidence.
- Find potentially related Jest/Vitest tests via static import graphs and conservative filename heuristics.
- Show analysis results in the VS Code sidebar and require approval before running selected tests.

## Develop

Requires Node.js >=22.6. Run `npm install`, `npm run check`, `npm run build`, and `npm run package:vsix`.

**Prototype limitations:** coverage snapshots may be stale; dependency selection is non-exhaustive; full extension-host integration and VSIX packaging have not been verified. Never treat a potential finding as proven missing tests.
