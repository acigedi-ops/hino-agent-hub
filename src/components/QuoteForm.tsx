"use client";
import { useState } from "react";
import { COVERAGES, QUOTE_SECTIONS, type QuoteField } from "@/lib/quote-fields";

const FILES = "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

/** The fields of a Quote Desk request. Picking Construction marks the extra answers the office needs for it. */
export function QuoteFields() {
  const [industry, setIndustry] = useState("");
  const [subs, setSubs] = useState("");
  const construction = industry === "Construction";
  const field = (f: QuoteField) => {
    const need = f.required || (construction && f.construction) || (construction && f.key === "sub_cost" && subs === "Yes");
    const id = `q-${f.key}`;
    const label = <label className="label" htmlFor={id}>{f.label}{need ? <span className="text-red-700"> *</span> : null}</label>;
    if (f.kind === "select" || f.kind === "yesno") {
      const options = f.kind === "yesno" ? ["Yes", "No"] : f.options!;
      return (
        <div key={f.key}>{label}
          <select className="input" id={id} name={f.key} defaultValue="" required={need}
            onChange={(e) => { if (f.key === "industry") setIndustry(e.target.value); if (f.key === "uses_subs") setSubs(e.target.value); }}>
            <option value="">Choose</option>{options.map((o) => <option key={o}>{o}</option>)}
          </select>
        </div>
      );
    }
    if (f.kind === "long") return <div key={f.key} className="md:col-span-2">{label}<textarea className="input" id={id} name={f.key} rows={3} required={need} /></div>;
    return (
      <div key={f.key}>{label}
        <input className="input" id={id} name={f.key} required={need} type={f.kind === "date" ? "date" : f.key === "email" ? "email" : "text"}
          inputMode={f.kind === "money" ? "decimal" : f.key === "phone" ? "tel" : undefined} placeholder={f.kind === "money" ? "$" : undefined} />
      </div>
    );
  };
  return (
    <>
      {QUOTE_SECTIONS.map((sec) => (
        <fieldset key={sec.title} className="card space-y-3">
          <legend className="h2 float-left mb-1 w-full">{sec.title}</legend>
          {sec.title === "Coverage wanted" && (
            <div className="clear-both flex flex-wrap gap-x-5 gap-y-2">
              {COVERAGES.map((c) => <label key={c} className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" name="coverage" value={c} className="h-4 w-4" />{c}</label>)}
            </div>
          )}
          {sec.title === "What the business does" && construction && <p className="clear-both text-sm text-muted">For construction the office needs payroll, subcontractors, gross income and whether any work is above 4 stories.</p>}
          <div className="clear-both grid gap-3 md:grid-cols-2">{sec.fields.map(field)}</div>
        </fieldset>
      ))}
      <fieldset className="card space-y-3">
        <legend className="h2 float-left mb-1 w-full">Files and notes</legend>
        <div className="clear-both"><label className="label" htmlFor="q-files">Loss runs, current policy, contracts, anything else (photos or PDFs)</label>
          <input className="input" id="q-files" name="files" type="file" multiple accept={FILES} /></div>
        <div><label className="label" htmlFor="q-notes">Notes for the office</label><textarea className="input" id="q-notes" name="notes" rows={3} /></div>
      </fieldset>
    </>
  );
}
