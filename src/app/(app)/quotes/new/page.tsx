import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ActionForm } from "@/components/ActionForm";
import { QuoteFields } from "@/components/QuoteForm";
import { createQuoteRequest } from "../actions";

export default async function NewQuote() {
  await requireUser();
  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <Link className="text-sm text-muted underline" href="/quotes">Back to Quote Desk</Link>
        <h1 className="h1 mt-1">New quote request</h1>
        <p className="mt-1 text-sm text-muted">Business insurance only, such as general liability and professional liability. Fill in what you know; boxes with a red star are required.</p>
      </div>
      <ActionForm action={createQuoteRequest} submit="Send to the office" className="space-y-4" buttonClass="btn-gold"><QuoteFields /></ActionForm>
    </div>
  );
}
