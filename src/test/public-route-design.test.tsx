import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import Doctors from "@/pages/Doctors";
import DoctorOnDuty from "@/pages/DoctorOnDuty";
import Gallery from "@/pages/Gallery";
import HealthTips from "@/pages/HealthTips";
import BlogPost from "@/pages/BlogPost";
import NotFound from "@/pages/NotFound";
import Services from "@/pages/Services";
import ServiceDetail from "@/pages/ServiceDetail";
import AppointmentBooking from "@/pages/AppointmentBooking";
import Auth from "@/pages/Auth";
import ResetPassword from "@/pages/ResetPassword";
import LocumRegister from "@/pages/auth/LocumRegister";
import { GalleryLightbox } from "@/components/gallery/GalleryLightbox";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { SERVICES } from "@/lib/constants";
import { resolveServiceCategorySlug } from "@/lib/serviceSlugMap";

vi.mock("@/components/layout", () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/layout/MainLayout", () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/seo", () => ({ SEOHead: () => null, ArticleSchema: () => null }));
vi.mock("@/components/seo/SEOHead", () => ({ SEOHead: () => null }));

const publicRouteState = vi.hoisted(() => ({
  teamMembersResponse: Promise.resolve({ data: null, error: null }),
  dutyResponse: Promise.resolve({ data: [], error: null }),
  doctorPhotosResponse: Promise.resolve({ data: [], error: null }),
}));

const publicContentState = vi.hoisted(() => ({
  gallery: {
    images: [],
    isLoading: false,
    error: null,
  },
  posts: {
    posts: [],
    totalPages: 1,
    isLoading: false,
    categories: [],
    categoriesLoading: false,
  },
  post: {
    data: null,
    isLoading: false,
    error: null,
  },
}));

const authFormState = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  resetPassword: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: null,
    role: null,
    rolesLoading: false,
    loading: false,
    signIn: authFormState.signIn,
    signUp: authFormState.signUp,
    resetPassword: authFormState.resetPassword,
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: authFormState.toast }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: () => publicRouteState.dutyResponse,
    from: (table: string) => ({
      select: () => ({
        eq: (column: string) => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
          order: () => publicRouteState.teamMembersResponse,
          then: (resolve: (value: unknown) => unknown) =>
            Promise.resolve(
              table === "team_members" && column === "type"
                ? publicRouteState.doctorPhotosResponse
                : { data: null, error: null },
            ).then(resolve),
        }),
        order: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      getSession: () => Promise.resolve({ data: { session: null } }),
      setSession: () => Promise.resolve({ data: { session: null } }),
      updateUser: () => Promise.resolve({ error: null }),
      signOut: () => Promise.resolve({ error: null }),
      signUp: () => Promise.resolve({ error: null }),
    },
  },
}));

vi.mock("@/hooks/useGalleryImages", () => ({
  GALLERY_CATEGORIES: [
    { id: "all", labelMs: "Semua", labelEn: "All", tags: [] },
    { id: "waiting", labelMs: "Ruang Menunggu & Zon Kanak-kanak", labelEn: "Waiting Area & Kids Zone", tags: ["waiting"] },
    { id: "treatment", labelMs: "Bilik Rawatan", labelEn: "Treatment Rooms", tags: ["treatment"] },
  ],
  useGalleryImages: () => publicContentState.gallery,
}));

vi.mock("@/hooks/useBlogPosts", () => ({
  useBlogPosts: () => publicContentState.posts,
  useBlogPost: () => publicContentState.post,
}));

vi.mock("@/components/blog", () => ({
  BlogCard: ({ post }: { post: { title: string } }) => <article>{post.title}</article>,
  BlogPagination: () => null,
  BlogSearch: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <input aria-label="Search articles" value={value} onChange={(event) => onChange(event.target.value)} />
  ),
  MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div>,
  RelatedPosts: () => null,
  ShareButtons: () => null,
}));

function renderServices() {
  return render(
    <MemoryRouter>
      <LanguageProvider>
        <Services />
      </LanguageProvider>
    </MemoryRouter>,
  );
}

