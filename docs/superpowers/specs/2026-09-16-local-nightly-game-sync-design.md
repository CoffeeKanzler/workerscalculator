# Local Nightly Game Sync Design

## Goal

Run a local, unattended audit every night that updates the installed *Workers &
Resources: Soviet Republic* game files, lets Codex reconcile relevant official
data with this repository, independently reviews the result, and pushes a
validated change to `origin/main` only after an explicit machine-readable `GO`.

The job runs as Linux user `nexx`. SteamCMD authenticates as `pexhenno` from a
locally cached session. No password, Steam Guard code, GitHub token, savegame,
or raw game file may enter the repository or the job logs.

## Schedule and execution environment

- A systemd user timer starts daily at 03:17 Europe/Berlin time.
- `RandomizedDelaySec=20m` avoids predictable overlap with other scheduled
  tasks, and `Persistent=true` catches up once after a missed run.
- A non-blocking file lock prevents overlapping runs.
- The service declares an explicit `PATH`, including the installed SteamCMD,
  Codex CLI, Node, Python, Git, and GitHub CLI locations. It does not depend on
  an interactive shell profile.
- Runtime state and reports live below
  `~/.local/state/workers-game-sync/` with user-only permissions.
- The checked-out `/home/nexx/workers` tree is never used as the agent's edit
  surface. Each run creates a temporary Git worktree from the fetched
  `origin/main` and removes it on exit.

## One-time bootstrap

An installer places and enables the user service and timer. Before enabling
the timer it performs an interactive SteamCMD login:

```text
/home/nexx/steamcmd/steamcmd.sh +login pexhenno +quit
```

The user enters the password and any Steam Guard challenge directly into
SteamCMD. The automation stores neither. The installer then performs a dry
run through Steam update, temporary worktree creation, Codex authentication,
and report generation without allowing a commit or push.

If the cached Steam session later expires, the nightly job stops before agent
execution and reports that interactive reauthentication is required.

## Run pipeline

### 1. Acquire and establish a stable base

The orchestrator acquires its lock, fetches `origin`, records the current
`origin/main` SHA, and creates a temporary worktree at exactly that commit.
Dirty or untracked files in `/home/nexx/workers` therefore cannot be staged,
deleted, or published.

### 2. Update the local game installation

SteamCMD runs `app_update 784150` with the cached `pexhenno` session and
`/home/nexx/soviet-game` as the installation directory. The orchestrator
records the installed build ID before and after the command, while filtering
authentication-related output from the durable report.

A failed update, interactive prompt, missing manifest, or unavailable
`media_soviet` directory ends the run as `BLOCKED` without starting Codex.

### 3. Builder agent

The first non-interactive `codex exec` process runs in the temporary worktree
with the workspace-write sandbox and automatic approval review. It receives a
repository-owned prompt that requires it to:

- read repository instructions and use the updated local game installation as
  the authority;
- run the established extractors and inspect diffs rather than blindly accept
  generated output;
- audit new official buildings, vehicles, research, names, construction
  resources, and newly relevant save/map sources;
- preserve unavailable values as unavailable and avoid invented zeroes;
- add focused regression coverage for any behavior change;
- update every required browser cache marker;
- run appropriate focused, full Node, release, and browser verification;
- never commit, push, alter credentials, or touch private save evidence.

Its last response must conform to a checked-in JSON schema. Allowed outcomes
are `NO_CHANGES`, `READY_FOR_REVIEW`, or `BLOCKED`, accompanied by the game
build, changed paths, tests actually run, unresolved concerns, and a proposed
commit subject. Free-form text cannot authorize publication.

### 4. Deterministic pre-review gates

The orchestrator rejects the candidate before review when any of these hold:

- the builder reports `BLOCKED` or its JSON is invalid;
- a changed path is outside the public application boundary (`data/`, `js/`,
  `css/`, `tests/`, `tools/`, `scripts/`, `index.html`, or package metadata);
- a path under `private/`, a credential-like file, a raw game asset, a save
  file, or a systemd installation path appears in the diff;
- Git reports an unmerged path, submodule change, or invalid patch;
- cache-marker validation fails;
- the normal `npm test` suite fails;
- the candidate contains unexpected dataset identity loss or non-finite
  generated numeric values.

