import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LayoutEditor } from "@/components/editor/layout/LayoutEditor";
import type { WebsiteLayout } from "@/features/website-cms/layout/types";

const kinds = ["hero", "body"] as const;
const layout: WebsiteLayout<(typeof kinds)[number]> = {
  version: 1,
  blocks: [
    {
      id: "hero",
      kind: "hero",
      contentRef: "hero",
      order: 0,
      hidden: false,
      desktop: { column: 1, width: 6, row: 1, height: 1 },
    },
    {
      id: "body",
      kind: "body",
      contentRef: "body",
      order: 1,
      hidden: false,
      desktop: { column: 7, width: 6, row: 1, height: 1 },
    },
  ],
};

function renderEditor(onChange = vi.fn()) {
  return {
    onChange,
    ...render(
      <LayoutEditor
        allowedKinds={kinds}
        blockLabels={{ hero: "Hero", body: "Main content" }}
        layout={layout}
        onChange={onChange}
        protectedBlockIds={new Set(["hero"])}
      />,
    ),
  };
}

describe("LayoutEditor", () => {
  it("moves and resizes the selected block with keyboard controls", () => {
    const { onChange } = renderEditor();
    const hero = screen.getByRole("button", { name: /Hero block/i });

    fireEvent.keyDown(hero, { key: "ArrowDown" });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        blocks: expect.arrayContaining([
          expect.objectContaining({
            id: "hero",
            desktop: expect.objectContaining({ row: 2 }),
          }),
        ]),
      }),
    );

    fireEvent.keyDown(screen.getByRole("button", { name: /Hero block/i }), {
      key: "ArrowDown",
      shiftKey: true,
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        blocks: expect.arrayContaining([
          expect.objectContaining({
            id: "hero",
            desktop: expect.objectContaining({ height: 2 }),
          }),
        ]),
      }),
    );
  });

  it("announces invalid collisions without changing the layout", () => {
    const { onChange } = renderEditor();
    const body = screen.getByRole("button", { name: /Main content block/i });

    fireEvent.keyDown(body, { key: "ArrowLeft" });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(/overlap/i);
  });

  it("supports hide, semantic reorder, undo, redo, and presets", () => {
    const { onChange } = renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "Hide Main content" }));
    expect(onChange).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Show Main content" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Move Main content up" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        blocks: [
          expect.objectContaining({ id: "body", order: 0 }),
          expect.objectContaining({ id: "hero", order: 1 }),
        ],
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Undo layout change" }));
    fireEvent.click(screen.getByRole("button", { name: "Redo layout change" }));
    fireEvent.click(screen.getByRole("button", { name: "Two equal columns" }));

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        blocks: [
          expect.objectContaining({ desktop: expect.objectContaining({ column: 1, width: 6 }) }),
          expect.objectContaining({ desktop: expect.objectContaining({ column: 7, width: 6 }) }),
        ],
      }),
    );
  });

  it("does not permit deletion of a protected block", () => {
    renderEditor();

    expect(screen.getByRole("button", { name: "Delete Hero" })).toBeDisabled();
  });
});
