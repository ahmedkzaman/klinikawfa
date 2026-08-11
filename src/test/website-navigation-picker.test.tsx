import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DestinationPicker } from "@/components/editor/navigation/DestinationPicker";
import type { WebsiteDestination } from "@/features/website-cms/catalogue/domain";

const destinations: WebsiteDestination[] = [
  { id: "service-1", type: "service", titleMs: "Rawatan Umum", titleEn: "General Treatment", href: "/services/rawatan-am", editHref: "/editor/services/service-1", status: "published", updatedAt: null },
  { id: "post-1", type: "post", titleMs: "Demam", titleEn: "Fever", href: "/health-tips/demam", editHref: "/editor/posts/post-1", status: "draft", updatedAt: null },
  { id: "page-1", type: "page", titleMs: "Lama", titleEn: "Old", href: "/pages/old", editHref: "/editor/pages/page-1", status: "trash", updatedAt: null },
];

describe("navigation destination picker", () => {
  it("groups selectable pages, marks non-published targets, and omits Trash", () => {
    const onSelect = vi.fn();
    render(<DestinationPicker destinations={destinations} value="" onSelect={onSelect} />);
    expect(screen.getByRole("option", { name: "Rawatan Umum — /services/rawatan-am" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Demam — /health-tips/demam (draft)" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Lama/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Choose website page"), { target: { value: "/services/rawatan-am" } });
    expect(onSelect).toHaveBeenCalledWith(destinations[0]);
  });
});
