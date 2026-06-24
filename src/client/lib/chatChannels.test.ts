import { describe, it, expect } from "vitest";
import { ChatMessage } from "../../shared/chat";
import { channelOf } from "./chatChannels";

const msg = (overrides: Partial<ChatMessage>): ChatMessage => ({
  senderId: "me",
  senderName: "Me",
  tokenId: "okada",
  text: "hi",
  timestamp: 0,
  toId: null,
  ...overrides,
});

describe("channelOf", () => {
  it("routes broadcasts to the general channel", () => {
    expect(channelOf(msg({ toId: null }), "me")).toBe("general");
  });

  it("routes a private message I sent to the recipient's channel", () => {
    expect(channelOf(msg({ senderId: "me", toId: "other" }), "me")).toBe("other");
  });

  it("routes a private message sent to me into the sender's channel", () => {
    expect(channelOf(msg({ senderId: "other", toId: "me" }), "me")).toBe("other");
  });
});
