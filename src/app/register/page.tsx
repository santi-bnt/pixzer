import { Brand, Button, Notice } from "@/components/ui";
import Link from "next/link";

export default function RegisterPage() {
  return (
    <main className="grid-glow grid min-h-screen place-items-center px-5 py-10">
      <div className="w-full max-w-md">
        <Link href="/">
          <Brand />
        </Link>
        <div className="panel mt-9 rounded-3xl p-7 sm:p-9">
          <div className="text-xs font-bold uppercase tracking-[.2em] text-violet-300">
            A library of your own
          </div>
          <h1 className="mt-3 text-3xl font-semibold">Create your account</h1>
          <p className="mt-2 text-sm leading-6 text-[#a5a8b8]">
            PocketArcade is preparing for a small invited community.
          </p>
          <div className="mt-7 space-y-4">
            <label className="block text-sm text-[#d2d2db]">
              Email address
              <input
                disabled
                type="email"
                placeholder="you@example.com"
                className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-sm placeholder:text-[#666979]"
              />
            </label>
            <label className="block text-sm text-[#d2d2db]">
              Password
              <input
                disabled
                type="password"
                placeholder="At least 12 characters"
                className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-sm placeholder:text-[#666979]"
              />
            </label>
            <Button disabled>Create account</Button>
          </div>
          <div className="mt-6">
            <Notice
              title="Registration is not active"
              body="This form is a layout preview only. No account is created and no information is sent. Auth and invite controls belong to Phase 2."
            />
          </div>
          <p className="mt-6 text-center text-sm text-[#a5a8b8]">
            Already have access?{" "}
            <a className="text-violet-200" href="/login">
              Sign in
            </a>
          </p>
        </div>
        <p className="mt-5 text-center text-xs">
          <Link href="/" className="quiet-link">
            ← Back to home
          </Link>
        </p>
      </div>
    </main>
  );
}
