# Changelog

Release history for `@lucien/openclaw-lark-extended`. Tracks fork-side
versions; the upstream baseline at each release is noted in parentheses.

## 0.2.4 — baseline absorb of `@larksuite/openclaw-lark@2026.6.10`

Bot-at-bot release absorb with reconciliation. Upstream 2026.6.10 adds native
group bot-to-bot awareness that overlaps the fork's `feishu-social` extension
and Phase 4 sender-labeling. No fork patch retired; no dependency changes
(upstream bumped only its own version).

### Upstream 2026.6.10 in one line

Native "bot-at-bot" support: bots can address each other in Feishu groups
without the reply vanishing into a hidden topic view (#32980), without endless
ping-pong loops, and with deterministic `<at>` delivery.

### New upstream modules (adopted, no fork equivalent)

- `src/messaging/inbound/bot-content.js` — `resolveFeishuReplyRouting`
  (topic-thread inference + bot-peer suppression) and `resolveBotPeerForMention`.
- `src/messaging/inbound/bot-loop-guard.js` — consecutive bot-turn counter
  (cap 10, human turn resets, idle decay).
- `src/messaging/inbound/mention-registry.js` — ephemeral name→openId cache
  feeding outbound `@Name` resolution.
- `src/messaging/outbound/outbound-mention.js` — `normalizeOutboundMentions`
  (six LLM @-shapes → `<at>`) + `ensureMention` (deterministic peer-@ backstop).
- `src/messaging/outbound/bot-peer-context.js` — AsyncLocalStorage peer context.

### Other upstream changes (flow through unchanged)

- `handler.js`: self-echo hard filter; a "bare @" (mention, no text) is treated
  as a wake-up ping; feeds mention-registry; re-arms the bot-loop guard on human
  turns.
- `abort-detect.js`: `isConversationStopIntent` (substring zh/en stop phrases).
- `reply-mode.js`: markdown tables no longer force a card (cards break
  bot-at-bot @ delivery); the table-count guard is kept as a safety valve.
- `outbound.js` / `send.js`: apply the `ensureMention` peer backstop on both the
  text and card send paths, de-duped across chunks.
- `content-converter-helpers.js`: bot self-mention leading-strip.
- `vc-meeting-invited-handler.js`: `call_id` threaded into the auto-join prompt.

### Conflict resolution (4 files)

- **package.json** — kept fork name/version/description.
- **`src/core/config-schema.{js,d.ts}`** — kept the fork's wider
  `replyInThread` (`boolean | 'enabled' | 'disabled'`) plus the
  `spinnerPhrases`/`typingEmoji` account keys; adopted upstream's comments.
  Upstream independently added a boolean `replyInThread`; the fork's union is a
  superset.
- **`src/messaging/inbound/dispatch-builders.js`** — kept the fork's
  `(ctx, opts)` mention-annotation signature and the `[name](open_id):` group
  body prefix (Phase 4); adopted upstream's new exports
  `buildFeishuIdentityFields` and `buildFeishuGroupSystemPrompt`.

### Reconciliation decisions (合入并同步精简)

- **`replyInThread` harmonized.** `dispatch.js` now feeds the fork's
  `resolveReplyInThread()` (honours the `'enabled'`/`'disabled'` strings and
  per-group > `'*'` > account precedence) into upstream's
  `resolveFeishuReplyRouting`, whose bot-peer escape hatch only tests
  `=== true`. Without this an operator's `'enabled'` string would be ignored and
  bot→bot replies forced out of the thread. Patch 2 (force-into-thread in
  `dispatch-context.js`) stays as a distinct feature.
- **Mention note de-duplicated.** Upstream's new self-mention note ("you were
  directly @mentioned; the body is addressed to you") is dropped in favour of
  the fork's stronger imperative directive ("you MUST respond — do NOT output
  NO_REPLY"). The addressee's open_id is already injected via
  `buildFeishuGroupSystemPrompt` and the `BotOpenId` identity field, so the
  dropped note carried no unique signal.
- **Kept complementary (verified no harmful double-apply):** `feishu-social`
  storm-guard (tuned threshold + admin DM) coexists with upstream
  `bot-loop-guard` (dormant cap-10 backstop); `feishu-social` Hook 3
  `@alias`→`<at>` coexists with upstream `normalizeOutboundMentions` /
  `ensureMention` (both idempotent — no double-@); `feishu-social` group-history
  injection (`before_prompt_build`) coexists with `buildFeishuGroupSystemPrompt`.

### Further slimming (deferred, maintainer decision)

Retiring `feishu-social` storm-guard or the Hook 3 alias-rewrite in favour of
upstream's native equivalents would cut maintenance surface but lose the tuned
threshold + admin-DM alerting and the configured-alias rewriting. Left in
place; revisit as a separate focused pass if desired.

### Patches still on the fork

Patches 1, 2, 5, 7, plus Phase 4 (group sender prefix) and Phase 4-fix
(sender-name fallback). Smoke verifies the 4 patch grep markers; this release
does not alter the patch count.

### Dependency bumps

None. Upstream 2026.6.10 changed only its own package version.

### Verification

- `bash scripts/smoke.sh` → ✓ syntax + 4 patch markers + 6 schema keys +
  vitest 105/105.
- `node scripts/replay-feishu-event.mjs test/fixtures/feishu/*.json` → fixture
  parse clean.
- Targeted checks: `replyInThread` string/precedence mapping; single mention
  note (no upstream duplicate); outbound no double-@ on the bot-peer path.

---

## 0.2.3 — baseline absorb of `@larksuite/openclaw-lark@2026.5.20`

Upstream baseline absorb with one opportunistic alignment. No fork patch
retired; no behavior change in the common-case Schema-1 path.

### Patch 1 aligned with `resolveCardCallbackOperatorId`

`src/channel/event-handlers.js` previously read the card-callback operator
identity as `operator.open_id` directly. Upstream 2026.5.20 introduces a
shared helper in `src/core/card-action-operator.{js,d.ts}` that prefers
`open_id` and falls back to `user_id` for Schema-2 callbacks (users with
no `open_id` in the app tenant). The three upstream call sites
(`src/channel/interactive-dispatch.js`, `src/tools/ask-user-question.js`,
`src/tools/auto-auth.js`) all adopted the helper in this release.

Patch 1's synthetic-message path now uses the same helper:

```js
// before
const openId = operator.open_id;

// after (2026.5.20)
const openId = (0, card_action_operator_1.resolveCardCallbackOperatorId)(operator);
```

Net effect: Schema-1 card actions (the common case) are unchanged; Schema-2
card actions now forward `user_id` into the synthetic event instead of an
empty identifier. The `_action_name` resolution chain and the rest of
`handleCardActionEvent` are untouched.

### Other upstream additions (flow through unchanged)

- **NEW** `src/core/card-action-operator.{js,d.ts}` — pure helper described
  above.
- `src/card/reply-dispatcher.js`: streaming `onDeliver` path branches on
  `payload.isReasoning`. When true, deliver via
  `controller.onReasoningStream(...)`; otherwise `controller.onDeliver(...)`.
  No effect on the fork's Patch 4b retirement surface (`agentId` DI on
  `StreamingCardDeps`, which is several functions above this change).
