import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SeoPanel } from "@/components/editor/seo/SeoPanel";
import { emptySeoFields } from "@/features/website-cms/domain/seo";

describe("SEO editor", () => {
  it("shows safe previews and character guidance", () => {
    const onChange = vi.fn();
    render(<SeoPanel language="en" onChange={onChange} value={{ ...emptySeoFields, title: "Klinik Awfa" }} />);
    expect(screen.getByLabelText("Search title")).toHaveValue("Klinik Awfa");
    expect(screen.getByText("11 / 60 characters")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Canonical URL"), { target: { value: "https://klinikawfa.com/services" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ canonicalUrl: "https://klinikawfa.com/services" }));
  });
});
