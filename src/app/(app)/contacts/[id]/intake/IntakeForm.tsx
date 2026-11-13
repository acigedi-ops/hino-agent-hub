"use client";
import { useState, useTransition } from "react";
import { decodeVin, saveIntake } from "@/app/actions";
import { CHOICES, ROWS, isValidVin, type IntakeData } from "@/lib/intake";
import { LEAD_SOURCES } from "@/lib/contacts";

type TextKey = keyof IntakeData["text"];
type ChoiceKey = keyof IntakeData["choice"];
type Field = [key: TextKey, label: string, span?: string, props?: React.InputHTMLAttributes<HTMLInputElement>];

const MARITAL = ["Single", "Married", "Divorced", "Widowed", "Domestic partner"];
const RELATIONSHIP = ["Self", "Spouse", "Child", "Parent", "Sibling", "Employee", "Other"];
const OWNERSHIP = ["Owned", "Financed", "Leased"];

export function IntakeForm({ contactId, initial, hasSaved }: { contactId: string; initial: IntakeData; hasSaved: boolean }) {
  const [d, setD] = useState(initial);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [saved, setSaved] = useState(hasSaved);
  const [pending, start] = useTransition();
  const commercial = d.choice.type === "Commercial";

  const setText = (k: TextKey, v: string) => setD((p) => ({ ...p, text: { ...p.text, [k]: v } }));
  const setChoice = (k: ChoiceKey, v: string) => setD((p) => ({ ...p, choice: { ...p.choice, [k]: p.choice[k] === v ? "" : v } }));
  const setRow = <T extends "drivers" | "vehicles" | "violations">(t: T, i: number, patch: Partial<IntakeData[T][number]>) =>
    setD((p) => ({ ...p, [t]: p[t].map((r, j) => (j === i ? { ...r, ...patch } : r)) }));

  const input = ([k, label, span = "", props = {}]: Field) => (
    <div key={k} className={span}>
      <label className="label" htmlFor={k}>{label}</label>
      <input className="input" id={k} value={d.text[k]} onChange={(e) => setText(k, e.target.value)} {...props} />
    </div>
  );

  const choice = (k: ChoiceKey, label: string, span = "") => (
    <fieldset key={k} className={span}>
      <legend className="label">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {Object.keys(CHOICES[k]).map((opt) => (
          <button key={opt} type="button" aria-pressed={d.choice[k] === opt} onClick={() => setChoice(k, opt)}
            className={`cursor-pointer rounded-md border px-2.5 py-1.5 text-sm ${d.choice[k] === opt ? "border-ink bg-ink font-semibold text-gold" : "border-line bg-white"}`}>
            {opt}
          </button>
        ))}
      </div>
    </fieldset>
  );

  const cellInput = (value: string, onChange: (v: string) => void, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input className="input" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} {...props} />
  );
  const cellSelect = (value: string, onChange: (v: string) => void, label: string, options: string[]) => (
    <select className="input" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value=""></option>
      {options.map((o) => <option key={o}>{o}</option>)}
      {value && !options.includes(value) && <option>{value}</option>}
    </select>
  );

  async function lookupVin(i: number) {
    const vin = d.vehicles[i].vin.trim().toUpperCase();
    if (!vin) return;
    setRow("vehicles", i, { vin });
    if (!isValidVin(vin)) return setMsg({ error: `Vehicle ${i + 1}: a VIN has 17 characters and never uses I, O or Q.` });
    const r = await decodeVin(vin);
    if (r) {
      setRow("vehicles", i, { year: r.year, make: r.make, model: r.model });
      setMsg({ ok: `Vehicle ${i + 1} decoded: ${r.year} ${r.make} ${r.model}.` });
    }
  }

  function save() {
    setMsg({});
    start(async () => {
      const res = await saveIntake(contactId, d);
      setMsg(res);
      if (res.ok) setSaved(true);
    });
  }

  const driverNames = d.drivers.map((r) => r.name).filter(Boolean);

  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <section className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {input(["date", "Date"])}
        {input(["agent", "Agent"])}
        {choice("priority", "Priority", "lg:col-span-2")}
        <div>
          <label className="label" htmlFor="lead_source">Lead source</label>
          <select className="input" id="lead_source" value={d.text.lead_source} onChange={(e) => setText("lead_source", e.target.value)}>
            <option value="">Not set</option>
            {LEAD_SOURCES.map((s) => <option key={s}>{s}</option>)}
            {d.text.lead_source && !LEAD_SOURCES.includes(d.text.lead_source) && <option>{d.text.lead_source}</option>}
          </select>
        </div>
        {choice("type", "Quote type")}
      </section>

      <h2 className="h2">Applicant</h2>
      <section className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {([
          ["full_name", "Full name", "lg:col-span-2", { required: true }],
          ["dob", "Date of birth", "", { type: "date" }],
          ["dl_number", "Driver's license #", "lg:col-span-2"],
          ["dl_state", "DL state", "", { maxLength: 20 }],
          ["spouse_name", "Spouse / domestic partner", "lg:col-span-2"],
          ["spouse_dob", "Date of birth", "", { type: "date" }],
          ["spouse_dl_number", "Driver's license #", "lg:col-span-2"],
          ["spouse_dl_state", "DL state", "", { maxLength: 20 }],
          ["phone1", "Phone 1", "", { type: "tel" }],
          ["phone2", "Phone 2", "", { type: "tel" }],
          ["email", "Email", "lg:col-span-4", { type: "email" }],
          ["address1", "Address 1", "lg:col-span-3"],
          ["address2", "Address 2", "lg:col-span-3"],
        ] as Field[]).map(input)}
      </section>

      <h2 className="h2">Household and current insurance</h2>
      <section className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {choice("housing", "Housing", "lg:col-span-2")}
        {input(["family_children", "Family / children"])}
        {input(["origin", "Country / city of origin"])}
        {input(["time_in_us", "Time in US (yrs / mo)"])}
        {input(["grade_score", "Grade / score"])}
        {choice("insured30", "Insured in last 30 days")}
        {input(["current_carrier", "Current carrier", "lg:col-span-2"])}
        {input(["expiration_date", "Expiration date", "", { type: "date" }])}
        {input(["how_long_insured", "How long insured"])}
        {choice("payment", "Payment preference")}
      </section>

      {commercial && (
        <>
          <h2 className="h2">Commercial / trucking</h2>
          <section className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            {([
              ["business_name", "Business name", "lg:col-span-2"],
              ["experience_years", "Experience (yrs)"],
              ["dot", "DOT #"],
              ["mc", "MC #"],
              ["ein", "EIN"],
              ["ubi", "UBI"],
              ["truck_insurance", "Current truck insurance: carrier / agent / state", "lg:col-span-3"],
              ["truck_renewal_date", "Expire / renewal date", "", { type: "date" }],
              ["truck_how_long", "How long"],
            ] as Field[]).map(input)}
            {choice("cargo", "Cargo limit", "lg:col-span-2")}
            {choice("trailer", "Trailer type", "lg:col-span-2")}
            {choice("length", "Length")}
            {choice("radius", "Radius", "lg:col-span-2")}
            {choice("ifta", "IFTA")}
            {input(["eld_provider", "ELD provider", "lg:col-span-2"])}
            {input(["trailer_equipment", "Trailers / equipment", "lg:col-span-4"])}
          </section>
        </>
      )}

      <h2 className="h2">Drivers</h2>
      <section className="card overflow-x-auto p-0">
        <table className="w-full min-w-[980px]">
          <thead><tr className="border-b border-line">
            {["#", "Full name", "Date of birth", "License #", "Yrs lic.", "Marital", "Occupation", "Education", "DDC", "GS", "Relationship"].map((h) => <th key={h} className="th">{h}</th>)}
          </tr></thead>
          <tbody>
            {Array.from({ length: ROWS }, (_, i) => {
              const r = d.drivers[i];
              const n = `Driver ${i + 1}`;
              return (
                <tr key={i} className="border-b border-line last:border-0">
                  <td className="td font-bold">{i + 1}</td>
                  <td className="min-w-44 p-1">{cellInput(r.name, (v) => setRow("drivers", i, { name: v }), `${n} name`)}</td>
                  <td className="p-1">{cellInput(r.dob, (v) => setRow("drivers", i, { dob: v }), `${n} date of birth`, { type: "date" })}</td>
                  <td className="p-1">{cellInput(r.dl, (v) => setRow("drivers", i, { dl: v }), `${n} license number`)}</td>
                  <td className="w-20 p-1">{cellInput(r.years_licensed, (v) => setRow("drivers", i, { years_licensed: v }), `${n} years licensed`, { inputMode: "numeric" })}</td>
                  <td className="p-1">{cellSelect(r.marital, (v) => setRow("drivers", i, { marital: v }), `${n} marital status`, MARITAL)}</td>
                  <td className="p-1">{cellInput(r.occupation, (v) => setRow("drivers", i, { occupation: v }), `${n} occupation`)}</td>
                  <td className="p-1">{cellInput(r.education, (v) => setRow("drivers", i, { education: v }), `${n} education`)}</td>
                  <td className="td"><input type="checkbox" aria-label={`${n} defensive driving course`} checked={r.ddc} onChange={(e) => setRow("drivers", i, { ddc: e.target.checked })} /></td>
                  <td className="td"><input type="checkbox" aria-label={`${n} good student`} checked={r.gs} onChange={(e) => setRow("drivers", i, { gs: e.target.checked })} /></td>
                  <td className="p-1">{cellSelect(r.relationship, (v) => setRow("drivers", i, { relationship: v }), `${n} relationship`, RELATIONSHIP)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <h2 className="h2">Vehicles</h2>
      <p className="text-xs text-muted">Type a VIN and leave the box. The hub checks it and fills year, make and model.</p>
      <section className="card overflow-x-auto p-0">
        <table className="w-full min-w-[980px]">
          <thead><tr className="border-b border-line">
            {["#", "VIN", "Year", "Make", "Model", "Annual miles", "Assigned driver", "Ownership", "Liability only"].map((h) => <th key={h} className="th">{h}</th>)}
          </tr></thead>
          <tbody>
            {Array.from({ length: ROWS }, (_, i) => {
              const r = d.vehicles[i];
              const n = `Vehicle ${i + 1}`;
              const bad = !!r.vin && !isValidVin(r.vin);
              return (
                <tr key={i} className="border-b border-line last:border-0">
                  <td className="td font-bold">{i + 1}</td>
                  <td className="w-52 p-1">{cellInput(r.vin, (v) => setRow("vehicles", i, { vin: v }), `${n} VIN`, { maxLength: 17, onBlur: () => lookupVin(i), "aria-invalid": bad, style: bad ? { borderColor: "#b91c1c" } : undefined })}</td>
                  <td className="w-20 p-1">{cellInput(r.year, (v) => setRow("vehicles", i, { year: v }), `${n} year`, { inputMode: "numeric" })}</td>
                  <td className="p-1">{cellInput(r.make, (v) => setRow("vehicles", i, { make: v }), `${n} make`)}</td>
                  <td className="p-1">{cellInput(r.model, (v) => setRow("vehicles", i, { model: v }), `${n} model`)}</td>
                  <td className="w-28 p-1">{cellInput(r.annual_miles, (v) => setRow("vehicles", i, { annual_miles: v }), `${n} annual miles`, { inputMode: "numeric" })}</td>
                  <td className="p-1">{cellSelect(r.driver, (v) => setRow("vehicles", i, { driver: v }), `${n} assigned driver`, driverNames)}</td>
                  <td className="p-1">{cellSelect(r.ownership, (v) => setRow("vehicles", i, { ownership: v }), `${n} ownership`, OWNERSHIP)}</td>
                  <td className="p-1">{cellSelect(r.liability_only, (v) => setRow("vehicles", i, { liability_only: v as "" | "Yes" | "No" }), `${n} liability only`, ["Yes", "No"])}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-2">
          <h2 className="h2">Violations and accidents, last 3 years</h2>
          <section className="card overflow-x-auto p-0">
            <table className="w-full">
              <thead><tr className="border-b border-line">{["Driver", "Date", "Type"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
              <tbody>
                {Array.from({ length: ROWS }, (_, i) => {
                  const r = d.violations[i];
                  return (
                    <tr key={i} className="border-b border-line last:border-0">
                      <td className="p-1">{cellSelect(r.driver, (v) => setRow("violations", i, { driver: v }), `Violation ${i + 1} driver`, driverNames)}</td>
                      <td className="p-1">{cellInput(r.date, (v) => setRow("violations", i, { date: v }), `Violation ${i + 1} date`, { type: "date" })}</td>
                      <td className="p-1">{cellInput(r.type, (v) => setRow("violations", i, { type: v }), `Violation ${i + 1} type`)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </div>
        <div className="space-y-2">
          <h2 className="h2">Notes and comments</h2>
          <textarea className="input h-40" aria-label="Notes and comments" maxLength={2000} value={d.text.notes} onChange={(e) => setText("notes", e.target.value)} />
        </div>
      </div>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-paper/95 px-4 py-3 md:-mx-8 md:px-8">
        <button className="btn" disabled={pending}>{pending ? "Saving..." : "Save intake"}</button>
        {saved && <a className="btn-quiet" href={`/contacts/${contactId}/intake/pdf`} target="_blank">Open Rhino PDF</a>}
        {msg.error && <span role="alert" className="text-sm font-medium text-red-800">{msg.error}</span>}
        {msg.ok && <span role="status" className="text-sm font-medium text-green-800">{msg.ok}</span>}
      </div>
    </form>
  );
}
