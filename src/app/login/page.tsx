import Image from "next/image";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { loginAction } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";

export default async function LoginPage() {
  if (await currentUser()) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <div className="-mx-6 -mt-6 mb-5 flex justify-center rounded-t-xl bg-ink py-5">
          <Image src="/brand/rhino-logo-cropped.png" alt="Rhino Insurance" width={150} height={133} priority />
        </div>
        <h1 className="mb-4 text-lg font-bold">Agent Hub sign in</h1>
        <ActionForm action={loginAction} submit="Sign in" className="space-y-3" buttonClass="btn w-full">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input className="input" id="email" name="email" type="email" autoComplete="username" required />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
        </ActionForm>
      </div>
    </main>
  );
}
