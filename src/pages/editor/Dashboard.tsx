import {
  FileText,
  GalleryHorizontal,
  Home,
  Network,
  PanelTop,
  Star,
  Stethoscope,
  Wrench,
} from "lucide-react";
import { Link } from "react-router-dom";

const sections = [
  { label: "Home", description: "Homepage sections, media and calls to action", to: "/editor/home", icon: Home },
  { label: "Pages", description: "Create and publish bilingual information pages", to: "/editor/pages", icon: PanelTop },
  { label: "Services", description: "Clinic service categories and landing content", to: "/editor/services", icon: Wrench },
  { label: "Team", description: "Public doctor and team profiles", to: "/editor/team", icon: Stethoscope },
  { label: "Blog", description: "Health tips and public articles", to: "/editor/blog", icon: FileText },
  { label: "Gallery", description: "Public photos, videos and display order", to: "/editor/gallery", icon: GalleryHorizontal },
  { label: "Reviews", description: "Public testimonial presentations", to: "/editor/reviews", icon: Star },
  { label: "Navigation", description: "Header and footer links", to: "/editor/navigation", icon: Network },
] as const;

export default function EditorDashboard() {
  return (
    <section aria-labelledby="editor-dashboard-title" className="space-y-6">
      <header>
        <p className="text-sm font-medium text-blue-700">Website workspace</p>
        <h1 id="editor-dashboard-title" className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
          Website Editor
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Manage only the public Klinik Awfa website. Draft changes remain private until you publish them.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sections.map(({ label, description, to, icon: Icon }) => (
          <Link
            className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            key={to}
            to={to}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700 group-hover:bg-blue-100">
              <Icon aria-hidden="true" className="h-5 w-5" />
            </span>
            <h2 className="mt-4 font-semibold text-slate-900">{label}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
            <span className="mt-4 inline-block text-sm font-medium text-blue-700">Open {label}</span>
          </Link>
        ))}
      </div>

      <aside className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
        This workspace is isolated from clinic operations. It does not provide access to clinical, financial, staffing, or patient records.
      </aside>
    </section>
  );
}
