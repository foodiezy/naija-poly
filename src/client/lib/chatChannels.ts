// Pure helper behind the chat panel's channel routing. Extracted so the
// "which conversation does this message belong to" rule can be unit-tested.
import { ChatMessage } from "../../shared/chat";

// From my perspective, the channel a message belongs to: "general" for
// broadcasts, otherwise the *other* party's id (the recipient on messages I
// sent, the sender on messages sent to me).
export function channelOf(msg: ChatMessage, mySessionId: string): string {
  if (!msg.toId) return "general";
  return msg.senderId === mySessionId ? msg.toId : msg.senderId;
}
