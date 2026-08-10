import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mocks.from,
    rpc: mocks.rpc,
    storage: { from: vi.fn() },
  },
}));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/components/admin/RichTextEditor", () => ({
  RichTextEditor: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <textarea aria-label="Description / Page Content" value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));

import LandingPages from "@/pages/staff/admin/LandingPages";

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <LandingPages />
    </QueryClientProvider>,
  );
}

describe("landing page mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({
      select: vi.fn(() => ({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    });
    mocks.rpc.mockResolvedValue({ data: "11111111-1111-4111-8111-111111111111", error: null });
  });

  it("creates a landing page through the guarded RPC instead of direct table writes", async () => {
    renderPage();
    await screen.findByText("No landing pages found. Create one to get started.");
    fireEvent.click(screen.getByRole("button", { name: /create new landing page/i }));
    fireEvent.change(screen.getByLabelText("Title (H1)"), { target: { value: "Home Visit" } });
    fireEvent.change(screen.getByLabelText("URL Slug"), { target: { value: "home-visit-kuantan" } });
    fireEvent.change(screen.getByLabelText("Description / Page Content"), { target: { value: "<p>Home visit information.</p>" } });
    fireEvent.change(screen.getByPlaceholderText("Item 1"), { target: { value: "Doctor assessment" } });
    fireEvent.click(screen.getByRole("button", { name: /save landing page/i }));

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("save_clinic_landing_page", {
      p_id: null,
      p_slug: "home-visit-kuantan",
      p_title: "Home Visit",
      p_description: "<p>Home visit information.</p>",
      p_call_to_action: "Book Appointment",
      p_hero_image_url: null,
      p_promo_video_url: null,
      p_services_list: ["Doctor assessment"],
    }));
    expect(mocks.success).toHaveBeenCalledWith("Landing page created successfully");
  });
});
