import { requireUser } from "@/lib/auth";
import { changeOwnPassword, logoutAction } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { AgentDocs } from "@/components/AgentDocs";

export default async function Account() {
  const u = await requireUser();
  const agent = u.role !== "ADMIN";
  const password = (
    <ActionForm action={changeOwnPassword} submit="Change password" className="card max-w-md space-y-3">
      <div><label className="label" htmlFor="password">New password</label><input className="input" id="password" name="password" type="password" minLength={10} required autoComplete="new-password" /></div>
      <div><label className="label" htmlFor="confirm">Repeat it</label><input className="input" id="confirm" name="confirm" type="password" minLength={10} required autoComplete="new-password" /></div>
    </ActionForm>
  );
  // The owner keeps My account and My documents as two pages. Agents get both here as My profile.
  if (!agent) return (
    <div className="max-w-md space-y-4">
      <h1 className="h1">My account</h1>
      <div className="card text-sm"><div className="font-semibold">{u.name}</div><div className="text-muted">{u.email} · Owner</div></div>
      <h2 className="h2">Change password</h2>
      {password}
      <form action={logoutAction}><button className="btn-quiet">Sign out</button></form>
    </div>
  );
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="h1">My profile</h1>
        <p className="mt-1 text-sm text-muted">{u.name} · {u.email}</p>
      </div>
      <section className="space-y-3" id="documents">
        <h2 className="h2">My documents</h2>
        <p className="text-sm text-muted">Your W-9 and producer license. Only you and the owner can see them.</p>
        <AgentDocs userId={u.id} />
      </section>
      <section className="space-y-2">
        <h2 className="h2">Password</h2>
        <details className="group">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold underline md:min-h-0">Change my password</summary>
          <div className="mt-2">{password}</div>
        </details>
      </section>
      <form action={logoutAction}><button className="btn-quiet">Sign out</button></form>
    </div>
  );
}
