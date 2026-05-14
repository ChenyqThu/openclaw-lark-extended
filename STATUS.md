# Project status

Snapshot of the fork's current state. Updated when productionization phases
complete or new upstream baselines are absorbed.

Last updated: **2026-05-14** (after 0.2.2 baseline absorb of `@larksuite/openclaw-lark@2026.5.13` — Patch 4b retired)

## TL;DR

- Fork version: **0.2.2** (baseline absorb; Patch 4b retired — see CHANGELOG)
- Upstream baseline: **`@larksuite/openclaw-lark@2026.5.13`** (in sync with npm latest)
- Distribution: **internal team share** via private GitHub repo
  [`ChenyqThu/openclaw-lark-extended`](https://github.com/ChenyqThu/openclaw-lark-extended);
  npm publish not yet

## Branches

| Branch | Purpose |
|---|---|
| `main` | Public-ready productionized fork. No private deployment data. |
| `lucien/main` | Maintainer's deployment branch. `main` + private overlay (deploy/rollback/drift/upstream-watch scripts, `DEPLOY.md`, `MIGRATION.lucien.md`, private spinner phrase pools). |
| `upstream/main` | Force-rebaselined `npm pack @larksuite/openclaw-lark@<version>`. |

Tags:
- `v0.2.0` → 0.2.0 release marker on `main`
- `lucien-main-pre-productionization-v1` → safety anchor on `lucien/main`
  before productionization rebase

## Patches preserved on the fork

The fork carries these channel-level patches (see CHANGELOG for full
context). All are opt-in via existing config keys:

- **Patch 1** — non-OAuth card actions forward to the agent as a
  synthetic message (`src/channel/event-handlers.js`)
- **Patch 2** — per-group `replyInThread` (`src/messaging/inbound/dispatch-context.js`)
- **Patch 5** — `randomSpinnerPhrase(cfg)` reads from
  `channels.feishu.spinnerPhrases` (`src/card/builder.js`)
- **Patch 7** — `getTypingEmojiType(cfg)` reads from
  `channels.feishu.typingEmoji` with random pool support
  (`src/messaging/outbound/typing.js`)

Patch 4b (streaming card store path) was retired in 0.2.2 — upstream's
`resolveStorePath(path, { agentId })` overload supersedes the fork's
regex-based fixup. `agentId` is now threaded through `StreamingCardDeps`
via DI.

## Verification commands

```bash
# Static fork checks
bash scripts/smoke.sh                                       # syntax + patch markers + schema lint + npm test

# Runtime probe (against your local gateway)
curl -sS http://127.0.0.1:18789/                            # gateway health
openclaw gateway status                                     # service detail
```

## Open follow-ups (not blocking)

- **`replay-feishu-event.mjs` is still a Phase 0 stub** — parses the
  fixture but does not invoke `handleFeishuMessage`. Implementing real
  replay requires mocking the Lark SDK; a future phase.
- **`src/core/config-schema.d.ts` inline duplications** inside
  `FeishuConfigSchema`'s `accounts` record carry slightly stale types
  (TypeScript users importing the named `FeishuAccountConfigSchema` /
  `FeishuGroupSchema` exports get correct typing today). Regenerates on
  the next `tsdown` publish to `dist/`.
- **GitHub Actions / CI** — no CI is configured. `npm test` + `npm run
  smoke` work locally. Consider adding a workflow when the repo gets a
  remote.

## Recently completed

- 2026-05-14 — **0.2.2 baseline absorb of `@larksuite/openclaw-lark@2026.5.13`**.
  Net upstream delta: new `secret-contract-api.{js,d.ts}` (Plugin Secret
  Contract API, fork does not consume yet), `peerDependencies.openclaw`
  bump `>=2026.3.22` → `>=2026.5.4`, `agentId` threaded through
  `StreamingCardDeps`, `vc-meeting-invited-handler.js` synthetic prompt
  phrased more directively, minor `tsdown.config.js` tweak. **Patch 4b
  retired** — upstream's `resolveStorePath(path, { agentId })` overload
  replaces the fork's regex-based `/agents/main/` → `/agents/<id>/`
  rewrite; both call-sites now use the DI signature. `scripts/smoke.sh`
  narrowed from 5-patch checks to 4. Vitest 105/105 green.
- 2026-05-12 — **0.2.1 baseline absorb of `@larksuite/openclaw-lark@2026.5.12`**.
  Net upstream additions: outbound @mention normalization (new
  `normalize-mentions.{js,d.ts}` + `sentinel-store.{js,d.ts}` +
  `setWithKind` kind-annotated UserNameCache) and empty-msg guard +
  media 502/503/504 retry. Three conflict files resolved preserving all
  fork patches: dispatch-builders.js unified into single `[System: ...]`
  block with three section formatters; dispatch.js threads
  `{ wasMentioned, sentinels }` combined opts to body builders;
  user-name-cache.js retains safe-set + items.length transient-failure
  guard adapted to upstream `setWithKind` API. Vitest 105/105 green.
- 2026-05-07 — **0.2.0 name-resolver refactor + unified message tool**.
  Fixes the long-standing 张冠李戴 (mis-attribution) bug in group
  context injection. Vitest 94/94 green. See CHANGELOG.md for full
  release notes.
- 2026-05-07 — productionization phases 1–8 + `replyInThread: 'disabled'`
  schema hotfix (commits `fa118db…0b4b583` on `main`).
- 2026-05-07 — upstream `2026.4.10 → 2026.5.7` absorb merge.
