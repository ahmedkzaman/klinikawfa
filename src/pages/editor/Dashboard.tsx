import { FileText, LayoutDashboard, ShieldCheck } from "lucide-react";

export default function EditorDashboard() {
  return (
    <section aria-labelledby="editor-dashboard-title" className="space-y-6">
      <div>
        <p className="text-sm font-medium text-blue-700">Website workspace</p>
        <h1 id="editor-dashboard-title" className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
          Website Editor
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Manage approved website content from one focused workspace. Editing tools will arrive in the next CMS plan.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <LayoutDashboard className="h-5 w-5 text-blue-600" aria-hidden="true" />
          <h2 className="mt-4 font-semibold text-slate-900">Focused access</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            This workspace is separate from clinic and staff operations.
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <ShieldCheck className="h-5 w-5 text-blue-600" aria-hidden="true" />
          <h2 className="mt-4 font-semibold text-slate-900">Controlled publishing</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Content controls will be introduced incrementally with the CMS plan.
          </p>
        </article>
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
        <FileText className="h-5 w-5 shrink-0" aria-hidden="true" />
        <p>Choose a section in the navigation to see what is planned next.</p>
      </div>
    </section>
  );
}
