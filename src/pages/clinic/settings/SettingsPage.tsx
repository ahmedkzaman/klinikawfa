import { Link } from 'react-router-dom';
import { Sliders, Users, Archive, Package, ChevronRight, Stethoscope, Shield, Tag, FileText, FileEdit, Tv, Coins, Building2, Boxes } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { bento, pageInner, pageShell } from '@/lib/clinic/bentoTokens';

type SectionKey = 'access' | 'clinical' | 'system';

interface SettingsCard {
  href: string;
  title: string;
  description: string;
  icon: typeof Sliders;
  visible: boolean;
  group: SectionKey;
}

const SECTIONS: { key: SectionKey; title: string; description: string }[] = [
  {
    key: 'access',
    title: 'General & Access',
    description: 'Clinic identity, default preferences, and user permissions.',
  },
  {
    key: 'clinical',
    title: 'Clinical & Operations',
    description: 'Inventory, services, panels, and day-to-day clinical workflows.',
  },
  {
    key: 'system',
    title: 'System & Billing',
    description: 'Charges, printed documents, templates, and audit records.',
  },
];

export default function SettingsPage() {
  const { isAdmin, isSpecialAdmin, isOpsOrAdmin } = useAuth();
  const adminAccess = isAdmin || isSpecialAdmin;

  const cards: SettingsCard[] = [
    {
      href: '/clinic/settings/clinic-profile',
      title: 'Clinic Profile',
      description: 'Clinic name, address, phone and email used on all printed documents and labels.',
      icon: Building2,
      visible: adminAccess,
      group: 'access',
    },
    {
      href: '/clinic/settings/preferences',
      title: 'General Preferences',
      description: 'Default consultation fee name and price.',
      icon: Sliders,
      visible: true,
      group: 'access',
    },
    {
      href: '/clinic/settings/users',
      title: 'User Management',
      description: 'Manage staff roles and locum doctor profiles.',
      icon: Users,
      visible: adminAccess,
      group: 'access',
    },
    {
      href: '/clinic/settings/inventory',
      title: 'Inventory & Services',
      description: 'Manage practice items, services, packages, and pricing.',
      icon: Package,
      visible: isOpsOrAdmin,
      group: 'clinical',
    },
    {
      href: '/clinic/settings/diagnoses',
      title: 'Diagnosis Sweeper',
      description: 'Map raw clinical diagnoses into standard reporting categories.',
      icon: Stethoscope,
      visible: isOpsOrAdmin,
      group: 'clinical',
    },
    {
      href: '/clinic/settings/panels',
      title: 'Panels & Insurance',
      description: 'Manage corporate panels, TPAs, and insurance provider profiles.',
      icon: Shield,
      visible: isOpsOrAdmin,
      group: 'clinical',
    },
    {
      href: '/clinic/settings/drug-label',
      title: 'Drug Label',
      description: 'Choose which fields appear on printed medicine labels.',
      icon: Tag,
      visible: isOpsOrAdmin,
      group: 'clinical',
    },
    {
      href: '/clinic/settings/queue',
      title: 'Queue & TV',
      description: 'Manage clinic rooms and the waiting-room TV display.',
      icon: Tv,
      visible: isOpsOrAdmin,
      group: 'clinical',
    },
    {
      href: '/clinic/settings/charges',
      title: 'Other Charges',
      description: 'Manage optional billing charges shown at checkout.',
      icon: Coins,
      visible: isOpsOrAdmin,
      group: 'system',
    },
    {
      href: '/clinic/settings/documents',
      title: 'Document & Print',
      description: 'Letterhead, logo, and content position for printed POs and invoices.',
      icon: FileText,
      visible: adminAccess,
      group: 'system',
    },
    {
      href: '/clinic/settings/document-templates',
      title: 'Document Templates',
      description: 'Build templates with live tag substitution and A4/A5 paper preview.',
      icon: FileEdit,
      visible: adminAccess,
      group: 'system',
    },
    {
      href: '/clinic/voided',
      title: 'Voided Records',
      description: 'Review consultations and items that have been voided.',
      icon: Archive,
      visible: adminAccess,
      group: 'system',
    },
  ];

  const visible = cards.filter((c) => c.visible);
  const populatedSections = SECTIONS
    .map((s) => ({ ...s, items: visible.filter((c) => c.group === s.key) }))
    .filter((s) => s.items.length > 0);

  return (
    <div className={pageShell}>
      <div className={pageInner}>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Settings</h1>
          <p className="text-sm text-slate-500">
            Configure clinic preferences and manage user access.
          </p>
        </div>

        <div className="space-y-8">
          {populatedSections.map((section, idx) => (
            <section key={section.key} className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-slate-900">{section.title}</h2>
                <p className="text-sm text-slate-500">{section.description}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {section.items.map((card) => (
                  <Link key={card.href} to={card.href} className="group">
                    <Card
                      className={cn(
                        bento,
                        'p-5 h-full flex items-start gap-4 transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:-translate-y-0.5',
                      )}
                    >
                      <div className="rounded-xl bg-blue-50 text-blue-600 p-3 shrink-0">
                        <card.icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-semibold text-slate-900">{card.title}</h3>
                          <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all" />
                        </div>
                        <p className="text-sm text-slate-500 mt-1">{card.description}</p>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>

              {idx < populatedSections.length - 1 && <Separator className="mt-8" />}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
