import { Link } from 'react-router-dom';
import { Sliders, Users, Archive, Package, ChevronRight, Stethoscope, Shield } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface SettingsCard {
  href: string;
  title: string;
  description: string;
  icon: typeof Sliders;
  visible: boolean;
}

export default function SettingsPage() {
  const { isAdmin, isSpecialAdmin, isOpsOrAdmin } = useAuth();
  const adminAccess = isAdmin || isSpecialAdmin;

  const cards: SettingsCard[] = [
    {
      href: '/clinic/settings/preferences',
      title: 'General Preferences',
      description: 'Default consultation fee name and price.',
      icon: Sliders,
      visible: true,
    },
    {
      href: '/clinic/settings/inventory',
      title: 'Inventory & Services',
      description: 'Manage practice items, services, packages, and pricing.',
      icon: Package,
      visible: isOpsOrAdmin,
    },
    {
      href: '/clinic/settings/diagnoses',
      title: 'Diagnosis Sweeper',
      description: 'Map raw clinical diagnoses into standard reporting categories.',
      icon: Stethoscope,
      visible: isOpsOrAdmin,
    },
    {
      href: '/clinic/settings/panels',
      title: 'Panels & Insurance',
      description: 'Manage corporate panels, TPAs, and insurance provider profiles.',
      icon: Shield,
      visible: isOpsOrAdmin,
    },
    {
      href: '/clinic/settings/users',
      title: 'User Management',
      description: 'Manage staff roles and locum doctor profiles.',
      icon: Users,
      visible: adminAccess,
    },
    {
      href: '/clinic/voided',
      title: 'Voided Records',
      description: 'Review consultations and items that have been voided.',
      icon: Archive,
      visible: adminAccess,
    },
  ];

  const visible = cards.filter((c) => c.visible);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure clinic preferences and manage user access.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visible.map((card) => (
          <Link key={card.href} to={card.href} className="group">
            <Card
              className={cn(
                'p-5 h-full flex items-start gap-4 transition-colors',
                'hover:bg-accent/40 hover:border-primary/40',
              )}
            >
              <div className="rounded-md bg-primary/10 text-primary p-2.5 shrink-0">
                <card.icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-medium text-foreground">{card.title}</h2>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
                <p className="text-sm text-muted-foreground mt-1">{card.description}</p>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
