import { SOURCE_KINDS } from "@/lib/contacts";

type Src = { name: string; kind: string; contactName: string | null; phone: string | null; email: string | null; address: string | null; notes: string | null };

/** The inputs for adding or editing a referral source. */
export function SourceFields({ v }: { v?: Src }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="name">Business name</label><input className="input" id="name" name="name" defaultValue={v?.name} maxLength={150} required /></div>
        <div><label className="label" htmlFor="kind">Type</label>
          <select className="input" id="kind" name="kind" defaultValue={v?.kind}>{SOURCE_KINDS.map((k) => <option key={k}>{k}</option>)}</select></div>
        <div><label className="label" htmlFor="contactName">Contact person</label><input className="input" id="contactName" name="contactName" defaultValue={v?.contactName ?? ""} /></div>
        <div><label className="label" htmlFor="phone">Phone</label><input className="input" id="phone" name="phone" type="tel" defaultValue={v?.phone ?? ""} /></div>
        <div><label className="label" htmlFor="email">Email</label><input className="input" id="email" name="email" type="email" defaultValue={v?.email ?? ""} /></div>
        <div><label className="label" htmlFor="address">Address</label><input className="input" id="address" name="address" defaultValue={v?.address ?? ""} /></div>
      </div>
      <div><label className="label" htmlFor="notes">Notes</label><textarea className="input" id="notes" name="notes" rows={2} maxLength={2000} defaultValue={v?.notes ?? ""} /></div>
    </>
  );
}
