import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WebsiteGridRenderer } from "@/components/website/WebsiteGridRenderer";
import type { WebsiteLayout } from "@/features/website-cms/layout/types";

const kinds = ["hero", "body"] as const;
const fallback: WebsiteLayout<(typeof kinds)[number]> = {
  version: 1,
  blocks: [
    {
      id: "hero",
      kind: "hero",
      contentRef: "hero",
      order: 0,
      hidden: false,
      desktop: { column: 1, width: 12, row: 1, height: 1 },
    },
    {
      id: "body",
      kind: "body",
      contentRef: "body",
      order: 1,
      hidden: false,
      desktop: { column: 1, width: 12, row: 2, height: 1 },
    },
  ],
};

describe("WebsiteGridRenderer", () => {
  it("renders semantic order with validated numeric placement variables", () => {
    const layout: WebsiteLayout<(typeof kinds)[number]> = {
      ...fallback,
      blocks: [
        { ...fallback.blocks[1], order: 0, desktop: { column: 5, width: 8, row: 1, height: 2 } },
        { ...fallback.blocks[0], order: 1, desktop: { column: 1, width: 4, row: 1, height: 2 } },
      ],
    };

    render(
      <WebsiteGridRenderer
        allowedKinds={kinds}
        fallbackLayout={fallback}
        layout={layout}
        renderBlock={{
          hero: () => <div>Hero</div>,
          body: () => <div>Body</div>,
        }}
      />,
    );

    const blocks = screen.getAllByTestId("website-grid-block");
    expect(blocks.map((block) => block.textContent)).toEqual(["Body", "Hero"]);
    expect(blocks[0].getAttribute("style")).toContain("--website-grid-column: 5");
    expect(blocks[0].getAttribute("style")).toContain("--website-grid-width: 8");
  });

  it("omits hidden blocks", () => {
    render(
      <WebsiteGridRenderer
        allowedKinds={kinds}
        fallbackLayout={fallback}
        layout={{
          ...fallback,
          blocks: [
            { ...fallback.blocks[0], hidden: true },
            fallback.blocks[1],
          ],
        }}
        renderBlock={{
          hero: () => <div>Hero</div>,
          body: () => <div>Body</div>,
        }}
      />,
    );

    expect(screen.queryByText("Hero")).not.toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
  });

  it("falls back safely when supplied layout data is invalid", () => {
    render(
      <WebsiteGridRenderer
        allowedKinds={kinds}
        fallbackLayout={fallback}
        layout={{ ...fallback, css: "position:fixed" } as never}
        renderBlock={{
          hero: () => <div>Hero</div>,
          body: () => <div>Body</div>,
        }}
      />,
    );

    expect(screen.getAllByTestId("website-grid-block").map((block) => block.textContent))
      .toEqual(["Hero", "Body"]);
  });
});
