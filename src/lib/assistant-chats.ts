import "server-only";
import { db } from "@/lib/db";

/** How many past chats the list shows, and how many earlier messages the assistant is given as context. */
export const CHAT_LIST_LIMIT = 100;
export const CONTEXT_TURNS = 20;

export type SavedTurn = { role: "user" | "assistant"; text: string };

/** A chat title from the person's first message: one line, cut at a word near 60 characters. */
export function chatTitle(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  if (!line) return "New chat";
  if (line.length <= 60) return line;
  const cut = line.slice(0, 60);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 30 ? cut.lastIndexOf(" ") : 60)}...`;
}

/** This person's chats, newest first. Chats belong to one person; nobody else, the owner included, can list them. */
export const listChats = (userId: string) =>
  db.assistantChat.findMany({ where: { userId }, orderBy: { lastAt: "desc" }, take: CHAT_LIST_LIMIT, select: { id: true, title: true, lastAt: true } });

/** One chat with its messages, or null when it is not this person's. */
export async function getChat(userId: string, id: string) {
  const chat = await db.assistantChat.findFirst({ where: { id, userId }, include: { turns: { orderBy: { createdAt: "asc" } } } });
  if (!chat) return null;
  return { id: chat.id, title: chat.title, turns: chat.turns.map((t): SavedTurn => ({ role: t.role === "assistant" ? "assistant" : "user", text: t.text })) };
}

/** Adds the person's message and the assistant's reply to a chat, starting a new chat when there is no id. Returns the chat id. */
export async function saveExchange(userId: string, chatId: string | null, userText: string, reply: string): Promise<string> {
  const now = new Date();
  // A millisecond apart so the pair always reads back in order.
  const turns = [{ role: "user", text: userText, createdAt: now }, { role: "assistant", text: reply, createdAt: new Date(now.getTime() + 1) }];
  if (chatId) {
    await db.assistantChat.update({ where: { id: chatId }, data: { lastAt: now, turns: { create: turns } } });
    return chatId;
  }
  const chat = await db.assistantChat.create({ data: { userId, title: chatTitle(userText), lastAt: now, turns: { create: turns } }, select: { id: true } });
  return chat.id;
}

export async function renameChat(userId: string, id: string, title: string) {
  const clean = title.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!clean) return false;
  return (await db.assistantChat.updateMany({ where: { id, userId }, data: { title: clean } })).count > 0;
}

export const deleteChat = async (userId: string, id: string) => (await db.assistantChat.deleteMany({ where: { id, userId } })).count > 0;
