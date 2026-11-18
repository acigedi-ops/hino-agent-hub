import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { assistantEnabled } from "@/lib/assistant";
import { getChat, listChats } from "@/lib/assistant-chats";
import { AssistantBox } from "@/components/AssistantBox";
import { ChatShell } from "@/components/ChatShell";
import { deleteChatAction, renameChatAction } from "../actions";

export const metadata = { title: "AI Assistant" };

const when = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });

/** /ai-assistant starts a new chat; /ai-assistant/ID reopens a saved one. Each person sees only their own chats. */
export default async function AiAssistantPage({ params }: { params: Promise<{ id?: string[] }> }) {
  const u = await requireUser();
  const { id } = await params;
  if (id && id.length > 1) notFound();
  const [chats, chat] = await Promise.all([listChats(u.id), id ? getChat(u.id, id[0]) : null]);
  if (id && !chat) notFound();
  return (
    <ChatShell chats={chats.map((c) => ({ id: c.id, title: c.title, when: when(c.lastAt) }))} current={chat && { id: chat.id, title: chat.title }} rename={renameChatAction} remove={deleteChatAction}>
      {/* The key gives each chat, and each new chat, its own fresh box. */}
      <AssistantBox key={chat?.id ?? "new"} variant="page" enabled={assistantEnabled()} firstName={u.name.split(" ")[0]} chatId={chat?.id ?? null} initialTurns={chat?.turns ?? []} />
    </ChatShell>
  );
}
