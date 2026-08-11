import { readFileSync } from "node:fs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "@/contexts/LanguageContext";
import AppointmentBooking from "@/pages/AppointmentBooking";

vi.mock("@/components/layout", () => ({ MainLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/seo", () => ({ SEOHead: () => null }));
vi.mock("@/components/seo/PublicPageSchema", () => ({ PublicPageSchema: () => null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ order: async () => ({ data: [], error: null }) }) }) },
}));

describe("public appointment and terms routes", () => {
  it("renders appointment content inside the language provider", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <LanguageProvider><MemoryRouter><AppointmentBooking /></MemoryRouter></LanguageProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByRole("heading", { name: "Book Your Appointment" })).toBeInTheDocument();
  });

  it("registers a dedicated public Terms route before the catch-all", () => {
    const source = readFileSync("src/App.tsx", "utf8");
    expect(source).toMatch(/<Route path="\/terms" element=\{<TermsPage \/>\} \/>/);
    expect(source.indexOf('path="/terms"')).toBeLessThan(source.indexOf('path="*"'));
  });
});
