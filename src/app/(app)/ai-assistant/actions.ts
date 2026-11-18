"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { deleteChat, renameChat } from "@/lib/assistant-chats";
import type { FormState } from "@/components/ActionForm";

export async function renameChatAction(_: FormState, data: FormData): Promise<FormState> {
  const u = await requireUser();
  const ok = await renameChat(u.id, String(data.get("id") ?? ""), String(data.get("title") ?? ""));
  if (!ok) return { error: "Type a name for this chat." };
  revalidatePath("/ai-assistant", "layout");
  return { ok: "Renamed." };
}

export async function deleteChatAction(data: FormData) {
  const u = await requireUser();
  await deleteChat(u.id, String(data.get("id") ?? ""));
  revalidatePath("/ai-assistant", "layout");
  redirect("/ai-assistant");
}
