import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PageSection } from "@/features/website-cms/sections/schema";
import { MediaSelectorDialog } from "@/components/editor/media/MediaSelectorDialog";

interface SectionEditorProps {
  language: "ms" | "en";
  section: PageSection;
  onChange(section: PageSection): void;
}

export function SectionEditor({ language, section, onChange }: SectionEditorProps) {
  const record = section as unknown as Record<string, unknown>;
  const suffix = language === "ms" ? "Ms" : "En";
  const update = (key: string, value: unknown) => onChange({ ...section, [key]: value } as PageSection);
  const fields = ["heading", "title", "body", "content", "buttonLabel"]
    .map((base) => `${base}${suffix}`)
    .filter((key) => key in record);

  return (
    <div className="grid gap-4 border-t border-slate-100 p-4 md:grid-cols-2">
      {fields.map((key) => {
        const multiline = key.startsWith("body") || key.startsWith("content");
        const id = `section-${section.id}-${key}`;
        return (
          <div className={multiline ? "md:col-span-2" : ""} key={key}>
            <Label htmlFor={id}>{key.replace(/(Ms|En)$/, "").replace(/([A-Z])/g, " $1").trim()}</Label>
            {multiline ? (
              <Textarea className="mt-2" id={id} onChange={(event) => update(key, event.target.value)} rows={5} value={String(record[key] ?? "")} />
            ) : (
              <Input className="mt-2" id={id} onChange={(event) => update(key, event.target.value)} value={String(record[key] ?? "")} />
            )}
          </div>
        );
      })}
      {"url" in record && (
        <div className="md:col-span-2">
          <Label htmlFor={`section-${section.id}-url`}>YouTube URL</Label>
          <Input className="mt-2" id={`section-${section.id}-url`} onChange={(event) => update("url", event.target.value)} type="url" value={String(record.url ?? "")} />
        </div>
      )}
      {"href" in record && (
        <div className="md:col-span-2">
          <Label htmlFor={`section-${section.id}-href`}>Button link</Label>
          <Input className="mt-2" id={`section-${section.id}-href`} onChange={(event) => update("href", event.target.value)} value={String(record.href ?? "")} />
        </div>
      )}
      {"mediaId" in record && (
        <div className="space-y-2 md:col-span-2">
          <Label>Section image</Label>
          {Boolean(record.mediaUrl) && <img alt={String(record[language === "ms" ? "mediaAltMs" : "mediaAltEn"] ?? "")} className="max-h-48 rounded-lg object-cover" src={String(record.mediaUrl)} />}
          <MediaSelectorDialog folder="pages" label="Choose image" onSelect={(media) => onChange({
            ...section,
            mediaId: media.id,
            mediaUrl: media.publicUrl,
            mediaAltMs: media.altMs,
            mediaAltEn: media.altEn,
          } as PageSection)} />
        </div>
      )}
    </div>
  );
}
