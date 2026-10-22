# Usage

This page describes the web app. The command-line client is documented in the
[Tools wiki](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker-Tools/wiki).

## First run

Open the app. The first screen asks for the basics the model needs, including
your therapy mode (feminizing or masculinizing). You can change the mode later
under Settings; the app keeps the records you already have.

Records are stored in your browser by default. You do not need an account to
log doses, see the curve, or use the what-if planner. An account is needed for
cloud backup, share links, avatars, and the account-security features below.

## Navigation

The main navigation has **Overview**, **History**, **Labs**, and **Settings**.
**Account** holds the signed-in user's security and profile pages. **Admin**
appears only for administrators.

## Doses and history

- **Log a dose** from the overview or from the dose form. Pick the drug, route,
  and dose; the app adds it to the timeline.
- **Injection esters** include estradiol benzoate, valerate, cypionate,
  enanthate, and undecylate (beta), plus testosterone cypionate, enanthate, and
  undecanoate.
- **Sublingual doses** ask how long you held the tablet, from 2 to 15 minutes,
  or let you enter your own time.
- **Gel and patches** are supported for the drugs that use them.
- **History** lists recorded doses and lets you correct or remove entries.
  Editing a dose changes the curve immediately.
- **Plans** describe what you take and how often. The overview shows what is
  due today and can log it in one tap.
- **What-if** compares continuing the current plan with a planned change. It is
  a simulation; it does not modify your records.

Adjunct drugs (spironolactone, bicalutamide, medroxyprogesterone acetate,
raloxifene, leuprorelin, and triptorelin) can be logged, but they have no level
model and draw no curve.

## Labs and calibration

- Record a blood test with its date, value, unit, and assay. The app converts
  between the units it supports and shows the result next to the estimate.
- Estradiol can be calibrated against your labs with EKF, OU-Kalman, or MIPD,
  or you can edit the model parameters by hand under Settings. Calibration is
  optional; the uncalibrated curve remains available.
- Lab results are personal data. They are not included in share links, and
  backups are encrypted before they leave the browser.

## Weight

Weight records are used by the model where its parameters depend on body size.
Add or update a weight entry under the weight settings. Weight is not included
in share links.

## Supplies

Supplies track how much of each medicine you have. Logged doses are subtracted
automatically, and the overview warns you before a supply runs out. Adjust the
count when you refill or correct a mistake.

## Backup, export, and import

- **Cloud backup** uploads an end-to-end encrypted copy. The server stores
  ciphertext; the key stays with the client. Choose a strong backup passphrase
  and keep it somewhere safe — losing it means the backup cannot be read.
- **Export** writes a file you can keep offline.
- **Import** restores records from an export. Review the preview before
  confirming; importing does not silently merge unrelated data.
- Export files and backups contain health data. Treat them like any other
  medical record.

The exact backup envelope and share formats are documented in the repository
under `docs/` and in the Tools wiki's protocol pages.

## Share links

A share link exposes a read-only view of dose history and the curve. The
decryption key lives only in the link fragment, so anyone with the complete
link can read it. Lab results, weight, and account details are never included.
Revoke a link when you no longer need it; revoking removes the stored payload.

## F2F keyrings

The **F2F** page handles cohort keyrings. Cohort membership and escrow are
operator features; the protocol, keyring format, and operator commands are
documented in the [Tools wiki](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker-Tools/wiki/F2F-Keyrings)
and in `docs/hrt-protocol/F2F_SERVICE.md`.

## Account and security

An account adds:

- **Profile and avatar** editing.
- **Password change** and **two-factor authentication**.
- **Sessions**: review and revoke signed-in devices.
- **Passkey sign-in**, where the deployment supports it. Passkeys require a
  secure context (https or localhost).
- **Account deletion**, which removes the account and its server-side data.

Sign-in tokens are bound to the deployment's `JWT_SECRET`. Changing that secret
signs every session out; the app has no previous-secret fallback.

## Settings

Settings cover the therapy mode, age, weight, calibration, appearance,
language, export/import, sharing, transparency, and the optional hrt:// pairing
controls. Language changes apply immediately and are stored with your local
settings.

Appearance settings include the theme. The app respects the system preference
where the browser exposes it.

## Administrators

An administrator sees an **Admin** page in addition to the normal navigation.
Its controls include editing a user's profile, resetting a user's two-factor
authentication, and viewing that user's cloud backups. Administrator access is
authorized by the Worker; hiding the page in the frontend is not the security
boundary.

Set the built-in administrator with `ADMIN_USERNAME` and `ADMIN_PASSWORD` (set
both or neither), or use the deployment's account controls. See
[Deployment](Deployment) and [Security](Security).

## Command line

`hrt-tool` reads the same data model from the command line: `status`, `look`,
`add dose`, `lab`, `weight`, `export`, and the interactive console. It talks to
a server over `https://` or `hrt://` and keeps its own encrypted vault. Start
with the [Tools wiki Quick Start](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker-Tools/wiki/Quick-Start).

## Troubleshooting

- **The curve looks wrong after an edit.** Check the dose's time zone and the
  route; the model uses the recorded local time.
- **A lab is far from the estimate.** That is common. Use the lab calibration
  tools if you want the model to fit your results, and discuss the numbers with
  a clinician.
- **Cloud backup or sign-in fails.** Check that the Worker is reachable, that
  `JWT_SECRET` is valid, and that the browser is not blocking storage. The
  Docker health check is `/api/transparency`.
- **Passkeys or installation are unavailable.** Serve the app over https (or
  open it on localhost). Plain http on a LAN works for the app itself but not
  for those browser features.
- **A self-hosted instance answers 503 on every route.** The Worker rejected
  `JWT_SECRET`. See [Deployment-Docker](Deployment-Docker) for the rules.
