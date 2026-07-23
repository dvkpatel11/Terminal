// src/server/discordApi.test.ts
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { normalizeDiscordMessage } from "./discordMessages";
import type { DiscordMessage } from "./discordApi";

function makeMsg(overrides: Partial<DiscordMessage> = {}): DiscordMessage {
  return {
    id: "1234567890",
    content: "SPY looking bullish today 🚀",
    author: { id: "user1", username: "trader1", bot: false },
    timestamp: "2026-07-23T12:00:00.000Z",
    edited_timestamp: null,
    reactions: [{ emoji: { name: "🚀" }, count: 5 }],
    attachments: [],
    embeds: [],
    channel_id: "ch1",
    guild_id: "g1",
    ...overrides,
  };
}

describe("Discord Message Normalization", () => {
  test("normalizes a basic message", () => {
    const msg = makeMsg();
    const post = normalizeDiscordMessage(msg, "Trading Hub", "general");
    assert.ok(post);
    assert.equal(post.platform, "discord");
    assert.equal(post.accountName, "trader1");
    assert.equal(post.text, "SPY looking bullish today 🚀");
    assert.deepEqual(post.tickers, ["SPY"]);
    assert.ok(post.url.includes("discord.com/channels"));
  });

  test("skips bot messages", () => {
    const msg = makeMsg({ author: { id: "bot1", username: "bot", bot: true } });
    const post = normalizeDiscordMessage(msg, "Guild", "ch");
    assert.equal(post, null);
  });

  test("skips empty messages", () => {
    const msg = makeMsg({ content: "", attachments: [], embeds: [] });
    const post = normalizeDiscordMessage(msg, "Guild", "ch");
    assert.equal(post, null);
  });

  test("handles messages with attachments but no content", () => {
    const msg = makeMsg({
      content: "",
      attachments: [{ id: "a1", url: "https://example.com/img.png", filename: "chart.png" }],
    });
    const post = normalizeDiscordMessage(msg, "Guild", "ch");
    assert.ok(post);
    assert.ok(post.text.includes("chart.png"));
  });

  test("calculates engagement from reactions", () => {
    const msg = makeMsg({
      reactions: [
        { emoji: { name: "🚀" }, count: 10 },
        { emoji: { name: "📈" }, count: 5 },
      ],
    });
    const post = normalizeDiscordMessage(msg, "Guild", "ch");
    assert.ok(post);
    assert.ok(post.engagementScore > 0);
  });

  test("sets channel name as title", () => {
    const msg = makeMsg();
    const post = normalizeDiscordMessage(msg, "Guild", "market-talk");
    assert.ok(post);
    assert.equal(post.title, "#market-talk");
  });
});
