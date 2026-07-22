import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SectionList } from "@/components/editor/sections/SectionList";
import { SectionEditor } from "@/components/editor/sections/SectionEditor";
import { PAGE_SECTION_REGISTRY } from "@/features/website-cms/sections/registry";
import { pageSectionSchema } from "@/features/website-cms/sections/schema";

describe("guided page sections", () => {
  it("accepts a safe bilingual hero", () => {
    expect(pageSectionSchema.parse({
      id: crypto.randomUUID(),
      type: "hero",
      visible: true,
      spacing: "normal",
      headingMs: "Klinik Keluarga Anda",
      headingEn: "Your Family Clinic",
      bodyMs: "Rawatan yang dipercayai.",
      bodyEn: "Trusted care.",
      mediaId: null,
      alignment: "left",
    })).toMatchObject({ type: "hero", visible: true });
  });

  it("rejects executable and unknown section types", () => {
    expect(pageSectionSchema.safeParse({ type: "script", code: "alert(1)" }).success).toBe(false);
  });

  it("restricts YouTube embeds to approved hosts", () => {
    const common = {
      id: crypto.randomUUID(),
      type: "youtube",
      visible: true,
      spacing: "normal",
      titleMs: "Video klinik",
      titleEn: "Clinic video",
    } as const;
    expect(pageSectionSchema.safeParse({ ...common, url: "https://youtu.be/dQw4w9WgXcQ" }).success).toBe(true);
    expect(pageSectionSchema.safeParse({ ...common, url: "https://evil.example/watch?v=dQw4w9WgXcQ" }).success).toBe(false);
  });

  it("registers all approved guided section types", () => {
    expect(Object.keys(PAGE_SECTION_REGISTRY)).toEqual([
      "hero", "rich_text", "image_text", "services", "team", "gallery",
      "reviews", "cta", "youtube", "faq", "contact",
    ]);
  });

  it("rejects protocol-relative media and call-to-action URLs", () => {
    const common = {
      id: crypto.randomUUID(),
      visible: true,
      spacing: "normal",
    } as const;

    expect(pageSectionSchema.safeParse({
      ...common,
      type: "hero",
      headingMs: "Klinik Awfa",
      headingEn: "Klinik Awfa",
      bodyMs: "Rawatan dipercayai.",
      bodyEn: "Trusted care.",
      mediaId: null,
      mediaUrl: "//evil.example/tracker.webp",
      alignment: "left",
    }).success).toBe(false);

    expect(pageSectionSchema.safeParse({
      ...common,
      type: "cta",
      headingMs: "Buat temujanji",
      headingEn: "Book an appointment",
      bodyMs: "Hubungi kami.",
      bodyEn: "Contact us.",
      buttonLabelMs: "Tempah",
      buttonLabelEn: "Book",
      href: "//evil.example/phishing",
      alignment: "center",
    }).success).toBe(false);

    expect(pageSectionSchema.safeParse({
      ...common,
      type: "hero",
      headingMs: "Klinik Awfa",
      headingEn: "Klinik Awfa",
      bodyMs: "Rawatan dipercayai.",
      bodyEn: "Trusted care.",
      mediaId: null,
      mediaUrl: "/\\evil.example/tracker.webp",
      alignment: "left",
    }).success).toBe(false);

    expect(pageSectionSchema.safeParse({
      ...common,
      type: "cta",
      headingMs: "Buat temujanji",
      headingEn: "Book an appointment",
      bodyMs: "Hubungi kami.",
      bodyEn: "Contact us.",
      buttonLabelMs: "Tempah",
      buttonLabelEn: "Book",
      href: "/\\evil.example/phishing",
      alignment: "center",
    }).success).toBe(false);
  });

  it("offers Media Library selection for visual sections", () => {
    render(<SectionEditor language="ms" onChange={vi.fn()} section={{
      id: "e99e9efc-c6cc-4cc1-a86e-b629d21902cb",
      type: "hero",
      visible: true,
      spacing: "normal",
      headingMs: "Klinik Awfa",
      headingEn: "Klinik Awfa",
      bodyMs: "",
      bodyEn: "",
      mediaId: null,
      mediaUrl: "",
      mediaAltMs: "",
      mediaAltEn: "",
      alignment: "left",
    }} />);
    expect(screen.getByRole("button", { name: "Choose image" })).toBeVisible();
  });

  it("duplicates sections with a new id without publishing", () => {
    const onChange = vi.fn();
    render(<SectionList language="ms" onChange={onChange} sections={[{
      id: "e99e9efc-c6cc-4cc1-a86e-b629d21902cb",
      type: "rich_text",
      visible: true,
      spacing: "normal",
      alignment: "left",
      contentMs: "Maklumat klinik",
      contentEn: "Clinic information",
    }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Duplicate Rich Text" }));
    const next = onChange.mock.calls[0][0];
    expect(next).toHaveLength(2);
    expect(next[1].id).not.toBe(next[0].id);
  });
});
