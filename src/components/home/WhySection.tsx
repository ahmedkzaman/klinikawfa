import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Clock, 
  Sofa, 
  Users, 
  UserCheck, 
  Scissors, 
  Ear 
} from 'lucide-react';

const whyCards = [
  { icon: Clock, titleKey: 'why.openDaily', descKey: 'why.openDailyDesc' },
  { icon: Sofa, titleKey: 'why.comfortable', descKey: 'why.comfortableDesc' },
  { icon: Users, titleKey: 'why.familyClinic', descKey: 'why.familyClinicDesc' },
  { icon: UserCheck, titleKey: 'why.experienced', descKey: 'why.experiencedDesc' },
  { icon: Scissors, titleKey: 'why.minorSurgery', descKey: 'why.minorSurgeryDesc' },
  { icon: Ear, titleKey: 'why.ent', descKey: 'why.entDesc' },
];

export function WhySection() {
  const { language, t } = useLanguage();

  return (
    <section className="py-16 md:py-24">
      <div className="container">
        <div className="mb-12 text-center">
          <h2 className="mb-4">{t('why.title')}</h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            {language === 'ms' 
              ? 'Kami komited untuk menyediakan perkhidmatan kesihatan yang terbaik untuk anda dan keluarga.'
              : 'We are committed to providing the best healthcare services for you and your family.'}
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {whyCards.map((card, index) => (
            <Card 
              key={card.titleKey} 
              className="group border-border/50 bg-card shadow-soft transition-all hover:shadow-card hover:-translate-y-1"
            >
              <CardContent className="flex items-start gap-4 p-6">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <card.icon className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="mb-1 text-lg font-semibold">{t(card.titleKey)}</h3>
                  <p className="text-sm text-muted-foreground">{t(card.descKey)}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
