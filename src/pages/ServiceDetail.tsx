import { useParams, Link, Navigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout';
import { useLanguage } from '@/contexts/LanguageContext';
import { getServiceBySlug } from '@/lib/serviceContent';
import { CLINIC_INFO } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Stethoscope,
  Thermometer,
  TestTube,
  Wind,
  Activity,
  Droplets,
  Ear,
  Scissors,
  Circle,
  ArrowLeft,
  Phone,
  MessageCircle,
  Calendar,
  CheckCircle,
  Users,
  AlertTriangle,
} from 'lucide-react';

const iconMap: Record<string, React.ElementType> = {
  Stethoscope,
  Thermometer,
  TestTube,
  Wind,
  Activity,
  Droplets,
  Ear,
  Scissors,
  Circle,
};

export default function ServiceDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { language, t } = useLanguage();

  const service = slug ? getServiceBySlug(slug) : undefined;

  if (!service) {
    return <Navigate to="/services" replace />;
  }

  const IconComponent = iconMap[service.icon] || Stethoscope;
  const title = language === 'ms' ? service.titleMs : service.titleEn;
  const description = language === 'ms' ? service.descriptionMs : service.descriptionEn;
  const benefits = language === 'ms' ? service.benefitsMs : service.benefitsEn;
  const process = language === 'ms' ? service.processMs : service.processEn;
  const suitableFor = language === 'ms' ? service.suitableForMs : service.suitableForEn;
  const faq = language === 'ms' ? service.faqMs : service.faqEn;

  return (
    <MainLayout>
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-primary/10 via-background to-accent/5 py-16 md:py-24">
        <div className="container">
          {/* Back Button */}
          <Link
            to="/services"
            className="mb-6 inline-flex items-center text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {language === 'ms' ? 'Kembali ke Perkhidmatan' : 'Back to Services'}
          </Link>

          <div className="flex flex-col items-start gap-6 md:flex-row md:items-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary text-primary-foreground shadow-lg md:h-24 md:w-24">
              <IconComponent className="h-10 w-10 md:h-12 md:w-12" />
            </div>
            <div className="flex-1">
              <h1 className="mb-3">{title}</h1>
              <p className="max-w-2xl text-lg text-muted-foreground">{description}</p>
            </div>
          </div>

          {/* Quick CTAs */}
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <a href={CLINIC_INFO.whatsapp} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="mr-2 h-5 w-5" />
                WhatsApp
              </a>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href={CLINIC_INFO.phoneLink}>
                <Phone className="mr-2 h-5 w-5" />
                {CLINIC_INFO.phone}
              </a>
            </Button>
            <Button size="lg" variant="secondary" asChild>
              <Link to="/appointment">
                <Calendar className="mr-2 h-5 w-5" />
                {t('cta.bookAppointment')}
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-16">
        <div className="container">
          <h2 className="mb-8">
            {language === 'ms' ? 'Apa yang Kami Bantu' : 'What We Help With'}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {benefits.map((benefit, index) => (
              <Card key={index} className="border-border/50 bg-card shadow-soft">
                <CardContent className="flex items-start gap-3 p-4">
                  <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <span className="text-sm">{benefit}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Process Section */}
      <section className="bg-muted/30 py-16">
        <div className="container">
          <h2 className="mb-8">
            {language === 'ms' ? 'Apa yang Dijangkakan' : 'What to Expect'}
          </h2>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {process.map((step) => (
              <Card key={step.step} className="border-border/50 bg-card shadow-soft">
                <CardContent className="p-6">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
                    {step.step}
                  </div>
                  <h3 className="mb-2 text-lg font-semibold">{step.title}</h3>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Who It's For */}
      <section className="py-16">
        <div className="container">
          <div className="flex items-start gap-4">
            <Users className="mt-1 h-6 w-6 shrink-0 text-primary" />
            <div>
              <h2 className="mb-4">
                {language === 'ms' ? 'Sesuai Untuk' : 'Who It\'s For'}
              </h2>
              <div className="flex flex-wrap gap-2">
                {suitableFor.map((item, index) => (
                  <span
                    key={index}
                    className="rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="bg-muted/30 py-16">
        <div className="container">
          <h2 className="mb-8">
            {language === 'ms' ? 'Soalan Lazim (FAQ)' : 'Frequently Asked Questions'}
          </h2>
          <div className="mx-auto max-w-3xl">
            <Accordion type="single" collapsible className="space-y-3">
              {faq.map((item, index) => (
                <AccordionItem
                  key={index}
                  value={`faq-${index}`}
                  className="rounded-lg border border-border/50 bg-card px-4 shadow-soft"
                >
                  <AccordionTrigger className="text-left hover:no-underline">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* Safety Disclaimer */}
      <section className="py-8">
        <div className="container">
          <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
            <CardContent className="flex items-start gap-4 p-6">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="text-sm text-amber-800 dark:text-amber-200">
                <p className="font-medium">
                  {language === 'ms' ? 'Penafian Perubatan' : 'Medical Disclaimer'}
                </p>
                <p className="mt-1 text-amber-700 dark:text-amber-300">
                  {language === 'ms'
                    ? 'Maklumat yang disediakan adalah untuk tujuan pendidikan sahaja dan bukan pengganti nasihat perubatan profesional. Sila berjumpa doktor untuk diagnosis dan rawatan yang tepat.'
                    : 'The information provided is for educational purposes only and is not a substitute for professional medical advice. Please consult a doctor for proper diagnosis and treatment.'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-primary py-16 text-primary-foreground">
        <div className="container">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="mb-4 text-primary-foreground">
              {language === 'ms'
                ? 'Bersedia untuk Temujanji?'
                : 'Ready to Book an Appointment?'}
            </h2>
            <p className="mb-8 text-primary-foreground/80">
              {language === 'ms'
                ? 'Hubungi kami hari ini untuk membuat temujanji atau bertanya soalan.'
                : 'Contact us today to book an appointment or ask questions.'}
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button size="lg" variant="secondary" asChild>
                <a href={CLINIC_INFO.whatsapp} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="mr-2 h-5 w-5" />
                  WhatsApp
                </a>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10"
                asChild
              >
                <a href={CLINIC_INFO.phoneLink}>
                  <Phone className="mr-2 h-5 w-5" />
                  {CLINIC_INFO.phone}
                </a>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10"
                asChild
              >
                <Link to="/appointment">
                  <Calendar className="mr-2 h-5 w-5" />
                  {t('cta.bookAppointment')}
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </MainLayout>
  );
}