- `src/core/lark-client.js`: `Lark.defaultHttpInstance.defaults.proxy =
  false` — disables axios auto-proxy because OpenClaw core now manages
  proxy routing centrally via `global-agent`. Operationally this means
  setting `HTTP_PROXY`/`HTTPS_PROXY` env vars no longer affects Feishu
  SDK requests; configure proxy via core if needed.
- `src/messaging/converters/video-chat.js`: drops emoji prefixes (📹/🕙)
  in favour of labelled lines (`Topic:`, `Start time:`, `Meeting number:`).
- `src/messaging/outbound/actions.js`: the outbound `send` tool gains a
  typebox schema with a description steering the LLM to **not** call
  `send` to repeat/finalize the same answer during streaming-card
  replies — let the active card complete instead. Pure prompt guidance;
  no API change.

### Dependency bumps

- `@larksuiteoapi/node-sdk`: `^1.60.0` → `^1.64.0` (lockfile resolves
  `1.65.0`)
- `@sinclair/typebox`: `0.34.48` → `0.34.49`

### Patches still on the fork

Patches 1, 2, 5, 7, plus Phase 4 (group sender prefix) and Phase 4-fix
(sender-name fallback). Smoke verifies the 4 patch grep markers; this
release does not alter the patch count.

### Verification

