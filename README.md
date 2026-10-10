# TestLens

See Beyond Test Coverage. Local-first coverage gap analysis and related test discovery.

## Structure
- `packages/core`: analysis engine and unit tests
- `packages/vscode`: VS Code extension and packaging
- `.github/workflows`: pnpm quality, VSIX packaging, optional SonarCloud scanning

## Development
Node 22+, pnpm 10.17.1.

```bash
corepack enable
pnpm install
pnpm check
pnpm package:vsix
```

SonarCloud requires repository variables `SONAR_PROJECT_KEY`, `SONAR_ORGANIZATION` and secret `SONAR_TOKEN`. The workflow skips when `SONAR_PROJECT_KEY` is unset. Coverage LCOV export is being finalized; do not claim imported Sonar coverage until the report exists.

Test results and quality gates must be checked on the pull request. Test selection is heuristic and non-exhaustive.
