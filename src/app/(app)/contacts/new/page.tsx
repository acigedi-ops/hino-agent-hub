import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { createContact } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { LEAD_SOURCES } from "@/lib/contacts";

export default async function NewContact() {
  const u = await requireUser();
  const agents = u.role === "ADMIN" ? await db.user.findMany({ where: { active: true }, orderBy: { name: "asc" } }) : [];
  return (
    <div className="max-w-xl space-y-4">
      <h1 className="h1">New applicant</h1>
      <p className="text-sm text-muted">A name and a phone or email is enough. The hub checks whether this person is already with another agent.</p>
      <ActionForm action={createContact} submit="Add applicant" className="card space-y-3">
        <div><label className="label" htmlFor="fullName">Full name or business</label><input className="input" id="fullName" name="fullName" required /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="phone">Phone</label><input className="input" id="phone" name="phone" type="tel" /></div>
          <div><label className="label" htmlFor="email">Email</label><input className="input" id="email" name="email" type="email" /></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label className="label" htmlFor="type">Quote type</label>
            <select className="input" id="type" name="type"><option value="PERSONAL">Personal</option><option value="COMMERCIAL">Commercial</option></select></div>
          <div><label className="label" htmlFor="leadSource">Lead source</label>
            <select className="input" id="leadSource" name="leadSource"><option value="">Not set</option>{LEAD_SOURCES.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div><label className="label" htmlFor="priority">Priority</label>
            <select className="input" id="priority" name="priority" defaultValue="Normal"><option>High</option><option>Normal</option><option>Low</option></select></div>
        </div>
        {u.role === "ADMIN" && (
          <div><label className="label" htmlFor="agentId">Agent</label>
            <select className="input" id="agentId" name="agentId" defaultValue={u.id}>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
        )}
      </ActionForm>
    </div>
  );
}
