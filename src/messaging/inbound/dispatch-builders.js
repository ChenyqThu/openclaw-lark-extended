"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Pure construction functions for the agent dispatch pipeline.
 *
 * All functions in this module are side-effect-free: they build data
 * structures (message bodies, envelope payloads, inbound context) but
 * never perform I/O, send messages, or mutate external state.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildMentionAnnotation = buildMentionAnnotation;
exports.buildMessageBody = buildMessageBody;
exports.buildBodyForAgent = buildBodyForAgent;
exports.buildInboundPayload = buildInboundPayload;
exports.buildEnvelopeWithHistory = buildEnvelopeWithHistory;
const reply_history_1 = require("openclaw/plugin-sdk/reply-history");
const chat_queue_1 = require("../../channel/chat-queue.js");
const mention_1 = require("./mention.js");
// ---------------------------------------------------------------------------
// Mention annotation
// ---------------------------------------------------------------------------
const MENTION_USAGE_HINT = 'To @mention in a reply, use `<at user_id="ou_xxx">Name</at>`; plain "@Name" won\'t notify.';
/**
 * Build a `[System: ...]` mention annotation for the message.
 *
 * Up to three independent sections may be emitted, joined into one
 * bracketed system note:
 *
 *   1. List of non-bot @-mentioned users (with open_ids), so the LLM
 *      knows who was @-tagged and how to @-tag them back.
 *   2. Sentinel feedback from upstream PR #486 — when the previous
 *      outbound reply had unresolved `@Name` mentions (not_found /
 *      ambiguous), surface that hint so the next reply can disambiguate.
 *   3. wasMentioned directive (fork) — when `opts.wasMentioned` is true,
 *      emit "you MUST respond" so the LLM doesn't pick NO_REPLY after
 *      `stripBotMentions` removed the bot's own @tag and `nonBotMentions`
 *      filtered it out of section 1 (especially in multi-bot groups).
 *
 * `wasMentioned` is the same boolean that flows into the SDK's
 * `WasMentioned` field — computed once in dispatch.js so the @all branch
 * (and any future broadening of the rule) applies here automatically.
 *
 * Returns `undefined` when no section is needed. Sender identity / chat
 * metadata are handled by the SDK's own `buildInboundUserContextPrefix`
 * and are not duplicated here.
 */
function buildMentionAnnotation(ctx, opts) {
    const wasMentioned = opts?.wasMentioned === true;
    // Include the self bot in the recipient roster when wasMentioned=true.
    // Without this, multi-bot @ messages (e.g. "@Self @OtherBot") look like
    // "@OtherBot" after stripBotMentions, and `formatMentionList` filtered
    // self out of the visible list — leaving no body or annotation signal
    // that THIS bot was also addressed. Adding `<name> [you, open_id: ...]`
    // to the roster restores that signal without touching the body (so
    // chat-history echo loop risk stays zero — history is built from the
    // already-stripped ctx.content).
    const selfMention = wasMentioned ? ctx.mentions.find((m) => m.isBot) : undefined;
    const sections = [
        formatMentionList((0, mention_1.nonBotMentions)(ctx), selfMention),
        formatSentinelFeedback(opts?.sentinels),
        formatWasMentionedDirective(wasMentioned),
    ].filter((s) => !!s);
    if (sections.length === 0)
        return undefined;
    sections.push(MENTION_USAGE_HINT);
    return `[System: ${sections.join(' ')}]`;
}
function formatMentionList(mentions, selfMention) {
    if (mentions.length === 0 && !selfMention)
        return undefined;
    const entries = [];
    if (selfMention) {
        const selfName = selfMention.name || 'me';
        entries.push(`${selfName} [you, open_id: ${selfMention.openId}]`);
    }
    for (const t of mentions) {
        entries.push(`${t.name} (open_id: ${t.openId})`);
    }
    return (`This message @mentions the following users: ${entries.join(', ')}. ` +
        `Use these open_ids when performing actions involving these users.`);
}
function formatSentinelFeedback(sentinels) {
    if (!sentinels || sentinels.length === 0)
        return undefined;
    const lines = sentinels.map((s) => {
        if (s.reason === 'not_found') {
            return `"@${s.name}" was not recognized in the chat`;
        }
        if (s.reason === 'ambiguous' && s.candidates && s.candidates.length > 0) {
            const ids = s.candidates.map((c) => c.openId).join(' / ');
            return `"@${s.name}" matched multiple users (${ids}); use explicit <at user_id="...">`;
        }
        return `"@${s.name}" failed to resolve`;
    });
    return `Previous reply had unresolved mentions: ${lines.join('; ')}.`;
}
function formatWasMentionedDirective(wasMentioned) {
    if (wasMentioned !== true)
        return undefined;
    return `You were explicitly @-mentioned in this message. You MUST respond — do NOT output NO_REPLY.`;
}
// ---------------------------------------------------------------------------
// Message body builders
// ---------------------------------------------------------------------------
/**
 * Pure function: build the annotated message body with optional quote,
 * speaker prefix, and mention annotation (for the envelope Body).
 *
 * Note: message_id and reply_to are now conveyed via system-event tags
 * (msg:om_xxx, reply_to:om_yyy) instead of inline annotations, keeping
 * the body cleaner and avoiding misleading heuristics for non-text
 * message types (merge_forward, interactive cards, etc.).
 */
