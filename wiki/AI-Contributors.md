# AI and contributor commit rules

This page is the checklist for anyone — human or AI — proposing a change to
the tracker. The repository rules in `CONTRIBUTING.md`, `SECURITY.md`, and
`CODE_OF_CONDUCT.md` take precedence; this is the short operational version.

## Before you start

- Read `CONTRIBUTING.md`, `SECURITY.md`, and the relevant page in this wiki.
- Work on a branch or a throwaway worktree. Do not develop directly on `main`.
- Do not read, copy, or commit the maintainer's real `.dev.vars`, `.env`,
  tokens, keys, databases, or medical data.
- Do not touch unrelated worktrees, untracked files, or another person's
  changes. If a file is unfamiliar, inspect it before editing.
- For a security-sensitive change (auth, JWT, crypto, raw transport, rate
  limits, admin), describe the design and ask a maintainer before writing code.

## Never commit

| Do not commit                                                 | Why                                            |
| ------------------------------------------------------------- | ---------------------------------------------- |
| `.dev.vars`, `.env`, any secret or token                      | Credentials; `.gitignore` is not a guarantee   |
| `data/`, D1 files, uploads, real or synthetic medical records | Private data; use a throwaway volume           |
| `dist/`, `node_modules/`, build outputs, binaries             | Generated; CI and releases build them          |
| `.playwright-mcp/`, screenshots, traces, test downloads       | Local test artifacts                           |
| Logs with request bodies, tokens, or user identifiers         | They leak credentials and data                 |
| A `main` deployment or a rebuild of a release tag             | Production must be reproducible from a release |

If you are not sure whether a file is generated, check `.gitignore` and ask
before adding it.

## Workflow

1. Branch from the current `main`: `feat/<topic>`, `fix/<topic>`, or
   `docs/<topic>`.
2. Keep the change small and focused. Do not refactor unrelated code.
3. Add or update tests for behavior changes. Write the failing test first.
4. Update `CHANGELOG.md` for user-visible changes and the `wiki/` source for
   documentation changes.
5. Run the checks listed below and read the output.
6. Commit with a clear message (`feat:`, `fix:`, `docs:`, `test:`,
   `refactor:`, `chore:`), then push the branch and open a pull request.
7. Wait for CI. Fix failures. Do not bypass required checks or admin-merge
   without a maintainer's explicit approval.

Never force-push a shared branch, rewrite published history, or merge your own
security-sensitive change without review.

## Checks

Frontend and Worker:

```bash
npx tsc --noEmit
npm run lint
npm run format:check
npm test
npm run build
```

Tools (when the change touches `tools/`):

```bash
cmake -S tools/hrt-tool -B tools/hrt-tool/build
cmake --build tools/hrt-tool/build -j"$(nproc)"
ctest --test-dir tools/hrt-tool/build --output-on-failure
cd tools/hrt-cold && go test ./...
cd tools/hrt-f2f && go test ./...
```

Run the cross-build or sanitizer job when the change affects platform code.
If a check cannot run in your environment, say so in the pull request; do not
claim it passed.

## Version policy

- Production deployments use the latest release tag (`v1.5.0`), never `main`.
- Security researchers use the latest commit; say which commit you tested.
- A release is built from a tag, with CI, and published. Do not retag or move a
  release.

## Documentation and the wiki

The wiki source lives in `wiki/` in the repository. Edit it there, run
`scripts/publish-wiki.sh --check` (and `--dry-run` when useful), then publish
from an updated `main` checkout. Do not edit the GitHub wiki UI directly; the
next publish would overwrite it. The same rule applies to the Tools wiki.

## AI-specific rules

- Use a throwaway worktree for experiments and delete it when finished.
- Test against `127.0.0.1` only. Stop if a browser or tool tries to contact any
  other host.
- Do not scan, fuzz, or load-test a public instance.
- Do not run destructive commands, delete data, rotate keys, or change
  repository settings without explicit permission.
- State exactly what you ran and what you observed. A test you did not run is
  not evidence. Do not invent output, paths, or commit hashes.
- If you used a subagent or a tool, verify its claims against the repository
  before reporting success.

## Pull-request checklist

- [ ] The change is on a branch and the diff contains only the intended files.
- [ ] Tests were added or updated, and the failing-first step was observed.
- [ ] The checks above pass; the commands and results are in the description.
- [ ] No secrets, data, build outputs, or local artifacts are in the diff.
- [ ] `CHANGELOG.md` and the `wiki/` source are updated when needed.
- [ ] Security-sensitive changes have a maintainer review.
- [ ] CI is green; required checks were not bypassed.