function renderDoctors() {
  return render(
    <MemoryRouter>
      <LanguageProvider>
        <Doctors />
      </LanguageProvider>
    </MemoryRouter>,
  );
}

function renderDutyRoster() {
  return render(
    <MemoryRouter>
      <LanguageProvider>
        <DoctorOnDuty />
      </LanguageProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  publicRouteState.teamMembersResponse = Promise.resolve({ data: null, error: null });
  publicRouteState.dutyResponse = Promise.resolve({ data: [], error: null });
  publicRouteState.doctorPhotosResponse = Promise.resolve({ data: [], error: null });
  publicContentState.gallery = { images: [], isLoading: false, error: null };
  publicContentState.posts = {
    posts: [], totalPages: 1, isLoading: false, categories: [], categoriesLoading: false,
  };
  publicContentState.post = { data: null, isLoading: false, error: null };
});

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

describe("public service routes", () => {
  it("keeps one page heading and every service link", () => {
    renderServices();

    expect(screen.getByRole("heading", { level: 1, name: /services|perkhidmatan/i })).toBeVisible();
    const links = screen.getAllByRole("link");
    for (const service of SERVICES) {
      const serviceLink = links.find((link) => new RegExp(escapeRegExp(service.titleMs), "i").test(link.textContent || ""));
      expect(serviceLink).toHaveAttribute("href", `/services/${service.slug}`);
    }
  });

  it("continues to resolve the three canonical service aliases", () => {
    expect(resolveServiceCategorySlug("pemeriksaan-kesihatan")).toBe("pemeriksaan-kesihatan");
    expect(resolveServiceCategorySlug("prosedur-kecil")).toBe("prosedur-minor");
    expect(resolveServiceCategorySlug("rawatan-umum")).toBe("rawatan-am");
  });

  it("keeps unknown slugs on the 404 route", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter initialEntries={["/services/does-not-exist"]}>
        <LanguageProvider>
          <QueryClientProvider client={queryClient}>
            <Routes>
              <Route path="/services/:slug" element={<ServiceDetail />} />
            </Routes>
          </QueryClientProvider>
        </LanguageProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { level: 1, name: /404.*service not found/i })).toBeVisible();
  });

  it("uses the shared public presentation and preserves sanitized rich HTML", () => {
    const servicesSource = readFileSync(resolve(process.cwd(), "src/pages/Services.tsx"), "utf8");
    const detailSource = readFileSync(resolve(process.cwd(), "src/pages/ServiceDetail.tsx"), "utf8");

    expect(servicesSource).toContain("<PublicPageHeader");
    expect(servicesSource).toContain("<PublicClosingCta");
    expect(detailSource).toContain("<PublicPageHeader");
    expect(detailSource).toContain("<PublicClosingCta");
    expect(detailSource).toContain("appointmentLabel={callToAction}");
    expect(detailSource).toContain('sanitizeRichHtml(service.description || "")');
  });
});