- `bash scripts/smoke.sh` → ✓ syntax + 4 patch markers + 6 schema keys +
  vitest 105/105.
- No new tests required (no behavior change beyond the Schema-2 helper
  call; the helper is exercised by upstream's existing call sites).

---

## 0.2.2 — baseline absorb of `@larksuite/openclaw-lark@2026.5.13`

Upstream baseline-only release. No fork-side features or fixes; the only
material change is that **Patch 4b is retired** because upstream now owns
the streaming-card store-path fix natively.

### Patch 4b retired (absorbed upstream)

The fork's regex-based fixup in
`src/card/streaming-card-controller.js` —

```js
// before (Patch 4b, fork)
let storePath = sessionApi.resolveStorePath(sessionStorePath);
const agentIdMatch = key.match(/^agent:([^:]+):/);
if (agentIdMatch && storePath.includes('/agents/main/')) {
    storePath = storePath.replace('/agents/main/', `/agents/${agentIdMatch[1]}/`);
}
```

— is replaced by upstream's `resolveStorePath(path, { agentId })` overload.
The fork now threads `agentId` through `StreamingCardDeps` from
`reply-dispatcher.js` and passes it via DI:

```js
// after (upstream native, 2026.5.13)
const storePath = sessionApi.resolveStorePath(sessionStorePath, { agentId: this.deps.agentId });
```

Both call-sites (agent session API + channel session fallback) now use the
same DI signature, so the fork-side `agentIdMatch` regex on the session key
is dead code. `scripts/smoke.sh` no longer checks `Patch 4b` markers;
`DEPLOY.md` upgrade-runbook narrows the conflict hot-zones from 5 patches
to 4.

### Other upstream additions (flow through unchanged)

- New top-level `secret-contract-api.{js,d.ts}` files — Plugin Secret
  Contract API (publish-time interface; fork does not consume it yet)
- `package.json` `peerDependencies.openclaw` bump: `>=2026.3.22` → `>=2026.5.4`
- `src/card/reply-dispatcher.js` + `.d.ts`: `agentId` field added to
  `StreamingCardDeps` (DI for the absorbed Patch 4b)
- `src/messaging/inbound/vc-meeting-invited-handler.js`: synthetic prompt
  tightened — `Join the meeting with meeting number ${n}.` →
  `Use the available tool to join the meeting with meeting number ${n} immediately. Do not ask for confirmation.`
- `tsdown.config.js`: minor upstream tweak

### Patches still on the fork

Patches 1, 2, 5, 7 remain in place. Smoke verification updated to match
the new 4-patch hot-zone count.

---

## 0.2.0 — name-resolver refactor + unified message tool (upstream baseline `@larksuite/openclaw-lark@2026.5.7`)

Substantial release. Resolves the long-standing 张冠李戴 (mis-attribution)
issue in group-chat summaries: human senders without `@-mention` events used
to fall back to `用户(${id.slice(-8)})` in the group-context block injected
into the system prompt, leading the agent to guess attributions when paraphrasing.

### 🔴 Core fix — group context block now resolves real names (Phase 2)

`src/extensions/feishu-social/context.js` + `index.js` + new `uat-fetch.js`:

- Hook 1 (`message_received`) now stashes `{accountId, ts}` per chatId in
  `SHARED.lastChatContext` (5 min TTL). Hook 2 (`before_prompt_build`) reads
  this to obtain a UAT ticket for the group's account, since the host's
  `PluginHookAgentContext` carries no accountId.
- New ~80 LOC `uat-fetch.js` does raw `fetch` to
  `/contact/v3/users/basic_batch` using the bot owner's stored UAT token
  (looked up via `core/token-store.getStoredToken(appId, ownerOpenId)`).
  Bypasses `ToolClient` (whose `legacy-plugin guard` and
  `assertOwnerAccessStrict` are too eager for a hot-loop hook).
- `formatMessageTimeline` cascade for human senders now goes:
  `sender.name` → mention prefill → `memberCache` → shared user-name cache
  → `用户(last8)` final fallback.
- `ContextCache.computeOnce(chatId, fn)` adds inflight single-flight so two
  concurrent hooks for the same chat don't double-fire UAT (mirrors the
  existing `tokenInflight` pattern).
