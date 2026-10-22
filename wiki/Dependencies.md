# Dependencies

This page lists what the tracker uses directly and why. It is an overview, not
a lockfile: the exact resolved versions are in `package-lock.json`,
`src-tauri/Cargo.lock`, and the Docker/Workers build logs. Ranges below match
`package.json` at version 1.5.0.

## Runtime libraries

| Package              | Version   | Used for                                                 |
| -------------------- | --------- | -------------------------------------------------------- |
| `react`, `react-dom` | `^18.3.1` | The interface                                            |
| `@noble/ciphers`     | `^2.4.0`  | Symmetric primitives behind encrypted backups and shares |
| `@noble/hashes`      | `^2.4.0`  | Hash primitives used by the crypto code                  |
| `bcryptjs`           | `^3.0.3`  | Password hashing in the Worker                           |
| `jose`               | `^6.1.3`  | JWT signing and verification for sessions                |
| `openpgp`            | `^6.3.2`  | F2F keyrings and escrow operations in the browser        |
| `qrcode.react`       | `^4.1.0`  | Pairing QR codes                                         |
| `jspdf`              | `^4.1.0`  | PDF export                                               |
| `jspdf-autotable`    | `^5.0.7`  | Tables in the PDF export                                 |
| `lucide-react`       | `^1.52.0` | Icons                                                    |
| `react-easy-crop`    | `^5.5.6`  | Avatar cropping                                          |
| `uuid`               | `^11.1.1` | Client-side identifiers                                  |

The cryptography is deliberately split: the browser holds the keys and does
the encryption; the Worker stores ciphertext and verifies sessions. The server
never needs a library that can decrypt a backup.

## Build and test tools

| Package                                                                             | Version                                                | Used for                                |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------- |
| `typescript`                                                                        | `~5.8.2`                                               | Type checking                           |
| `vite`                                                                              | `^6.2.0`                                               | Development server and production build |
| `@vitejs/plugin-react`                                                              | `^5.0.0`                                               | React support in Vite                   |
| `vite-plugin-pwa`                                                                   | `^1.2.0`                                               | Manifest and service worker             |
| `tailwindcss`, `@tailwindcss/postcss`, `postcss`                                    | `^4.1.18`, `^4.1.18`, `^8.5.6`                         | Styling                                 |
| `vitest`                                                                            | `^4.1.11`                                              | Unit tests                              |
| `@playwright/test`                                                                  | `^1.64.1`                                              | End-to-end tests                        |
| `wrangler`                                                                          | `^4.147.0`                                             | Local Worker, D1/R2, migrations, deploy |
| `@cloudflare/workers-types`                                                         | `^5.20261005.1`                                        | Worker API types                        |
| `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `globals` | `^10.12.0`, `^10.0.1`, `^8.71.1`, `^7.1.1`, `^17.13.0` | Linting                                 |
| `prettier`                                                                          | `^3.9.10`                                              | Formatting                              |
| `@tauri-apps/cli`                                                                   | `^1.6.3`                                               | Desktop build                           |
| `@types/node`, `@types/react`, `@types/react-dom`                                   | `^22.14.0`, `^18.3.31`, `^18.3.7`                      | Type definitions                        |

## Desktop

`src-tauri/Cargo.toml` depends on `tauri ^1.8` with the `shell-open` feature,
and `tauri-build ^1.5` at build time. The release profile uses LTO, strips
symbols, and builds one codegen unit. Tauri 2 is intentionally not adopted yet;
Dependabot is configured not to propose that major upgrade.

## Platform services

| Service                   | Role                                          | Required?                                |
| ------------------------- | --------------------------------------------- | ---------------------------------------- |
| Cloudflare Workers        | Runs the Worker and serves the app            | For the serverless deployment            |
| Cloudflare D1             | Accounts, sessions, encrypted backups, shares | For the serverless deployment            |
| Cloudflare R2             | Avatars                                       | For the serverless deployment            |
| Docker / Docker Compose   | Runs the same Worker locally in a container   | For the container deployment             |
| GitHub Container Registry | Published images                              | Optional; the package is private for now |
| npm                       | JavaScript dependencies                       | Build time                               |
| Rust / Cargo              | Desktop app                                   | Only for the desktop build               |

There is no external database, queue, cache, or third-party analytics service
in the request path. The app does not call a remote model; concentration
estimates run in the browser.

## Update policy

- **Dependabot** checks npm, Cargo, GitHub Actions, and Docker weekly, with a
  seven-day cooldown so a compromised or broken release can be withdrawn before
  it lands. Minor and patch updates are grouped into one pull request per
  ecosystem; Tauri and React majors are excluded and handled by hand.
- **CodeQL** runs on the repository; the Docker publish workflow builds for
  `linux/amd64` and `linux/arm64`.
- The Worker, the desktop app, and the Docker image share the version in
  `package.json` / `src-tauri/Cargo.toml`; `scripts/set_version.py` keeps them
  in step.

## Attribution and licence

The concentration model is based on
[LaoZhong-Mihari/HRT-Recorder-PKcomponent-Test](https://github.com/LaoZhong-Mihari/HRT-Recorder-PKcomponent-Test).
Keep that credit visible if you deploy the app publicly. The project is MIT
licensed; see `LICENSE` in the repository.
