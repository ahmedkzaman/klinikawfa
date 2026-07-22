export function EditorSectionScaffold({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h1>
        <p className="text-sm text-slate-600">{description}</p>
      </div>
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600 shadow-sm">
        No content has been added yet.
      </div>
    </section>
  );
}