Large diffs are not silently accepted. Crossing a configurable file/line
threshold adds a mandatory high-risk flag to the reviewer input; it never
weakens the other gates.

### 5. Independent reviewer agent

A second ephemeral `codex exec` process runs read-only against the candidate.
It receives the original base SHA, game build transition, complete diff,
builder report, deterministic gate results, and repository instructions. It
must specifically examine:

- whether changes are justified by current game files;
- mass deletion, zeroing, category drift, provenance errors, and guessed data;
- test quality and browser/runtime coverage;
- cache and offline/privacy contracts;
- whether the proposed commit is narrow enough for unattended publication.

Its JSON-schema-constrained verdict is exactly `GO` or `NO_GO`, with findings.
Only `GO` may advance. The builder cannot review its own work, and a malformed
or missing review is `NO_GO`.

### 6. Moving-main integration and publish gate

After `GO`, the orchestrator fetches `origin` again. When `origin/main` still
equals the SHA from which the temporary worktree was created, it proceeds to
publication.

When `origin/main` moved meanwhile (including the scheduled Workshop catalogue
workflow), the reviewed result is not rebased and conflicts are not resolved
automatically. Instead, the candidate worktree is discarded and the complete
builder, deterministic-gate, and independent-review sequence restarts in a new
worktree based on the new `origin/main`. The already updated game installation
is reused. This makes the new GitHub Actions output part of the builder's input
and ensures the eventual `GO` applies to the exact tree that will be pushed.

At most three base attempts are allowed per nightly run. If `origin/main`
continues moving after the third reviewed candidate, the run reports
`MOVING_BASE` and performs no push. The next scheduled run starts normally.

For a candidate whose base is still current, the orchestrator:

1. stages only already validated tracked/new public files;
2. verifies the staged diff and reruns the cache check;
3. creates one commit using the reviewed subject plus game build metadata;
4. pushes `HEAD:main` without force.

Immediately before the push it performs one final fetch-and-SHA comparison. A
last-second move reports `STALE_AT_PUSH` without force-pushing; this narrow race
is left for the next night rather than publishing an unreviewed integration.

## Reports and recovery

Every run writes a compact JSON summary and a human-readable log containing:

- start/end time and duration;
- base SHA and game build before/after;
- Steam update result;
- builder outcome and tests;
- deterministic gate results;
- reviewer verdict and findings;
- commit SHA and push result, when applicable.

Reports redact authentication-related lines and never embed full diffs or
private paths. systemd/journald keeps operational output; the state directory
retains the latest 30 summaries. Failure is fail-closed: no stage after a
failure may commit or push. Temporary worktrees are removed by an exit trap;
an interrupted cleanup is repaired safely on the next run.

## Repository components

The implementation will add:

- one orchestration script with explicit subcommands for dry-run and live run;
- repository-owned builder and reviewer prompts;
- JSON schemas for both agent responses;
- systemd user service and timer templates;
- an installer/status helper that performs bootstrap checks without handling
  secrets;
- unit tests for verdict parsing, path policy, remote-SHA gating, no-change,
  blocked, and successful publication flows;
- documentation for manual execution, Steam reauthentication, logs, disabling
  the timer, and recovery after a blocked run.

External commands are injected or wrapped in tests so no test updates Steam,
starts a real agent, creates a real commit, or pushes.

## Acceptance criteria

- The enabled user timer shows the next 03:17 local run and survives logout or
  reboot according to the user's systemd user-session policy.
- A dry run updates/checks Steam and exercises both agent contracts but cannot
  commit or push.
- A no-change run exits successfully without a commit.
- Steam/auth, builder, test, cache, reviewer, moving-base, stale-at-push, and
  push failures all produce distinct fail-closed reports.
- Only a schema-valid reviewer `GO`, green deterministic gates, and unchanged
  `origin/main` can result in one non-force push.
- A moving `origin/main` restarts the complete candidate and review flow from
  the new base up to three times; it never triggers automatic conflict
  resolution or force-push.
- The ordinary repository worktree and all unrelated user files remain
  untouched.
