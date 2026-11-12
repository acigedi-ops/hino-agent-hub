import type { Stage } from "@prisma/client";
import { stageLabel } from "@/lib/contacts";

const tone: Record<Stage, string> = {
  APPLICANT: "bg-amber-50 text-amber-800",
  QUOTED: "bg-yellow-200 text-yellow-950",
  CLIENT: "bg-ink text-gold",
  LOST: "bg-red-50 text-red-800",
  FORMER: "bg-stone-200 text-stone-700",
};

export function StageBadge({ stage }: { stage: Stage }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${tone[stage]}`}>{stageLabel(stage)}</span>;
}
