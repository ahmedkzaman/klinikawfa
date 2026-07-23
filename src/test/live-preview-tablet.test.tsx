import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LivePreview } from "@/components/editor/LivePreview";

describe("LivePreview tablet viewport", () => {
  it("offers a sandboxed 768-pixel tablet preview", () => {
    render(
      <LivePreview title="Page preview">
        <p>Preview content</p>
      </LivePreview>,
    );

    fireEvent.load(screen.getByTestId("live-preview-frame"));
    fireEvent.click(screen.getByRole("button", { name: "Tablet 768 px" }));

    expect(screen.getByTestId("live-preview-frame")).toHaveAttribute(
      "data-preview-mode",
      "tablet",
    );
    expect(screen.getByTestId("live-preview-frame")).toHaveAttribute(
      "data-preview-width",
      "768",
    );
    expect(screen.getByTestId("live-preview-frame")).toHaveAttribute(
      "sandbox",
      "allow-same-origin",
    );
  });
});
