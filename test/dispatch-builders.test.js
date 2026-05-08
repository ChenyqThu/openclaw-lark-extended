// Pure-function tests for the mention annotation builders.
//
// Direct import of dispatch-builders is fine: its only side-effecting
// transitive dep is openclaw/plugin-sdk/reply-history, which is a leaf
// utility that does not invoke import.meta.url at module load time.
import { describe, it, expect } from 'vitest';
import {
  buildMentionAnnotation,
  buildMessageBody,
  buildBodyForAgent,
} from '../src/messaging/inbound/dispatch-builders.js';

const baseCtx = {
  chatId: 'oc_chat',
  messageId: 'om_msg',
  senderId: 'ou_alice',
  senderName: 'Alice',
  chatType: 'group',
  content: 'hi everyone',
  contentType: 'text',
  resources: [],
  mentions: [],
  mentionAll: false,
};

const userMention = (openId, name) => ({
  key: `@_user_${openId}`,
  openId,
  name,
  isBot: false,
});

const botMention = (openId, name) => ({
  key: `@_user_${openId}`,
  openId,
  name,
  isBot: true,
});

describe('buildMentionAnnotation', () => {
  it('returns undefined when there are no mentions and the bot was not addressed', () => {
    expect(buildMentionAnnotation(baseCtx)).toBeUndefined();
    expect(buildMentionAnnotation(baseCtx, {})).toBeUndefined();
    expect(buildMentionAnnotation(baseCtx, { wasMentioned: false })).toBeUndefined();
  });

  it('lists non-bot mentions with their open_ids', () => {
    const ctx = { ...baseCtx, mentions: [userMention('ou_bob', 'Bob'), userMention('ou_carol', 'Carol')] };
    const out = buildMentionAnnotation(ctx);
    expect(out).toContain('Bob (open_id: ou_bob)');
    expect(out).toContain('Carol (open_id: ou_carol)');
    expect(out).not.toContain('You MUST respond');
  });

  it('emits the must-respond directive when wasMentioned is true, even with zero non-bot mentions', () => {
    // The Jarvis bug: only the bot itself was @-tagged. Body and the
    // user-mention list are both empty after stripping, so the directive
    // is the sole signal that the message is addressed to us.
    const ctx = { ...baseCtx, mentions: [botMention('ou_jarvis', 'Jarvis')] };
    const out = buildMentionAnnotation(ctx, { wasMentioned: true });
    expect(out).toContain('You were explicitly @-mentioned');
    expect(out).toContain('You MUST respond');
    expect(out).toContain('do NOT output NO_REPLY');
    expect(out).not.toContain('open_id'); // no user-mention list when only bot was mentioned
  });

  it('emits both fragments when wasMentioned is true and other users were also @-mentioned', () => {
    // The original repro: @Jarvis @Zero @miniGG @Lyra @小乔 @暴躁蛋小黄
    const ctx = {
      ...baseCtx,
      mentions: [
        botMention('ou_jarvis', 'Jarvis'),
        userMention('ou_zero', 'Zero'),
        userMention('ou_minigg', 'miniGG'),
      ],
    };
    const out = buildMentionAnnotation(ctx, { wasMentioned: true });
    expect(out).toContain('Zero (open_id: ou_zero)');
    expect(out).toContain('miniGG (open_id: ou_minigg)');
    expect(out).not.toContain('Jarvis (open_id:'); // bot is filtered out of the user list
    expect(out).toContain('You MUST respond');
    // Two fragments are joined by a newline so they render as separate
    // [System: ...] blocks in the prompt.
    expect(out.split('\n').length).toBeGreaterThanOrEqual(2);
  });

  it('does not emit the directive when wasMentioned is false but other users were @-mentioned', () => {
    // Lurk-mode: a user @-mentions someone else in the group, the bot is not addressed.
    const ctx = { ...baseCtx, mentions: [userMention('ou_bob', 'Bob')] };
    const out = buildMentionAnnotation(ctx, { wasMentioned: false });
    expect(out).toContain('Bob (open_id: ou_bob)');
    expect(out).not.toContain('You MUST respond');
  });

  it('emits the directive for an @all-driven wasMentioned even when mentions array is empty', () => {
    // Feishu @all does not produce a regular MentionInfo entry — the
    // mention list can be empty while wasMentioned is still true via
    // resolveRespondToMentionAll. The directive must still fire.
    const ctx = { ...baseCtx, mentions: [], mentionAll: true };
    const out = buildMentionAnnotation(ctx, { wasMentioned: true });
    expect(out).toContain('You MUST respond');
    expect(out).not.toContain('open_id');
  });
});

describe('buildMessageBody', () => {
  it('appends the must-respond directive in group messages when wasMentioned is true', () => {
    const ctx = {
      ...baseCtx,
      content: 'hello jarvis',
      mentions: [botMention('ou_jarvis', 'Jarvis')],
    };
    const body = buildMessageBody(ctx, undefined, { wasMentioned: true });
    expect(body).toMatch(/^\[Alice\]\(ou_alice\): hello jarvis/);
    expect(body).toContain('You MUST respond');
  });

  it('omits the annotation entirely when there are no mentions and wasMentioned is false', () => {
    const ctx = { ...baseCtx, content: 'hello' };
    const body = buildMessageBody(ctx, undefined, { wasMentioned: false });
    expect(body).toBe('[Alice](ou_alice): hello');
  });

  it('threads the wasMentioned signal through even when ctx.mentions has no bot entry', () => {
    // Defense-in-depth: if isBot detection misfires upstream (e.g. botOpenId
    // not yet probed at parse time), the dispatch.js layer can still set
    // wasMentioned via @all or any future upstream signal, and the
    // directive will still appear in the prompt.
    const ctx = { ...baseCtx, content: 'hello', mentions: [] };
    const body = buildMessageBody(ctx, undefined, { wasMentioned: true });
    expect(body).toContain('You MUST respond');
  });
});

describe('buildBodyForAgent', () => {
  it('returns clean content when no annotation is needed', () => {
    const ctx = { ...baseCtx, content: 'plain text' };
    expect(buildBodyForAgent(ctx)).toBe('plain text');
    expect(buildBodyForAgent(ctx, { wasMentioned: false })).toBe('plain text');
  });

  it('appends the directive when wasMentioned is true', () => {
    const ctx = { ...baseCtx, content: 'plain text', mentions: [botMention('ou_jarvis', 'Jarvis')] };
    const out = buildBodyForAgent(ctx, { wasMentioned: true });
    expect(out.startsWith('plain text\n\n[System:')).toBe(true);
    expect(out).toContain('You MUST respond');
  });
});
