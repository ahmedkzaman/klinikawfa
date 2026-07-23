import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  PublicClosingCta,
  PublicPageHeader,
  PublicSectionHeader,
} from "@/components/public";
import { LanguageProvider } from "@/contexts/LanguageContext";

function renderClosingCta(language: "ms" | "en" = "ms") {
  localStorage.setItem("klinik-awfa-language", language);
  return render(
    <LanguageProvider>
      <PublicClosingCta
        title="Kami di sini"
        description="Hubungi klinik."
      />
    </LanguageProvider>,
  );
}

afterEach(() => {
  localStorage.clear();
});

describe("public presentation components", () => {
  it("renders one page heading with supporting copy", () => {
    render(
      <PublicPageHeader
        eyebrow="Klinik Awfa"
        title="Perkhidmatan"
        description="Rawatan untuk keluarga."
      />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Perkhidmatan" }),
    ).toBeVisible();
    expect(screen.getByText("Rawatan untuk keluarga.")).toBeVisible();
  });

  it("uses an h2 for section headings", () => {
    render(<PublicSectionHeader title="Doktor Kami" />);

    expect(
      screen.getByRole("heading", { level: 2, name: "Doktor Kami" }),
    ).toBeVisible();
  });

  it("preserves appointment, WhatsApp, and phone actions", () => {
    renderClosingCta();

    expect(
      screen.getByRole("link", { name: /appointment|temujanji/i }),
    ).toHaveAttribute("href", "/appointment");
    expect(screen.getByRole("link", { name: /whatsapp/i })).toHaveAttribute(
      "target",
      "_blank",
    );
    expect(
      screen.getByRole("link", { name: /phone|hubungi/i }).getAttribute("href"),
    ).toMatch(/^tel:/);
  });

  it("uses a supplied appointment label without changing its destination", () => {
    render(
      <LanguageProvider>
        <PublicClosingCta
          title="Kami di sini"
          description="Hubungi klinik."
          appointmentLabel="Tempah Rawatan Saya"
        />
      </LanguageProvider>,
    );

    expect(
      screen.getByRole("link", { name: "Tempah Rawatan Saya" }),
    ).toHaveAttribute("href", "/appointment");
  });

  it("localizes every default action in Malay", () => {
    renderClosingCta("ms");

    expect(screen.getByRole("link", { name: "Buat Temujanji" })).toBeVisible();
    expect(screen.getByRole("link", { name: /^Hubungi / })).toBeVisible();
  });

  it("localizes every default action in English", async () => {
    renderClosingCta("en");

    expect(await screen.findByRole("link", { name: "Book Appointment" })).toBeVisible();
    expect(screen.getByRole("link", { name: /^Call / })).toBeVisible();
    expect(screen.queryByText("Buat Temujanji")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Hubungi / })).not.toBeInTheDocument();
  });

  it("uses the accessible WhatsApp foreground token", () => {
    renderClosingCta();

    expect(screen.getByRole("link", { name: /whatsapp/i })).toHaveClass(
      "bg-whatsapp",
      "text-whatsapp-foreground",
    );
  });
});
