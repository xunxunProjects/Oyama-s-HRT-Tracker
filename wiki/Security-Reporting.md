# Vulnerability report templates

This page gives you a report shape for each kind of problem, so triage does not
start with a guessing game. It complements [SECURITY.md](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/blob/main/SECURITY.md)
and [Security-Researchers](Security-Researchers); it does not change the private
disclosure policy.

**Report privately.** Use GitHub's private advisory form:
<https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/security/advisories/new>.
Never open a public issue, discussion, or pull request with exploit details.
Reports can be written in English or Chinese. 报告可用英文或中文。

## Pick a mode

The labels below are for routing, not for scoring. The maintainers may re-rate a
report after reproducing it. `SECURITY.md` promises an acknowledgement within
seven days; say **urgent** in the subject of a Critical or RCE report so it is
triaged first, but do not assume a faster written reply.

| Mode                      | Use it when                                                                                  | Subject prefix     |
| ------------------------- | -------------------------------------------------------------------------------------------- | ------------------ |
| Low-risk / hardening      | A weakness with no direct exploit, or a small information leak with little impact            | `[Low]`            |
| Medium                    | Exploitation needs an account, user interaction, a race, or a non-default configuration      | `[Medium]`         |
| High                      | A practical exploit with serious confidentiality, integrity, or availability impact          | `[High]`           |
| Critical / RCE            | Code execution, full authentication bypass, mass data access, or full instance compromise    | `[Critical][RCE]`  |
| Information disclosure    | Data, secrets, tokens, keys, logs, source maps, or metadata are exposed                      | `[Info leak]`      |
| Access control            | Authentication, authorization, IDOR, role, session, or admin-boundary problem                | `[Access control]` |
| Privacy / metadata        | The design reveals more about a person than the documentation says, even without a breach    | `[Privacy]`        |
| Dependency / supply chain | A dependency advisory or build artifact matters for this app                                 | `[Dependency]`     |
| Denial of service         | A logic flaw lets one account exhaust a shared resource; not a load test against a live site | `[DoS]`            |

Do not use this page to report a wrong concentration estimate, a feature
request, or a problem in a third-party deployment. Those go through the normal
issue templates or to the operator of that deployment.

## Common skeleton

Every report is easier to reproduce when it answers these questions in order:

```markdown
## Summary

One or two sentences: what is wrong, and what an attacker gains.

## Severity

Proposed mode and why. Mention anything that raises or lowers it.

## Affected version and deployment

Commit or release, browser or desktop app, Cloudflare or Docker or VPS, and any
non-default setting that matters.

## Preconditions

Account, role, feature flag, migration, race window, or user interaction needed.

## Steps to reproduce

The shortest sequence that shows the problem. Use two test accounts when the
problem crosses an account boundary.

## Evidence

Redacted request/response, screenshot, log line, or test output. State what was
not included and why.

## Impact

What data or capability is exposed, for which users, and whether it persists.

## Suggested fix

Optional. A code path or configuration change helps, but do not spend time on a
patch before the report is triaged.

## Credit and disclosure

How you want to be credited, or whether you prefer to stay anonymous.
```

## Low-risk and hardening reports

Use this mode for defence-in-depth gaps, missing headers on a non-sensitive
response, verbose errors that do not contain secrets, weak defaults that require
an already-compromised host, or documentation that could lead an operator into
an unsafe setup.

Include:

- the exact file, route, header, or configuration key;
- whether the default deployment is affected or only a non-default one;
- why the issue matters even though it is not directly exploitable;
- a safe test that does not depend on real user data.

A low-risk report is still useful. Do not inflate it into a High to get
attention, and do not post it publicly because it "looks minor". If the issue
can expose health data, credentials, or another account's records, use
Information disclosure or High instead.

## Medium-severity reports

Use this mode when the problem is real but bounded: it needs an authenticated
account, a victim to open a link, a race that is hard to win, a non-default
operator setting, or it leaks a small amount of data.

Add to the common skeleton:

- the exact prerequisites and how long the window stays open;
- whether the attacker needs an account on the same instance;
- what an attacker can do that a normal user cannot;
- a two-account demonstration when ownership is involved.

If the same bug lets an attacker read another user's doses, labs, backups, or
session material, report it as High, not Medium.

## High-severity reports

Use this mode for a practical exploit with serious impact, for example an
authorization bypass across accounts, stored XSS that can steal a session,
SQL injection, SSRF into a metadata service, a cryptographic flaw that exposes
plaintext, or escalation to an administrator.

Add to the common skeleton:

