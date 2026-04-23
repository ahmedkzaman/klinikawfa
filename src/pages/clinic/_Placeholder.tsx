import type { LucideIcon } from 'lucide-react';
import { SEOHead } from '@/components/seo/SEOHead';
import { Card, CardContent } from '@/components/ui/card';

interface ClinicPlaceholderProps {
  title: string;
  description: string;
  icon: LucideIcon;
}

/**
 * Shared empty-state shell for the six Step-4 clinic pages.
 * Replaced one-by-one in Step 5 with real data wiring.
 */
export function ClinicPlaceholder({ title, description, icon: Icon }: ClinicPlaceholderProps) {
  return (
    <>
      <SEOHead title={`${title} — Clinic Portal`} description={description} noIndex />
      <div className="space-y-2 mb-6">
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground">Step 5 will wire this up.</p>
      </div>
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Icon className="h-7 w-7 text-primary" />
          </div>
          <p className="max-w-md text-sm text-muted-foreground">{description}</p>
        </CardContent>
      </Card>
    </>
  );
}