describe("public doctor routes", () => {
  it("renders one doctor heading and its loading state before team data resolves", () => {
    publicRouteState.teamMembersResponse = new Promise(() => {});

    const { container } = renderDoctors();

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: /doctors who put you first|doktor yang mengutamakan anda/i })).toBeVisible();
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("renders fallback doctor role, qualifications, and sample-data status", async () => {
    publicRouteState.teamMembersResponse = Promise.resolve({ data: [], error: null });

    renderDoctors();

    expect((await screen.findAllByText(/general medical practitioner|pengamal perubatan am/i)).length).toBeGreaterThan(0);
    expect(screen.getAllByText("MBBS").length).toBeGreaterThan(0);
    expect(screen.getByRole("status")).toHaveTextContent(/this is sample data|ini adalah data contoh/i);
  });

  it("renders localized accessible duty-date controls at the 44px target", async () => {
    renderDutyRoster();

    expect(await screen.findByRole("button", { name: /previous day|hari sebelumnya/i })).toHaveClass("h-11", "w-11");
    expect(screen.getByRole("button", { name: /next day|hari seterusnya/i })).toHaveClass("h-11", "w-11");
  });

  it("keeps the back-to-today date control at the 44px target", async () => {
    publicRouteState.dutyResponse = new Promise(() => {});
    publicRouteState.doctorPhotosResponse = new Promise(() => {});
    renderDutyRoster();

    fireEvent.click(await screen.findByRole("button", { name: /next day|hari seterusnya/i }));

    expect(screen.getByRole("button", { name: /back to today|kembali ke hari ini/i })).toHaveClass("min-h-11");
  });

  it("uses shared headers while retaining doctor and duty-route contracts", () => {
    const doctorsSource = readFileSync(resolve(process.cwd(), "src/pages/Doctors.tsx"), "utf8");
    const dutySource = readFileSync(resolve(process.cwd(), "src/pages/DoctorOnDuty.tsx"), "utf8");

    expect(doctorsSource).toContain("<PublicPageHeader");
    expect(dutySource).toContain("<PublicPageHeader");
    expect(doctorsSource).toContain("name_ms: 'Dr. Ahmad'");
    expect(doctorsSource).toContain("name_en: 'Dr. Nurul'");
    expect(doctorsSource).toContain("qualifications: ['MBBS', 'Family Medicine']");
    expect(doctorsSource).toContain("qualifications: ['MBBS', 'Pediatric Care']");
    expect(doctorsSource).toContain("usingMockData &&");
    expect(doctorsSource).toContain("This is sample data. Actual data will be updated soon.");
    expect(doctorsSource).toContain("Loader2");
    expect(doctorsSource).toContain("alt={language === 'ms' ? doctor.name_ms : doctor.name_en}");
    expect(dutySource).toContain("get_doctors_on_duty");
    expect(dutySource).toContain("setDate(d => addDays(d, -1))");
    expect(dutySource).toContain("setDate(d => addDays(d, 1))");
    expect(dutySource).toContain("setDate(new Date())");
    expect(dutySource).toContain("href={`tel:${CLINIC_INFO.phone}`}");
    expect(dutySource).toContain("href={CLINIC_INFO.whatsapp}");
  });
});

describe("public content routes", () => {
  it("renders one shared gallery heading and localized filter labels", () => {
    render(
      <MemoryRouter>
        <LanguageProvider>
          <Gallery />
        </LanguageProvider>
      </MemoryRouter>,
    );

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Galeri" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Semua" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Ruang Menunggu & Zon Kanak-kanak" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Bilik Rawatan" })).toBeVisible();
    expect(screen.queryByText("Suasana Klinik")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Pilih kategori untuk melihat ruang dan aktiviti kami."),
    ).not.toBeInTheDocument();
  });

  it("preserves the baseline gallery error without an invented heading", () => {
    publicContentState.gallery = {
      images: [],
      isLoading: false,
      error: new Error("gallery unavailable"),
    };

    render(
      <MemoryRouter>
        <LanguageProvider>
          <Gallery />
        </LanguageProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText("Ralat memuatkan galeri. Sila cuba lagi.")).toBeVisible();
    expect(screen.queryByText("Galeri tidak tersedia")).not.toBeInTheDocument();
    expect(screen.queryByText("Gallery unavailable")).not.toBeInTheDocument();
  });

  it("renders a labelled 44px lightbox close control", () => {
    render(
      <GalleryLightbox
        images={[{ id: "gallery-1", url: "/gallery-1.webp", alt_text: "Clinic room" }] as never}
        currentIndex={0}
        open
        onIndexChange={() => undefined}
        onOpenChange={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: "Close" })).toHaveClass("h-11", "w-11");
  });

  it("renders an article title and published date through the shared page header", () => {
    publicContentState.post = {
      data: {
        id: "post-1",
        slug: "family-care",
        title: "Family care",
        title_ms: "Penjagaan keluarga",
        title_en: "Family care",
        content: "Article body",
        content_ms: "Isi artikel",
        content_en: "Article body",
        excerpt_ms: "Panduan keluarga",
        excerpt_en: "Family guide",
        published_at: "2026-01-15T00:00:00.000Z",
        reading_time: 3,
        featured_image: null,
        category: null,
        category_id: null,
      },
      isLoading: false,
      error: null,
    };

    render(
      <MemoryRouter initialEntries={["/health-tips/family-care"]}>
        <LanguageProvider>
          <BlogPost />
        </LanguageProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Penjagaan keluarga" })).toBeVisible();
    expect(screen.getByText((text) => text.includes("2026"))).toBeVisible();
  });

  it("preserves the existing health-tips hierarchy without invented section copy", () => {
    render(
      <MemoryRouter>
        <LanguageProvider>
          <HealthTips />
        </LanguageProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Tips Kesihatan" })).toBeVisible();
    expect(screen.queryByText("Panduan keluarga")).not.toBeInTheDocument();
    expect(screen.queryByText("Artikel terkini")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Baca panduan yang disusun untuk penjagaan seisi keluarga."),
    ).not.toBeInTheDocument();
  });

  it("keeps the catch-all recovery link pointed to home", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <MemoryRouter initialEntries={["/missing"]}>
        <NotFound />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Return to Home" })).toHaveAttribute("href", "/");
    expect(screen.queryByText("Page not found")).not.toBeInTheDocument();
    consoleError.mockRestore();
  });
});

