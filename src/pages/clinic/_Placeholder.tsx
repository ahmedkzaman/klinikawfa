import type { LucideIcon } from 'lucide-react';
import { SEOHead } from '@/components/seo/SEOHead';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { bento, pageInner, pageShell } from '@/lib/clinic/bentoTokens';

interface ClinicPlaceholderProps {
  title: string;
  description: string;
  icon: LucideIcon;
}

/**
 * Shared empty-state shell for clinic pages, in bento style.
 */
export function ClinicPlaceholder({ title, description, icon: Icon }: ClinicPlaceholderProps) {
  return (
    <>
      <SEOHead title={`${title} — Clinic Portal`} description={description} noIndex />
      <div className={pageShell}>
        <div className={pageInner}>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Coming soon
            </p>
          </div>
          <Card className={cn(bento)}>
            <CardContent className="flex flex-col items-center justify-center py-20 text-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50">
                <Icon className="h-8 w-8 text-blue-600" />
              </div>
              <p className="max-w-md text-sm text-slate-500">{description}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
