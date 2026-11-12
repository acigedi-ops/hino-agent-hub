import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { createAgent, renameAgent, resetPassword, setAgentActive } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";

export default async function Agents() {
  const me = await requireAdmin();
  const users = await db.user.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }], include: { _count: { select: { contacts: true } } } });
  return (
    <div className="space-y-6">
      <h1 className="h1">Agents</h1>
      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead><tr className="border-b border-line">
            <th className="th">Name</th><th className="th">Email</th><th className="th">Role</th><th className="th">Contacts</th><th className="th">Status</th><th className="th">Reset password</th>
          </tr></thead>
          <tbody>
            {users.map((a) => (
              <tr key={a.id} className="border-b border-line align-top last:border-0">
                <td className="td" colSpan={2}>
                  <ActionForm action={renameAgent} submit="Save" buttonClass="btn-quiet" className="flex flex-wrap items-start gap-2">
                    <input type="hidden" name="userId" value={a.id} />
                    <input className="input w-44 font-semibold" name="name" defaultValue={a.name} aria-label={`Name of ${a.name}`} required />
                    <input className="input w-56" name="email" type="email" defaultValue={a.email} aria-label={`Email of ${a.name}`} required />
                  </ActionForm>
                </td>
                <td className="td">{a.role === "ADMIN" ? "Owner" : "Agent"}</td>
                <td className="td">{a._count.contacts}</td>
                <td className="td">
                  {a.id === me.id ? "Active (you)" : (
                    <ActionForm action={setAgentActive} submit={a.active ? "Disable login" : "Enable login"} buttonClass="btn-quiet" className="space-y-1">
                      <input type="hidden" name="userId" value={a.id} />
                      <input type="hidden" name="active" value={String(!a.active)} />
                      <div className="text-xs text-muted">{a.active ? "Active" : "Disabled"}</div>
                    </ActionForm>
                  )}
                </td>
                <td className="td">
                  <ActionForm action={resetPassword} submit="Set" buttonClass="btn-quiet" className="flex flex-wrap items-start gap-2">
                    <input type="hidden" name="userId" value={a.id} />
                    <input className="input w-44" name="password" type="password" minLength={10} placeholder="New password" aria-label={`New password for ${a.name}`} autoComplete="new-password" />
                  </ActionForm>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="max-w-xl space-y-2">
        <h2 className="h2">Add a login</h2>
        <ActionForm action={createAgent} submit="Create login" className="card space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="name">Full name</label><input className="input" id="name" name="name" required /></div>
            <div><label className="label" htmlFor="email">Email</label><input className="input" id="email" name="email" type="email" required /></div>
            <div><label className="label" htmlFor="password">Temporary password</label><input className="input" id="password" name="password" type="password" minLength={10} required autoComplete="new-password" /></div>
            <div><label className="label" htmlFor="role">Role</label><select className="input" id="role" name="role"><option value="AGENT">Agent</option><option value="ADMIN">Owner</option></select></div>
          </div>
          <p className="text-xs text-muted">Agents see only their own contacts. Owners see everyone. Ask the new agent to change the password under My account.</p>
        </ActionForm>
      </section>
    </div>
  );
}
