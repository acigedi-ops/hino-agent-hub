import { requireUser } from "@/lib/auth";
import { changeOwnPassword, logoutAction } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";

export default async function Account() {
  const u = await requireUser();
  return (
    <div className="max-w-md space-y-4">
      <h1 className="h1">My account</h1>
      <div className="card text-sm"><div className="font-semibold">{u.name}</div><div className="text-muted">{u.email} · {u.role === "ADMIN" ? "Owner" : "Agent"}</div></div>
      <h2 className="h2">Change password</h2>
      <ActionForm action={changeOwnPassword} submit="Change password" className="card space-y-3">
        <div><label className="label" htmlFor="password">New password</label><input className="input" id="password" name="password" type="password" minLength={10} required autoComplete="new-password" /></div>
        <div><label className="label" htmlFor="confirm">Repeat it</label><input className="input" id="confirm" name="confirm" type="password" minLength={10} required autoComplete="new-password" /></div>
      </ActionForm>
      <form action={logoutAction}><button className="btn-quiet">Sign out</button></form>
    </div>
  );
}
