import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MainLayout } from "@/components/layout/MainLayout";
import { SEOHead } from "@/components/seo/SEOHead";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, CheckCircle, Calendar, AlertTriangle } from "lucide-react";
// GHSA-v3m3-f69x-jf25: Quill HTML export must pass through the shared sanitizer.
import { sanitizeRichHtml } from "@/lib/sanitize-rich-html";
import { resolveServiceCategorySlug } from "@/lib/serviceSlugMap";

const stripHtml = (html: string) =>
  (html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

interface ClinicService {
  id: string;
  slug: string;
  title: string;
  description: string;
  services_list: string[];
  call_to_action: string;
}

export default function ServiceDetail() {
  const { slug } = useParams<{ slug: string }>();

  const dbSlug = resolveServiceCategorySlug(slug);

  const { data: service, isLoading, isError } = useQuery({
    queryKey: ["clinic-service", dbSlug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinic_services" as never)
        .select("*")
        .eq("slug", dbSlug!)
        .maybeSingle();
      if (error) throw error;
      return (data as ClinicService | null) ?? null;
    },
    enabled: !!dbSlug,
  });

  if (isLoading) {
    return (
      <MainLayout>
        <section className="bg-gradient-to-br from-primary/10 via-background to-accent/5 py-16 md:py-24">
          <div className="container space-y-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-12 w-2/3" />
            <Skeleton className="h-6 w-full max-w-2xl" />
            <Skeleton className="h-12 w-48" />
          </div>
        </section>
        <section className="container py-16">
          <Skeleton className="mb-8 h-8 w-48" />
          <div className="grid gap-4 sm:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </section>
      </MainLayout>
    );
  }

  if (isError || !service) {
    return (
      <MainLayout>
        <SEOHead title="Service Not Found" description="The requested service could not be found." noIndex />
        <section className="container py-24 text-center">
          <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-amber-500" />
          <h1 className="mb-3">404 – Service Not Found</h1>
          <p className="mx-auto mb-8 max-w-md text-muted-foreground">
            The healthcare service you are looking for does not exist or has been removed.
          </p>
          <Button asChild size="lg">
            <Link to="/services">
              <ArrowLeft className="mr-2 h-5 w-5" /> Return to Services
            </Link>
          </Button>
        </section>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <SEOHead
        title={service.title}
        description={stripHtml(service.description).substring(0, 160)}
        url={`/services/${service.slug}`}
      />

      {/* Hero */}
      <section className="bg-gradient-to-br from-primary/10 via-background to-accent/5 py-16 md:py-24">
        <div className="container">
          <Link
            to="/services"
            className="mb-6 inline-flex items-center text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Services
          </Link>
          <h1 className="mb-4">{service.title}</h1>
          <div
            className="service-rich-content prose max-w-none mb-8 text-muted-foreground"
            dangerouslySetInnerHTML={{
              __html: sanitizeRichHtml(service.description || ""),
            }}
          />
          <Button asChild size="lg">
            <Link to="/appointment">
              <Calendar className="mr-2 h-5 w-5" /> {service.call_to_action}
            </Link>
          </Button>
        </div>
      </section>

      {/* Services list */}
      <section className="container py-16">
        <h2 className="mb-8">What's Included</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {service.services_list?.map((item, index) => (
            <Card key={index} className="border-border/50 shadow-soft">
              <CardContent className="flex items-start gap-3 p-4">
                <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <span className="text-sm">{item}</span>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Disclaimer */}
        <Card className="mt-12 border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <CardContent className="flex items-start gap-3 p-6">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-sm text-amber-800 dark:text-amber-200">
              <strong>Medical Disclaimer:</strong> Information provided is for educational purposes only.
              Specific treatments, procedures, or prescriptions are subject to clinical assessment by our medical officers.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Bottom CTA */}
      <section className="bg-primary py-16 text-primary-foreground">
        <div className="container text-center">
          <h2 className="mb-4 text-primary-foreground">Ready to seek treatment?</h2>
          <p className="mx-auto mb-8 max-w-xl text-primary-foreground/80">
            Book an appointment online or walk in to our clinic today. Our medical team is ready to assist you.
          </p>
          <Button asChild size="lg" variant="secondary">
            <Link to="/appointment">
              <Calendar className="mr-2 h-5 w-5" /> {service.call_to_action}
            </Link>
          </Button>
        </div>
      </section>
    </MainLayout>
  );
}
