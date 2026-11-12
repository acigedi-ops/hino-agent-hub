"use client";
import { startTransition, useActionState } from "react";

export type FormState = { error?: string; ok?: string };

/** A form bound to a server action that shows the action's error or success message. */
export function ActionForm({
  action, children, submit, className, buttonClass = "btn",
}: {
  action: (prev: FormState, data: FormData) => Promise<FormState>;
  children: React.ReactNode;
  submit: string;
  className?: string;
  buttonClass?: string;
}) {
  const [state, run, pending] = useActionState(action, {});
  return (
    // Submitting by hand instead of through `action` keeps what was typed when the action returns an error.
    <form action={run} onSubmit={(e) => { e.preventDefault(); const data = new FormData(e.currentTarget); startTransition(() => run(data)); }} className={className}>
      {children}
      {state.error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>}
      {state.ok && <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{state.ok}</p>}
      <div><button className={buttonClass} disabled={pending}>{pending ? "Working..." : submit}</button></div>
    </form>
  );
}