- 3-second wall-clock budget (`Promise.race`) on the enrich pre-pass keeps
  the hook well under the host's 15-second timeout. Permission-error log
  is throttled to once per 30 min per accountId.

### Name-resolver as a shared library (Phase 0)

New `src/tools/oapi/im/name-resolver.js`. Public API:

- `resolveUserName(accountId, openId)` — sync read from the shared cache
- `setUserName(accountId, openId, name)` / `peekUserName(...)` — safe-set + raw read
- `prefillUserNamesFromMentions(accountId, items)` — free name harvest from event mentions
- `batchResolveUserNames({client, accountId, openIds, log})` — UAT
  `contact/v3/users/basic_batch` (chunks of 10), writes via safe-set
- `resolveChatName(accountId, chatId)` / `batchResolveChatNames({...})` — new
  account-scoped chat-name cache (TTL 60 min, size 200) with automatic
  warm-up of p2p target user names
- `enrichSendersInPlace({messages, accountId, batchResolve, registry,
  memberCache, log})` — DI-friendly cascade helper used by the extension's
  enrich pre-pass; testable without SDK mocking
- `clearUserNameCacheAll()` / `clearChatNameCache()` — test isolation

The previous private LRU in `src/tools/oapi/im/user-name-uat.js` was collapsed
into the shared cache at `src/messaging/inbound/user-name-cache-store.js#getUserNameCache(accountId)`
so inbound TAT mention prefill and tool-layer UAT batch resolution write
into the same place. `user-name-uat.js` becomes a thin re-export shim
(`getUATUserName` / `setUATUserNames` / `batchResolveUserNamesAsUser`
preserved for any caller still importing by name).

### Unified `message` tool — read action dispatcher (Phase 3)

`src/tools/oapi/im/message.js` Type.Union extends from `send`/`reply` to 7+
actions. Read actions delegate to existing implementations via extracted
`executeXxx(params, ctx)` callables in `message-read.js` and `chat/members.js`.
The standalone tools (`feishu_im_user_get_messages`,
`_get_thread_messages`, `_search_messages`, `feishu_chat_members`) stay
registered for back-compat but their descriptions now lead with
`[DEPRECATED — prefer message tool action=...]` so an LLM seeing both gravitates
to the unified entry.

Schema source-of-truth lives in new `src/tools/oapi/im/message-schema.js`,
a leaf module (only depends on `@sinclair/typebox`) so vitest tests can
validate without loading message.js's heavier CJS dependency chain.

### Four orthogonal read primitives (Phase 4)

The set is now: `list`, `get`, `search`, `thread`, `members`, plus four new:

- `message action=mget` — batch get message details via
  `/im/v1/messages/mget`. Returns enrichment-applied list.
- `message action=reactions` — read reactions list via
  `/im/v1/messages/:id/reactions` (note: NO `/list` suffix on this endpoint).
  Reactor open_ids are batch-resolved through the shared name-resolver so
  `operator.operator_name` comes back populated.
- `message action=resolve_url` — pure-regex IM URL → ids parser (lives in
  new `src/tools/oapi/im/url-parser.js` as a leaf module). IM-only;
  cloud-doc URLs return `{resolved:false, reason:"not_im_url"}` and let the
  agent route to a drive tool. Encrypted-token applink URLs intentionally
  out of scope (would need an async unwrap call).
- `chat action=resolve_p2p` — batch open_id → P2P chat_id reverse lookup via
  `/im/v1/chat_p2p/batch_query`. Promotes a private helper that previously
  lived in `message-read.resolveP2PChatId`.

The ruled-out compound tools (group summary, mention queries, around-context,
activity stats) remain agent responsibility — schemas don't lock in any one
usage shape.

### Sentinel cache semantics (post-deploy hotfix series, all merged in 0.2.0)

Multiple iterations during the 2026-05-07 verification round refined how
empty-name responses interact with the shared cache. Final state:

- TAT inbound batch (`src/messaging/inbound/user-name-cache.js`) writes via
  the new safe-set rule — never overwrites a real cached name with the `''`
  sentinel; only sentinels truly missing IDs (and only when the response
  itself was non-empty). TAT users/batch frequently returns entries with
  empty name fields, so this prevents systematic poisoning of the shared
  cache.
