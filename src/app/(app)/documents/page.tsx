import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { AgentDocs } from "@/components/AgentDocs";

export default async function MyDocuments() {
  const u = await requireUser();
  // Agents have their documents on My profile.
  if (u.role !== "ADMIN") redirect("/account#documents");
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="h1">My documents</h1>
        <p className="mt-1 text-sm text-muted">Upload your W-9 and your producer license here. The owner checks each one and approves it. Only you and the owner can see these files.</p>
      </div>
      <AgentDocs userId={u.id} />
    </div>
  );
}
