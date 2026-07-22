import { KeyRound, Loader2, UserRound } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

export function EditorProfile() {
  const { resetPassword, role, user } = useAuth();
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sendReset = async () => {
    if (!user?.email || sending) return;
    setSending(true);
    setMessage(null);
    setError(null);
    const result = await resetPassword(user.email);
    if (result.error) setError("The password-reset email could not be sent. Please try again.");
    else setMessage("A password-reset email has been sent to your account.");
    setSending(false);
  };

  return (
    <section aria-labelledby="editor-profile-title" className="space-y-6">
      <header>
        <p className="text-sm font-medium text-blue-700">Your account</p>
        <h1 id="editor-profile-title" className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Editor profile</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Review your current website-editor identity and manage your own password.</p>
      </header>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700">
            <UserRound aria-hidden="true" className="h-5 w-5" />
          </span>
          <dl className="grid min-w-0 flex-1 gap-4 sm:grid-cols-2">
            <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</dt><dd className="mt-1 break-all text-sm font-medium text-slate-900">{user?.email ?? "Unavailable"}</dd></div>
            <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Role</dt><dd className="mt-1 text-sm font-medium text-slate-900">{role ?? "Unavailable"}</dd></div>
          </dl>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3"><KeyRound aria-hidden="true" className="mt-0.5 h-5 w-5 text-blue-700" /><div><h2 className="font-semibold text-slate-900">Password</h2><p className="mt-1 text-sm leading-6 text-slate-600">We will send a secure password-reset link to your signed-in email address.</p></div></div>
        <Button className="mt-4" disabled={!user?.email || sending} onClick={() => void sendReset()} type="button" variant="outline">
          {sending && <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />}
          Send password-reset email
        </Button>
        {message && <p className="mt-3 text-sm text-emerald-700" role="status">{message}</p>}
        {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
      </div>
    </section>
  );
}
