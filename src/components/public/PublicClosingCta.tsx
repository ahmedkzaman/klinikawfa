import { CalendarDays, MessageCircle, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { CLINIC_INFO } from "@/lib/constants";

export interface PublicClosingCtaProps {
  title: string;
  description: string;
  appointmentLabel?: string;
}

export function PublicClosingCta({
  title,
  description,
  appointmentLabel,
}: PublicClosingCtaProps) {
  const { t } = useLanguage();
  const resolvedAppointmentLabel = appointmentLabel ?? t("cta.bookAppointment");

  return (
    <section className="bg-primary py-14 text-primary-foreground md:py-20">
      <div className="container">
        <div className="mx-auto max-w-3xl text-center">
          <span className="public-clinic-line mx-auto mb-5 bg-primary-foreground" aria-hidden="true" />
          <h2 className="font-display text-3xl font-semibold leading-tight md:text-4xl">
            {title}
          </h2>
          <p className="mt-4 text-lg leading-8 text-primary-foreground/85">
            {description}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" variant="secondary" className="w-full sm:w-auto" asChild>
              <a href="/appointment">
                <CalendarDays aria-hidden="true" />
                {resolvedAppointmentLabel}
              </a>
            </Button>
            <Button size="lg" className="w-full bg-whatsapp text-whatsapp-foreground hover:bg-whatsapp/90 sm:w-auto" asChild>
              <a href={CLINIC_INFO.whatsapp} target="_blank" rel="noopener noreferrer">
                <MessageCircle aria-hidden="true" />
                WhatsApp
              </a>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="w-full border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground sm:w-auto"
              asChild
            >
              <a href={CLINIC_INFO.phoneLink}>
                <Phone aria-hidden="true" />
                {t("cta.call")} {CLINIC_INFO.phone}
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
