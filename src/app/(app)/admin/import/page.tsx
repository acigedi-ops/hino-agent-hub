import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ImportForm } from "./ImportForm";

export default async function ImportPage() {
  const u = await requireAdmin();
  const agents = await db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const history = await db.reportImport.findMany({ orderBy: { createdAt: "desc" }, take: 15, include: { uploadedBy: { select: { name: true } } } });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="h1">New business report</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Upload the new business report from EZLynx or from the carrier. Each policy on it is matched to an applicant by phone, email or name, and that applicant becomes a client.
          Policies for people who are not in the hub yet create a new client.
        </p>
      </div>
      <ImportForm agents={agents} me={u.id} />
      <section className="space-y-2">
        <h2 className="h2">Past uploads</h2>
        <div className="card">
          {history.length === 0 ? <p className="text-sm text-muted">No reports uploaded yet.</p> : (
            <ul className="space-y-1 text-sm">
              {history.map((h) => (
                <li key={h.id}>
                  <span className="font-semibold">{h.filename}</span> · {h.createdAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Los_Angeles" })} · {h.uploadedBy.name} ·{" "}
                  {h.converted} became clients, {h.created} new, {h.updated} updated, {h.skipped} skipped
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
