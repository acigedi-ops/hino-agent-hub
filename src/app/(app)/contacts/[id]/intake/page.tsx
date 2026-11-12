import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { contactScope, requireUser } from "@/lib/auth";
import { emptyIntake, parseIntake } from "@/lib/intake";
import { IntakeForm } from "./IntakeForm";

export default async function IntakePage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  const { id } = await params;
  const c = await db.contact.findFirst({ where: { id, ...contactScope(u) }, include: { intake: true, agent: true } });
  if (!c) notFound();

  let data = c.intake ? parseIntake(c.intake.data) : emptyIntake();
  if (!c.intake) {
    data = {
      ...data,
      text: {
        ...data.text,
        date: new Date().toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" }),
        agent: c.agent.name, full_name: c.fullName, phone1: c.phone ?? "", email: c.email ?? "", lead_source: c.leadSource ?? "",
      },
      choice: { ...data.choice, type: c.type === "COMMERCIAL" ? "Commercial" : "Personal", priority: c.priority ?? "Normal" },
    };
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="h1">Intake: {c.fullName}</h1>
        <Link href={`/contacts/${c.id}`} className="btn-quiet">Back to contact</Link>
      </div>
      <IntakeForm contactId={c.id} initial={data} hasSaved={!!c.intake} />
    </div>
  );
}
