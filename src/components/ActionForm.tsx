"use client";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { shrinkPhoto } from "@/lib/shrink";

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
  const form = useRef<HTMLFormElement>(null);
  const sent = useRef(false);
  const [preparing, setPreparing] = useState(false);
  // After a save, empty the boxes that start out empty (a note, a new task, a chosen file) so a second tap cannot add the same thing twice.
  // Boxes that show a saved value keep it.
  useEffect(() => {
    if (!sent.current || state.error || !form.current) return;
    sent.current = false;
    for (const el of form.current.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")) {
      if (el instanceof HTMLInputElement && ["hidden", "checkbox", "radio", "date", "month", "number"].includes(el.type)) continue;
      if (el.type === "file" || el.defaultValue === "") el.value = "";
    }
  }, [state]);
  return (
    // Submitting by hand instead of through `action` keeps what was typed when the action returns an error.
    <form ref={form} action={run} onSubmit={async (e) => {
      e.preventDefault();
      if (preparing || pending) return;
      const data = new FormData(e.currentTarget);
      // Photos are made smaller (and iPhone HEIC pictures become JPG) before they are sent.
      const photos = [...data.entries()].filter((x): x is [string, File] => x[1] instanceof File && x[1].size > 0);
      if (photos.length) {
        setPreparing(true);
        try {
          // A box that takes several files has them all under one name, so each name is emptied once and filled again.
          const ready: [string, File][] = [];
          for (const [k, f] of photos) ready.push([k, await shrinkPhoto(f)]);
          for (const k of new Set(ready.map((x) => x[0]))) data.delete(k);
          for (const [k, f] of ready) data.append(k, f);
        } finally { setPreparing(false); }
      }
      sent.current = true; startTransition(() => run(data));
    }} className={className}>
      {children}
      {state.error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>}
      {state.ok && <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{state.ok}</p>}
      <div><button className={buttonClass} disabled={pending || preparing}>{pending || preparing ? "Working..." : submit}</button></div>
    </form>
  );
}
