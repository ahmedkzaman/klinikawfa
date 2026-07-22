import type { ReactNode } from "react";

import { LivePreview } from "@/components/editor/LivePreview";

import { EditorLanguageTabs, type LanguageCompleteness } from "./EditorLanguageTabs";

interface EditorWorkspaceProps {
  title: string;
  description?: string;
  language: "ms" | "en";
  onLanguageChange(language: "ms" | "en"): void;
  completeness: LanguageCompleteness;
  editor: ReactNode;
  publishing: ReactNode;
  preview: ReactNode;
}

export function EditorWorkspace({
  title,
  description,
  language,
  onLanguageChange,
  completeness,
  editor,
  publishing,
  preview,
}: EditorWorkspaceProps) {
  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">{title}</h1>
          {description && <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>}
        </div>
        <EditorLanguageTabs completeness={completeness} language={language} onLanguageChange={onLanguageChange} />
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <main
          aria-labelledby={`editor-language-tab-${language}`}
          className="min-w-0"
          id={`editor-language-panel-${language}`}
          role="tabpanel"
        >
          {editor}
        </main>
        <div className="lg:sticky lg:top-5">{publishing}</div>
      </div>

      <section aria-label="Live Preview" className="border-t border-slate-200 pt-8" role="region">
        <LivePreview title="Live Preview">{preview}</LivePreview>
      </section>
    </div>
  );
}