- a minimal end-to-end chain, not just the first suspicious response;
- whether it is pre-authentication or needs a role;
- which accounts, records, or server-side resources are reachable;
- whether the issue survives a restart, a logout, or a secret rotation.

If the chain reaches code execution, arbitrary file write that can be executed,
or full instance compromise, switch to the Critical / RCE template.

## Critical and RCE reports

Use this mode for remote code execution, command injection, unsafe
deserialization, template injection, arbitrary file write with execution, a full
authentication bypass, or mass exposure of health data.

Subject example:

```text
[Critical][RCE] worker: command injection in the import path — urgent
```

Add to the common skeleton:

- the execution context: which process, user, container, or Worker isolate;
- whether the attacker needs an account, an admin role, or no credentials;
- what the code can reach: `./data`, environment secrets, D1/R2, the host, the
  network, other users' records;
- a minimal, non-destructive proof (for example, the output of `id` in a
  disposable container), and how you cleaned it up;
- whether the issue is persistent or one-shot.

Do not run destructive commands, install persistence, move laterally, or touch
real user data. Stop at the first proof that the code executes. If the proof
requires a live instance, use a throwaway deployment that you own.

## Information-disclosure reports

Use this mode when data, secrets, tokens, keys, logs, source maps, internal
paths, or metadata are exposed. State the data class clearly:

- account and session metadata;
- dose, lab, weight, or other health records;
- encrypted backups or share payloads;
- avatars or other uploaded content;
- F2F cohort, escrow, or keyring material;
- operator secrets (`JWT_SECRET`, service tokens, admin credentials);
- server logs, stack traces, or build source maps.

Add to the common skeleton:

- who can access the data (anonymous, any account, one account, an admin);
- how long it stays exposed and whether it is cached, indexed, or copied;
- a redacted sample; never paste real health data or a live token;
- whether an encryption key is exposed. If it is, treat the report as Critical
  and say so in the subject.

A response that merely looks different is not enough. Show the data that should
not be there, or the boundary that can be crossed.

## Access-control reports

Use this mode for authentication and authorization problems: IDOR, missing
ownership checks, role escalation, session fixation, passkey or 2FA bypass,
share-link scope, and admin-route boundaries.

Add to the common skeleton:

- a role matrix: anonymous, user A, user B, administrator;
- the exact requests for each role, with two test accounts;
- whether the problem is on the web app, the Worker API, the raw `hrt://`
  transport, or the desktop wrapper;
- whether the response differs from the documented permission model.

## Privacy and metadata reports

Use this mode when the design reveals more than the documentation says, even if
no authorization boundary is crossed: unexpected retention, a third-party
request, a share link that leaks more than intended, or metadata that identifies
a user.

Explain what a person would learn, how it correlates with other data, and
whether the behaviour is inherent to the feature or a bug. Privacy reports are
welcome even when they are not security vulnerabilities in the strict sense.

## Dependency and supply-chain reports

Include the package or artifact, the advisory ID if there is one, the version
range, and the code path that makes it reachable in this app. A dependency
advisory that is present in the lockfile but unreachable may still be worth a
Low report; say so rather than presenting it as an exploitable High.

Do not publish a working exploit for a dependency issue before an advisory is
available. For a compromised build or release artifact, use the Critical / RCE
template and mention the release tag and checksum.

## Denial-of-service and resource-exhaustion reports

Denial of service, load testing, and brute force against a live instance are out
of scope. A logic flaw that lets one account exhaust a shared resource (for
example, unbounded rows, storage, or a queue) can still be reported as Low or
Medium with a local reproduction. Do not run a high-volume test against a public
instance.

## Evidence hygiene

- Use test accounts and synthetic data.
- Redact cookies, tokens, passwords, email addresses, and health values.
- Stop at the first proof; do not exfiltrate more data than the report needs.
- Do not modify or delete records you do not own.
- Keep the report in the private advisory. If you need to share a file, attach
  it there rather than linking to a public host.
- Tell the maintainers if you accidentally accessed real data, so they can
  assess the exposure.

## What happens next

The maintainers acknowledge the report, try to reproduce it, and decide whether
it is in scope and how severe it is. Confirmed problems are fixed with a
regression test, and a GitHub security advisory is published once users can
update. Credit is offered unless you ask to stay anonymous. See
[Security](Security) for the policy and [Security-Researchers](Security-Researchers)
for the local lab and the recent security history.

## Related pages

- [Security](Security) — operator hardening and the disclosure policy
- [Security-Researchers](Security-Researchers) — safe local lab and recent fixes
- [SECURITY.md](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/blob/main/SECURITY.md) — the canonical policy
