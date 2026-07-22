import { CheckCircle2, CircleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

export interface LanguageCompleteness {
  ms: { complete: boolean; missing: string[] };
  en: { complete: boolean; missing: string[] };
}

interface EditorLanguageTabsProps {
  completeness: LanguageCompleteness;
  language: "ms" | "en";
  onLanguageChange(language: "ms" | "en"): void;
}

const languages = [
  { code: "ms" as const, label: "Bahasa Melayu" },
  { code: "en" as const, label: "English" },
];

export function EditorLanguageTabs({
  completeness,
  language,
  onLanguageChange,
}: EditorLanguageTabsProps) {
  return (
    <div
      aria-label="Content language"
      className="inline-flex w-full gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 sm:w-auto"
      role="tablist"
    >
      {languages.map(({ code, label }) => {
        const complete = completeness[code].complete;
        const missing = completeness[code].missing;
        return (
          <button
            aria-controls={`editor-language-panel-${code}`}
            aria-label={`${label} ${complete ? "complete" : "incomplete"}`}
            aria-selected={language === code}
            className={cn(
              "flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition sm:flex-none",
              language === code
                ? "bg-white text-slate-950 shadow-sm"
                : "text-slate-600 hover:bg-white/60 hover:text-slate-900",
            )}
            id={`editor-language-tab-${code}`}
            key={code}
            onClick={() => onLanguageChange(code)}
            role="tab"
            title={missing.length ? `Missing: ${missing.join(", ")}` : "All required fields complete"}
            type="button"
          >
            {complete ? (
              <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-emerald-600" />
            ) : (
              <CircleAlert aria-hidden="true" className="h-4 w-4 text-amber-600" />
            )}
            {label}
          </button>
        );
      })}
    </div>
  );
}
