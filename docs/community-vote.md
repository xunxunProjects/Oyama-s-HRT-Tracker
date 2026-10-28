# Community funding vote

The app includes a one-off advisory vote on whether the project should accept
cryptocurrency donations, how donations would be split, and which currencies to
support. It lives at **Settings → Community funding** (`settings-community`);
the page is readable while signed out.

The constants, option ids, and tally rules are shared by the page and the Worker
in [`communityVote.ts`](../communityVote.ts), so the proposal and the API cannot
drift apart.

## The proposal

- **Split** (one choice):
  - `30-30-40` — fantuanmtf 30%, SmirnovaOyama 30%, project 40% (proposed)
  - `25-25-50`
  - `40-40-20`
  - `0-0-100` — all to the project
- **Additional currencies** (multi-select): Bitcoin, Ethereum, Bitcoin Cash.
- **Accept donations** (yes/no).

Monero is always supported and is not part of the currency question. It gives
anonymous donors a privacy-preserving option even if the vote adds nothing
else.

The vote window is **2026-10-29 00:00:00 UTC** through
**2026-11-19 23:59:59 UTC**. Change `COMMUNITY_VOTE_OPENS_AT` and
`COMMUNITY_VOTE_CLOSES_AT` before deploying if those dates are wrong.

## Eligibility

A ballot needs both:

1. **Account age ≥ 10 days**, checked by the Worker from `users.created_at`.
2. **At least 5 distinct local calendar days with a dose**, counted in the
   browser from the signed-in account's `localStorage` records in both HRT
   modes, from registration time to now.

Dose records are end-to-end encrypted and never readable by the Worker, so the
five-day check has to run locally. The browser sends only the boolean result;
the Worker checks that it is `true`, not the number of days. Records on another
device do not count until the user signs in there or imports a backup.

Each account gets one ballot and may replace it until the vote closes. The
Worker stores the account id to enforce that and to delete the ballot with the
account, but no API returns voter identities. The public tally is aggregate
only.

## Result rules

- **Split:** the option with the most ballots wins. A tie falls back to
  `30-30-40`.
- **Accept donations:** yes needs more than half of all ballots. A tie means no.
- **Additional currency:** each currency needs more than half of all ballots.
  If none passes, only Monero is supported.
- If the vote rejects donations, no addresses are published and the split and
  currency answers are informational.

These rules are displayed on the page and implemented in `resolveVoteOutcome`
in `communityVote.ts`; the page and tests use the same helper.

## API and schema

Migration [`0013_community_vote.sql`](../migrations/0013_community_vote.sql)
adds `community_vote_ballots`, keyed by `(vote_key, user_id)`.

| Route              | Auth   | Purpose                                                      |
| ------------------ | ------ | ------------------------------------------------------------ |
| `GET /api/vote`    | none   | Proposal window/status and the aggregate tally               |
| `GET /api/vote/me` | Bearer | Account age, eligibility, and the signed-in account's ballot |
| `POST /api/vote`   | Bearer | Create or replace the ballot                                 |

`POST` accepts:

```json
{
  "splitChoice": "30-30-40",
  "currencies": ["bitcoin"],
  "acceptDonations": true,
  "hrtEligible": true
}
```

The Worker rejects requests outside the window (`VOTE_NOT_OPEN`,
`VOTE_CLOSED`), unknown options (`INVALID_*`), an unmet local check
(`HRT_INELIGIBLE`), and accounts younger than ten days (`ACCOUNT_TOO_NEW`).
The public route is rate-limited per address; the authenticated routes are
rate-limited per account.

## Deploying

The Cloudflare deploy workflow does **not** apply D1 migrations. Apply the
migration **before deploying this Worker version**, not after:

```bash
npm run wrangler:migrate:remote
```

The account-deletion batches also delete this table's rows. If the Worker is
deployed before `0013`, both self-service and admin account deletion fail with
`no such table`. Apply the migration to the preview database before relying on
a PR preview as well.

The Docker entrypoint applies pending migrations on startup. Self-hosted
deployments using the image do not need a separate step.

## Tests

`tests/communityVote.test.ts` covers the window boundaries, option
normalisation, tally and final-outcome rules, local HRT-day counting, and the
three handlers with an in-memory D1 stand-in. `tests/dockerRuntime.test.ts`
verifies that the two new root modules are copied into the Docker image.