function buildMessageBody(ctx, quotedContent, opts) {
    let messageBody = ctx.content;
    if (quotedContent) {
        messageBody = `[Replying to: "${quotedContent}"]\n\n${ctx.content}`;
    }
    const speaker = ctx.senderName ?? ctx.senderId;
    // Group turns get a stable [name](open_id) prefix so the agent can disambiguate
    // multi-sender conversations; DM keeps the cleaner "name: msg" form
    // (fork plan §4 #5, sender-labeling site B).
    if (ctx.chatType === 'group' && ctx.senderId) {
        messageBody = `[${speaker}](${ctx.senderId}): ${messageBody}`;
    } else {
        messageBody = `${speaker}: ${messageBody}`;
    }
    const mentionAnnotation = buildMentionAnnotation(ctx, opts);
    if (mentionAnnotation) {
        messageBody += `\n\n${mentionAnnotation}`;
    }
    return messageBody;
}
/**
 * Build the BodyForAgent value: the clean message content plus an
 * optional mention annotation.
 *
 * SDK >= 2026.2.10 changed the BodyForAgent fallback chain from
 * `BodyForAgent ?? Body` to `BodyForAgent ?? CommandBody ?? RawBody ?? Body`,
 * so annotations embedded only in Body never reach the AI.  Setting
 * BodyForAgent explicitly ensures the mention annotation survives.
 *
 * Sender identity, reply context, and chat history are NOT duplicated
 * here — they are injected by the SDK's `buildInboundUserContextPrefix`
 * via the standard fields (SenderId, SenderName, ReplyToBody,
 * InboundHistory) that we pass in buildInboundPayload.
 *
 * Note: media file paths are substituted into `ctx.content` upstream
 * (handler.ts -> substituteMediaPaths) before this function is called.
 * The SDK's `detectAndLoadPromptImages` will discover image paths from
 * the text and inject them as multimodal content blocks.
 */
function buildBodyForAgent(ctx, opts) {
    const mentionAnnotation = buildMentionAnnotation(ctx, opts);
    if (mentionAnnotation) {
        return `${ctx.content}\n\n${mentionAnnotation}`;
    }
    return ctx.content;
}
// ---------------------------------------------------------------------------
// Inbound payload builder
// ---------------------------------------------------------------------------
/**
 * Unified call to `finalizeInboundContext`, eliminating the duplicated
 * field-mapping between permission notification and main message paths.
 */
function buildInboundPayload(dc, opts) {
    return dc.core.channel.reply.finalizeInboundContext({
        // extraFields first — fixed fields below always take precedence
        ...opts.extraFields,
        Body: opts.body,
        BodyForAgent: opts.bodyForAgent,
        RawBody: opts.rawBody,
        CommandBody: opts.commandBody,
        From: dc.feishuFrom,
        To: dc.feishuTo,
        SessionKey: dc.threadSessionKey ?? dc.route.sessionKey,
        AccountId: dc.route.accountId,
        ChatType: dc.isGroup ? 'group' : 'direct',
        GroupSubject: dc.isGroup ? dc.ctx.chatId : undefined,
        SenderName: opts.senderName,
        SenderId: opts.senderId,
        Provider: 'feishu',
        Surface: 'feishu',
        MessageSid: opts.messageSid,
        ReplyToBody: opts.replyToBody,
        InboundHistory: opts.inboundHistory,
        Timestamp: dc.ctx.createTime ?? Date.now(),
        WasMentioned: opts.wasMentioned,
        CommandAuthorized: dc.commandAuthorized,
        OriginatingChannel: 'feishu',
        OriginatingTo: opts.originatingTo ?? dc.feishuTo,
    });
}
// ---------------------------------------------------------------------------
// Envelope + history builder
// ---------------------------------------------------------------------------
/**
 * Format the agent envelope and prepend group chat history if applicable.
 * Returns the combined body and the history key (undefined for DMs).
 */
function buildEnvelopeWithHistory(dc, messageBody, chatHistories, historyLimit) {
    const body = dc.core.channel.reply.formatAgentEnvelope({
        channel: 'Feishu',
        from: dc.envelopeFrom,
        timestamp: new Date(),
        envelope: dc.envelopeOptions,
        body: messageBody,
    });
    let combinedBody = body;
    const historyKey = dc.isGroup ? (0, chat_queue_1.threadScopedKey)(dc.ctx.chatId, dc.isThread ? dc.ctx.threadId : undefined) : undefined;
    if (dc.isGroup && historyKey && chatHistories) {
        combinedBody = (0, reply_history_1.buildPendingHistoryContextFromMap)({
            historyMap: chatHistories,
            historyKey,
            limit: historyLimit,
            currentMessage: combinedBody,
            formatEntry: (entry) => dc.core.channel.reply.formatAgentEnvelope({
                channel: 'Feishu',
                from: `${dc.ctx.chatId}:${entry.sender}`,
                timestamp: entry.timestamp,
                body: entry.body,
                envelope: dc.envelopeOptions,
            }),
        });
    }
    return { combinedBody, historyKey };
}
