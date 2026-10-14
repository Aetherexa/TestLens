# TestLens SonarCloud integration

The independent SonarCloud workflow runs for pull requests, main branch pushes, and manual dispatches.

## One-time configuration
1. Import `Aetherexa/TestLens` into your SonarCloud organization.
2. In GitHub repository Settings → Secrets and variables → Actions, set repository **variables**:
   - `SONAR_PROJECT_KEY` — the exact project key created in SonarCloud (often `Aetherexa_TestLens`).
   - `SONAR_ORGANIZATION` — the actual SonarCloud organization key (do not assume the display name).
3. Set GitHub Actions **secret** `SONAR_TOKEN` to a project-scoped analysis token.
4. Enable SonarCloud PR analysis and configure the New Code quality gate in SonarCloud.
5. In branch protection/rulesets, require the **SonarCloud Quality Gate** check only after one confirmed successful run.

## Quality behavior
- The scan imports LCOV at `packages/core/coverage/lcov.info`; the workflow verifies the report is nonempty.
- The scanner waits for SonarCloud's quality-gate result and fails for a failed gate.
- Source roots and test files are separated to avoid treating test code as production source.
- If either project variable is missing, the entire Sonar job is **skipped**, not passed. Do not claim Sonar compliance from a skipped run.
- If the token is missing or invalid while variables are configured, the scan should fail. Tokens must never be committed.
- VS Code extension host integration coverage is not yet exported to LCOV; coverage for the extension may be reported as missing/zero until instrumentation is added.

Check GitHub Actions and the SonarCloud project dashboard before release. Never weaken the threshold merely to make CI green.
