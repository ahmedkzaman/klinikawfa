import { ImagePlus, Loader2 } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { WebsiteMediaFolder } from "@/features/website-cms/media/validation";

export function WebsiteMediaUploader({
  folder,
  onUploaded,
}: {
  folder: WebsiteMediaFolder;
  onUploaded: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-2">
      <input
        accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
        className="sr-only"
        ref={inputRef}
        type="file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          setBusy(true);
          setError(null);
          void import("@/features/website-cms/media/uploadWebsiteMedia")
            .then(({ uploadWebsiteMedia }) => uploadWebsiteMedia(file, folder))
            .then(onUploaded)
            .catch((reason) =>
              setError(reason instanceof Error ? reason.message : "Upload failed."),
            )
            .finally(() => setBusy(false));
        }}
      />
      <Button
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        size="sm"
        type="button"
        variant="outline"
      >
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <ImagePlus className="mr-2 h-4 w-4" />
        )}
        Upload media
      </Button>
      <p className="mt-1 text-xs text-slate-500">
        Public website media only. Never upload patient or private material.
      </p>
      {error && (
        <p className="mt-1 text-xs text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
