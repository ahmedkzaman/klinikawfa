import { Link } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { selectBilingual, type ServiceAeoContent } from '@/features/website-cms/service-seo/aeoContent';

export function ServiceAeoSections({ content, includeFaqs = true }: { content: ServiceAeoContent; includeFaqs?: boolean }) {
  const { language } = useLanguage();
  const text = (value: { ms: string; en: string }) => selectBilingual(value, language);
  const faqHeading = language === 'en' ? 'Frequently asked questions' : 'Soalan lazim';
  return (
    <section className="container max-w-5xl space-y-10 py-14" aria-label={language === 'en' ? 'Service information' : 'Maklumat perkhidmatan'}>
      <section aria-labelledby="service-overview">
        <h2 id="service-overview">{language === 'en' ? 'What this service is' : 'Apakah perkhidmatan ini'}</h2>
        <p className="mt-4 max-w-3xl text-lg leading-8 text-muted-foreground">{text(content.intro)}</p>
      </section>
      <div className="grid gap-8 md:grid-cols-2">
        <section aria-labelledby="service-suitable">
          <h2 id="service-suitable" className="text-2xl">{language === 'en' ? 'Who it may be for' : 'Siapa yang mungkin memerlukannya'}</h2>
          <p className="mt-3 leading-7 text-muted-foreground">{text(content.suitableFor)}</p>
        </section>
        <section aria-labelledby="service-expect">
          <h2 id="service-expect" className="text-2xl">{language === 'en' ? 'What to expect' : 'Apa yang dijangka'}</h2>
          <p className="mt-3 leading-7 text-muted-foreground">{text(content.whatToExpect)}</p>
        </section>
      </div>
      {content.preparation && (
        <section aria-labelledby="service-preparation">
          <h2 id="service-preparation" className="text-2xl">{language === 'en' ? 'Before your visit' : 'Sebelum lawatan'}</h2>
          <p className="mt-3 leading-7 text-muted-foreground">{text(content.preparation)}</p>
        </section>
      )}
      {content.safetyNote && <p className="border-l-4 border-amber-400 pl-4 text-sm leading-6 text-muted-foreground">{text(content.safetyNote)}</p>}
      {includeFaqs && content.faqs.length > 0 && (
        <section aria-labelledby="service-faq">
          <h2 id="service-faq">{faqHeading}</h2>
          <div className="mt-5 divide-y divide-border rounded-xl border bg-card px-5 md:px-7">
            {content.faqs.map((faq) => <div key={faq.question.ms} className="py-5"><h3 className="text-lg font-semibold">{text(faq.question)}</h3><p className="mt-2 leading-7 text-muted-foreground">{text(faq.answer)}</p></div>)}
          </div>
        </section>
      )}
      <Button asChild size="lg"><Link to="/appointment"><CalendarDays className="mr-2 h-5 w-5" aria-hidden="true" />{text(content.bookingCta)}</Link></Button>
    </section>
  );
}