- UAT batch (`name-resolver.js#batchResolveUserNames`) dedup checks
  `cache.get()` truthy instead of `cache.has()`. Sentinels are treated as
  miss, so UAT retries them. Once UAT resolves the real name,
  `setUserNameSafe` overwrites the sentinel.
- Reactions endpoint path corrected: `/reactions/list` → `/reactions`
  (was 404'ing because the GET endpoint has no `/list` suffix; POST same
  path = create, DELETE `/reactions/:reaction_id` = delete).
- `client.invoke + sdk.request` is the canonical pattern for new endpoints
  (mirrors `user-name-uat.js`). The earlier `invokeByPath` path tripped a
  JSON-parse error on Feishu's HTML 404 page; switching unblocks both
  reactions and `chat resolve_p2p`.
- `chat resolve_p2p` response handling: tries multiple plausible field
  names (`chatter_id` / `open_id` / `user_id` / `id`) and falls back to
  positional alignment with the request order.

### Tests

94 vitest cases (37 prior + 57 new across Phase 0/2/3/4 + sentinel hotfix).
All pass. Smoke (`bash scripts/smoke.sh`) green; `pnpm test` green.

### Live cutover record (2026-05-07)

- Initial cutover at `bash scripts/deploy.sh` from `lucien/main` rev
  `80fc4b7` (Phase 0–4 stack). Backup
  `~/.openclaw/openclaw-lark.bak-20260507T172150`.
- Five hotfix iterations followed (0768885 / 0677e98 / 18eb3d8 / eb5446e /
  f3f9b45) over ~90 minutes, refining the reactions / resolve_p2p / cache
  sentinel paths against live verification feedback.
- Final cutover backup `~/.openclaw/openclaw-lark.bak-20260507T190634`.
  Gateway pid alive on `127.0.0.1:18789`. drift-check ✓ no drift.
- Verification — Jarvis confirmed: B1 (timeline real names ≥95%) PASS,
  B2 (5/5 attribution accuracy) PASS, all 7 dispatcher actions PASS
  including reactions `operator_name` populated.

## 0.1.1 — schema permissiveness hotfix (upstream baseline `@larksuite/openclaw-lark@2026.5.7`)

Hotfix during the first live cutover (2026-05-07). The 0.1.0 schema declared
`replyInThread` as `boolean | 'enabled'`, but real-world configs already use
`'disabled'` to mean "explicitly off" (semantically the same as `false` to the
runtime, which only checks `=== true || === 'enabled'`). Strict schema
validation aborted gateway start.

- `openclaw.plugin.json`: `replyInThread` enum extended to `['enabled', 'disabled']`
  in both account and per-group schema.
- `src/core/config-schema.js` zod: `ReplyInThreadSchema` becomes
  `boolean | 'enabled' | 'disabled'`.
- `src/core/config-schema.d.ts`: matching union update on the named exports.
- `CONFIGURATION.md`: `replyInThread` row updated to list both string values.

Runtime behavior unchanged — the `resolveReplyInThread` helper still treats
anything other than `true` / `'enabled'` as falsy (do not force thread).

### Live cutover record (2026-05-07)

- 13:29 PDT — first `bash scripts/deploy.sh` from `lucien/main` (post-rebase
  onto productionized `main`). Atomic swap succeeded; gateway restart aborted
  on `replyInThread: 'disabled'` schema validation.
- 13:31 PDT — schema hotfix above committed (`9770e72` on lucien/main /
  `6cfe5d1` on main); second `deploy.sh` succeeded. Gateway pid 4410 active,
  HTTP 200 on `127.0.0.1:18789`.
- 13:54 / 13:55 PDT canary — DM streaming + group context injection (20 msgs
  fetched, member-cache prefetch 10 members, registry loaded 8 bots, sender
  identity correct including `@小K`-style alias resolution and explicit
  open_id surfacing) all confirmed.
- Backups: `~/.openclaw/openclaw-lark.bak-20260507T133125` (live tree),
  `~/.openclaw/openclaw.json.bak-prod-cutover-20260507T132834` (config).

## 0.1.0 — initial release (upstream baseline `@larksuite/openclaw-lark@2026.5.7`)

First release of the fork as a standalone package. All changes below are
deltas relative to upstream `2026.5.7`.

### Channel config schema completion

