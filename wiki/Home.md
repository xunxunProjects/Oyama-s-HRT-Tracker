# Who are you?

This wiki is organized by what you need to do. Pick the row that sounds like
you, then follow the page. Every page says which version it describes.

| You are...                                                          | Start here                                   | Version to use                                      |
| ------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------- |
| **I use the tracker** — logging doses, labs, weight, or supplies    | [Usage](Usage)                               | Latest release, `v1.5.0`                            |
| **I deploy it** — a server, a container, or Cloudflare              | [Deployment](Deployment)                     | **Latest release, `v1.5.0`. Do not deploy `main`.** |
| **I develop it** — frontend, Worker, API, desktop, or raw transport | [Developers](Developers)                     | `main`, following `CONTRIBUTING.md`                 |
| **I test its security** — pentest, code review, or a local lab      | [Security-Researchers](Security-Researchers) | **Latest commit on `main`**                         |
| **I run it locally as a tool** — loopback only, no public port      | [Local-Tool](Local-Tool)                     | Release build + Docker on `127.0.0.1`               |
| **I am an AI or a contributor** — committing code or wiki pages     | [AI-Contributors](AI-Contributors)           | Branch + pull request                               |

## The short version

The tracker logs hormone replacement therapy doses and estimates the hormone
levels they produce. It has a feminizing mode (estradiol, with cyproterone
acetate as an adjunct) and a masculinizing mode (testosterone), and it can
record other adjunct drugs without drawing a curve for them.

It runs in a browser, as an installable web app, as a macOS or Windows desktop
app, or on your own server. The source is MIT-licensed and free of accounts you
do not create yourself.

## Project map

| Chapter                                      | What it answers                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [Architecture](Architecture)                 | What the parts are, how a request flows, and where the trust boundaries sit                      |
| [Usage](Usage)                               | How to use the web app: doses, plans, labs, calibration, backups, sharing, account security      |
| [Deployment](Deployment)                     | How to choose between Cloudflare, Docker, a VPS, and local development, and which version to run |
| [Dependencies](Dependencies)                 | Runtime libraries, build tools, external services, and model credits                             |
| [Security](Security)                         | How to harden a self-hosted instance and how to report a vulnerability                           |
| [Security-Researchers](Security-Researchers) | Where the latest code is, what was recently fixed, and how to run a safe local lab               |
| [AI-Contributors](AI-Contributors)           | What an AI or a new contributor must check before committing                                     |

## Version policy

- **Production deployments use the latest release, `v1.5.0` (2026-10-14).**
  Do not deploy `main`. Unreleased commits have not gone through the release
  checks, and a deployment should be reproducible from a tag.
- **Security research starts from the latest commit on `main`** (`40233a3` at
  the time of writing, 2026-10-22). Read the commit log before testing so you
  know what changed. The two Low-severity fixes merged on 2026-10-22 are not in
  `v1.5.0`; they will be in the next release.
- **Developers work on `main`** and follow `CONTRIBUTING.md`.
- **The Tools wiki** covers the command-line clients and has its own
  [version policy](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker-Tools/wiki).

> **Not medical advice.** The app shows estimates from a pharmacokinetic
> model. They can differ substantially from your real hormone levels and are no
> substitute for blood tests or a clinician. Do not start, stop, or change any
> medication based on this app alone.

The wiki describes version 1.5.0 of the app. Pages that describe a deployment
path say whether that path was exercised while writing the page.
