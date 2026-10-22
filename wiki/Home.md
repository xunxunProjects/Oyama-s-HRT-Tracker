# Oyama's HRT Tracker

Oyama's HRT Tracker logs hormone replacement therapy doses and estimates the
hormone levels they produce. It has a feminizing mode (estradiol, with
cyproterone acetate as an adjunct) and a masculinizing mode (testosterone), and
it can record other adjunct drugs without drawing a curve for them.

It runs in a browser, as an installable web app, as a macOS or Windows desktop
app, or on your own server. The source is MIT-licensed and free of accounts you
do not create yourself.

## Start here

| Page                         | What it covers                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------- |
| [Usage](Usage)               | Recording doses, plans, labs, weight, supplies, backup, sharing, account settings |
| [Deployment](Deployment)     | Choosing between Docker, Cloudflare Workers, and local development                |
| [Dependencies](Dependencies) | Runtime libraries, build tools, external services, and model credits              |
| [Security](Security)         | Hardening a self-hosted instance and reporting a vulnerability                    |

## What it does

- **Hormone curves** for estradiol by injection, oral, sublingual, gel, and
  patch; testosterone by injection and gel; and cyproterone acetate.
- **Doses and plans**, including a what-if view that compares staying on the
  current plan with a change.
- **Lab results** on the same chart as the estimate, with optional calibration
  of the estradiol model (EKF, OU-Kalman, MIPD, or manual parameters).
- **Supplies** that decrease as doses are logged, with a warning before you run
  out.
- **Private-by-default storage**: records stay in the browser until you enable
  cloud backup or create a share link, and both are end-to-end encrypted.
- **Seven interface languages**: Simplified Chinese, Traditional Chinese,
  Cantonese, English, Japanese, Korean, and Turkish.

## Related projects

- [Main repository](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker)
- [Live app](https://hrt.mahiro.uk)
- [Releases](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/releases)
- [Command-line tools](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker-Tools/wiki)
  — `hrt-tool`, `hrt-cold`, and the F2F keyring tools

> **Not medical advice.** The app shows estimates from a pharmacokinetic
> model. They can differ substantially from your real hormone levels and are no
> substitute for blood tests or a clinician. Do not start, stop, or change any
> medication based on this app alone.

The wiki describes version 1.5.0 of the app. Commands and settings were read
from the repository at that version; pages that describe a deployment path say
whether that path was exercised while writing the page.
