import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EditorWorkspace } from "@/components/editor/workspace/EditorWorkspace";
import { PublishingSidebar } from "@/components/editor/workspace/PublishingSidebar";

describe("shared editor workspace", () => {
  it("shows bilingual completion, publishing actions, and bottom preview", () => {
    render(
      <EditorWorkspace
        title="Edit page"
        language="ms"
        onLanguageChange={vi.fn()}
        completeness={{
          ms: { complete: true, missing: [] },
          en: { complete: false, missing: ["Title"] },
        }}
        editor={<label>Page title<input /></label>}
        publishing={
          <PublishingSidebar
            status="draft"
            scheduledAt={null}
            revision={2}
            dirty
            busy={false}
            completeness={{
              ms: { complete: true, missing: [] },
              en: { complete: false, missing: ["Title"] },
            }}
            onSaveDraft={vi.fn()}
            onPreview={vi.fn()}
            onPublish={vi.fn()}
            onSchedule={vi.fn()}
            onTrash={vi.fn()}
          />
        }
        preview={<div>Preview content</div>}
      />,
    );

    expect(screen.getByRole("tab", { name: "Bahasa Melayu complete" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "English incomplete" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Save Draft" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Preview" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Schedule" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Live Preview" })).toBeVisible();
  });
});