- `openclaw.plugin.json` `channelConfigs.feishu.schema` was previously
  empty `{ "type": "object" }`. Now declares:
  - `spinnerPhrases` (array of strings)
  - `typingEmoji` (string, single or comma-separated pool)
  - `replyInThread` (`boolean | 'enabled'`)
  - `allowBots` (`boolean | 'mentions'`) — surfaces upstream's runtime key
  - `threadSession` (boolean) — surfaces upstream's runtime key
  - `groups[<chatId>]` (object) — per-group overrides for `replyInThread`,
    `allowBots`, plus the existing zod-side group fields
- `src/core/config-schema.js` (zod) gains `spinnerPhrases`, `typingEmoji`,
  and `replyInThread` (account + group level).

### Optional `feishu-social` extension

In-tree at `src/extensions/feishu-social/`. **Disabled by default.**
Activate via `plugins.entries["openclaw-lark"].config.social.enabled: true`.

When enabled, registers three hooks (`message_received`,
`before_prompt_build`, `message_sending`) that provide:

- Group-context injection into the agent's system prompt with a
  parameterized template (`social.contextTemplate` + `social.adminDisplayName`)
- Sender-name registry consulted as a last-resort name resolver from
  `enrich.js` (chains after upstream user/bot OAPI)
- Storm-guard: bot-inbound debounce + outbound circuit breaker to protect
  against multi-bot reply loops; window sizes are configurable
  (`stormWindowMs`, `circuitWindowMs`)
- `@<alias>` → `<at user_id="…">…</at>` rewriting using the user's
  `wiki-bots.json` registry

Public surface from `index.js`:

- `module.exports = plugin` (default export)
- `registerFeishuSocial(api)` (named export consumed by openclaw-lark glue)
- `lookupMemberName(openId)` (consumed by `enrich.js`)

### Other fork-only patches preserved from prior maintenance

These were already on the fork before productionization and remain on
`main`. Each is opt-in via existing config keys:

- **Patch 1** — non-OAuth card actions forward to the agent as a
  synthetic message (`src/channel/event-handlers.js`)
- **Patch 2** — per-group `replyInThread` (`src/messaging/inbound/dispatch-context.js`)
- **Patch 4b** — streaming card store path corrected from
  `/agents/main/` to `/agents/<id>/` based on session key
  (`src/card/streaming-card-controller.js`)
- **Patch 5** — `randomSpinnerPhrase(cfg)` reads from
  `channels.feishu.spinnerPhrases` (`src/card/builder.js`)
- **Patch 7** — `getTypingEmojiType(cfg)` reads from
  `channels.feishu.typingEmoji` with random pool support
  (`src/messaging/outbound/typing.js`)
- **Phase 4** — group sender prefix `[name](open_id)` for multi-sender
  disambiguation (`src/messaging/inbound/dispatch-builders.js`)
- **Phase 4-fix** — sender-name fallback chains through `feishu-social`
  registry when both upstream OAPI paths return empty
  (`src/messaging/inbound/enrich.js`)

### Renamed and removed

- npm package: `@larksuite/openclaw-lark` → `@lucien/openclaw-lark-extended`
- Extension `plugin.id`: `'feishu-bot-social'` → `'feishu-social'`
- Examples renamed:
  `spinner-phrases-jarvis.example.json` → `spinner-phrases-default.example.json`
  (neutral English) + `spinner-phrases-playful-zh.example.json` (generic
  playful Chinese, no agent name)
- Removed: `examples/spinner-phrases-lyra.example.json` (private persona
  variant retained on the maintainer's `lucien/main` branch only)
- All `Jarvis` / `Lucien` / `Lyra` / `小K` references stripped from
  source code, comments, log lines, and the runtime context template.

### Upstream baseline note

The fork tracks upstream by force-rebaselining `upstream/main` from each
new npm release. As of this 0.1.0, upstream/main = `2026.5.7`, which itself
introduces:

- Self-echo filter (`event-handlers.js`)
- `senderIsBot` field on parsed events (`parse.js`, `types.d.ts`)
- `resolveBotName` against `/open-apis/bot/v3/bots/basic_batch` (`user-name-cache.js`)
- `allowBots` admission policy with default `'mentions'` (`gate.js`,
  `config-schema.js`)
- New plugin manifest `contracts.tools` array

These flow through unchanged.