describe("public booking and authentication form presentation", () => {
  it("renders the booking labels, progress, and a 44px primary step action", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <AppointmentBooking />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByLabelText("Full Name")).toHaveAttribute("name", "patient_name");
    expect(screen.getByLabelText("Phone Number")).toHaveAttribute("name", "patient_phone");
    expect(screen.getByLabelText("IC Number (MyKad, 12 digits)")).toHaveAttribute("name", "patient_ic");
    expect(screen.getByRole("progressbar", { name: "Booking progress" })).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByRole("button", { name: "Next" })).toHaveClass("min-h-11");
    expect(screen.queryByText("Appointments")).not.toBeInTheDocument();
  });

  it("connects Auth fields and validation metadata to their inputs", async () => {
    render(
      <MemoryRouter>
        <LanguageProvider>
          <Auth />
        </LanguageProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /daftar|sign up/i }));
    expect(screen.getByLabelText(/nama penuh|full name/i)).toHaveAttribute("name", "fullName");
    expect(screen.getByLabelText("Email")).toHaveAttribute("name", "email");
    expect(screen.getByLabelText(/kata laluan|password/i)).toHaveAttribute("name", "password");
    expect(screen.getByRole("button", { name: /daftar|sign up/i })).toHaveClass("min-h-11");

    fireEvent.click(screen.getByRole("button", { name: /daftar|sign up/i }));
    const email = screen.getByLabelText("Email");
    await waitFor(() => expect(email).toHaveAttribute("aria-invalid", "true"));
    expect(email).toHaveAttribute("aria-describedby", expect.stringContaining("form-item-message"));
  });

  it("connects reset-password labels and validation metadata to password inputs", async () => {
    window.location.hash = "#access_token=recovery-token&type=recovery";
    render(
      <MemoryRouter>
        <LanguageProvider>
          <ResetPassword />
        </LanguageProvider>
      </MemoryRouter>,
    );

    expect(screen.getByLabelText(/kata laluan baharu|new password/i)).toHaveAttribute("name", "password");
    expect(screen.getByLabelText(/sahkan kata laluan|confirm password/i)).toHaveAttribute("name", "confirmPassword");
    expect(screen.getByRole("button", { name: /kemas kini kata laluan|update password/i })).toHaveClass("min-h-11");

    fireEvent.click(screen.getByRole("button", { name: /kemas kini kata laluan|update password/i }));
    const password = screen.getByLabelText(/kata laluan baharu|new password/i);
    await waitFor(() => expect(password).toHaveAttribute("aria-invalid", "true"));
    expect(password).toHaveAttribute("aria-describedby", expect.stringContaining("form-item-message"));
    window.location.hash = "";
  });

  it("renders each required locum field with its label and a 44px submit action", () => {
    render(
      <MemoryRouter>
        <LocumRegister />
      </MemoryRouter>,
    );

    for (const label of ["Full Name", "Email", "Password", "Phone Number", "MMC Registration Number"]) {
      expect(screen.getByLabelText(label)).toBeRequired();
    }
    expect(screen.getByRole("button", { name: "Submit Application" })).toHaveClass("min-h-11");
  });
});
