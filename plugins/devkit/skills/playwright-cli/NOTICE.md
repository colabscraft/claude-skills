# playwright-cli - vendored, unchanged

- **Source:** the skill bundled in the npm package `@playwright/cli` **0.1.25**
  (Microsoft, https://github.com/microsoft/playwright-cli), folder `skills/playwright-cli/`.
- **Licence:** Apache-2.0, the package's own `LICENSE` beside this file.
- **Changes:** none. `SKILL.md` and `references/` are byte-for-byte the upstream files.
  This file and `LICENSE` were added.

## The CLI it drives

Node 20 or newer, then:

```
npm install -g @playwright/cli@0.1.25
playwright-cli --version
```

A newer CLI works too; refresh this folder from that version's package so the skill and the CLI agree.

## Refreshing

```
npm pack @playwright/cli@<version> --ignore-scripts
tar -xzf playwright-cli-<version>.tgz
```

Copy `package/skills/playwright-cli/` over this folder, keep `NOTICE.md` and `LICENSE` (update the version
above), and commit.
