import { useRef, useState, useMemo, useCallback } from "react";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  onUploadStateChange?: (isUploading: boolean) => void;
  placeholder?: string;
}

const sanitizeName = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/-+/g, "-");

export function RichTextEditor({
  value,
  onChange,
  onUploadStateChange,
  placeholder,
}: RichTextEditorProps) {
  const quillRef = useRef<ReactQuill | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const setUploadState = (state: boolean) => {
    setIsUploading(state);
    onUploadStateChange?.(state);
  };

  const uploadFile = async (file: File, type: "image" | "video") => {
    try {
      setUploadState(true);
      const filePath = `landing-pages/inline/${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 8)}-${sanitizeName(file.name)}`;
      const { error: uploadError } = await supabase.storage
        .from("clinic-assets")
        .upload(filePath, file, { cacheControl: "3600", upsert: false });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("clinic-assets").getPublicUrl(filePath);
      return data.publicUrl;
    } catch (error: any) {
      toast.error(`Failed to upload ${type}: ${error?.message || "Unknown error"}`);
      return null;
    } finally {
      setUploadState(false);
    }
  };

  const imageHandler = useCallback(() => {
    const input = document.createElement("input");
    input.setAttribute("type", "file");
    input.setAttribute("accept", "image/*");
    input.click();
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const url = await uploadFile(file, "image");
      if (url && quillRef.current) {
        const editor = quillRef.current.getEditor();
        const range = editor.getSelection(true);
        editor.insertEmbed(range.index, "image", url, "user");
        editor.setSelection(range.index + 1, 0);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const videoHandler = useCallback(() => {
    const input = document.createElement("input");
    input.setAttribute("type", "file");
    input.setAttribute("accept", "video/*");
    input.click();
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const url = await uploadFile(file, "video");
      if (url && quillRef.current) {
        const editor = quillRef.current.getEditor();
        const range = editor.getSelection(true);
        editor.clipboard.dangerouslyPasteHTML(
          range.index,
          `<p><video controls src="${url}" style="max-width:100%;height:auto;border-radius:8px;"></video></p>`,
          "user",
        );
        editor.setSelection(range.index + 1, 0);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const modules = useMemo(
    () => ({
      toolbar: {
        container: [
          [{ header: [1, 2, 3, false] }],
          ["bold", "italic", "underline", "strike"],
          [{ list: "ordered" }, { list: "bullet" }],
          ["link", "image", "video"],
          ["clean"],
        ],
        handlers: {
          image: imageHandler,
          video: videoHandler,
        },
      },
      clipboard: { matchVisual: false },
    }),
    [imageHandler, videoHandler],
  );

  const formats = [
    "header",
    "bold",
    "italic",
    "underline",
    "strike",
    "list",
    "bullet",
    "link",
    "image",
    "video",
  ];

  return (
    <div className="relative rich-text-editor-wrapper">
      {isUploading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-sm rounded-md">
          <div className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 shadow-md border">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-sm font-medium">Uploading media...</span>
          </div>
        </div>
      )}
      <ReactQuill
        ref={quillRef}
        theme="snow"
        value={value}
        onChange={onChange}
        modules={modules}
        formats={formats}
        placeholder={placeholder}
      />
    </div>
  );
}
