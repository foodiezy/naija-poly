// Chat is a network/transport concern shared between the Colyseus server and
// the React client, so its shape lives here rather than in the pure engine.

// A chat message as broadcast over the `CHAT_MESSAGE` channel. A null `toId`
// means a general (everyone) message; a set `toId` is a private/direct message
// delivered only to the sender and that recipient.
export interface ChatMessage {
  senderId: string;
  senderName: string;
  tokenId: string;
  text: string;
  timestamp: number;
  toId: string | null;
  toName?: string;
}
