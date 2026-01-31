import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent } from '@/components/ui/card';
import { Quote, Star } from 'lucide-react';

interface Testimonial {
  id: number;
  nameMs: string;
  nameEn: string;
  textMs: string;
  textEn: string;
  rating: number;
}

const testimonials: Testimonial[] = [
  {
    id: 1,
    nameMs: 'Puan Fatimah',
    nameEn: 'Mrs. Fatimah',
    textMs: 'Doktor sangat mesra dan sabar. Anak saya tidak takut untuk datang ke klinik ini. Terima kasih Klinik Awfa!',
    textEn: 'The doctor is very friendly and patient. My child is not afraid to come to this clinic. Thank you Klinik Awfa!',
    rating: 5,
  },
  {
    id: 2,
    nameMs: 'Encik Ahmad',
    nameEn: 'Mr. Ahmad',
    textMs: 'Perkhidmatan microsuction yang sangat profesional. Telinga saya rasa lega selepas rawatan. Highly recommended!',
    textEn: 'Very professional microsuction service. My ear feels relieved after treatment. Highly recommended!',
    rating: 5,
  },
  {
    id: 3,
    nameMs: 'Cik Nurul',
    nameEn: 'Ms. Nurul',
    textMs: 'Klinik bersih dan selesa. Waktu operasi yang panjang sangat membantu terutama untuk pekerja seperti saya.',
    textEn: 'Clean and comfortable clinic. The long operating hours are very helpful especially for workers like me.',
    rating: 5,
  },
  {
    id: 4,
    nameMs: 'Encik Razak',
    nameEn: 'Mr. Razak',
    textMs: 'Rawatan ketumbuhan di sini sangat baik. Doktor terangkan dengan jelas sebelum prosedur. Saya berpuas hati.',
    textEn: 'The lump treatment here is excellent. The doctor explained clearly before the procedure. I am satisfied.',
    rating: 5,
  },
];

export function TestimonialsSection() {
  const { language } = useLanguage();

  return (
    <section className="bg-muted/30 py-16 md:py-24">
      <div className="container">
        <div className="mb-12 text-center">
          <h2 className="mb-4">
            {language === 'ms' ? 'Apa Kata Pesakit Kami' : 'What Our Patients Say'}
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            {language === 'ms'
              ? 'Kepuasan pesakit adalah keutamaan kami.'
              : 'Patient satisfaction is our priority.'}
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {testimonials.map((testimonial, index) => (
            <Card 
              key={testimonial.id} 
              className="group border-border/50 bg-card shadow-soft transition-all hover:shadow-card hover:-translate-y-1"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <CardContent className="p-6">
                <Quote className="mb-4 h-8 w-8 text-primary/30" />
                
                {/* Rating */}
                <div className="mb-3 flex gap-0.5">
                  {Array.from({ length: testimonial.rating }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-accent text-accent" />
                  ))}
                </div>

                {/* Text */}
                <p className="mb-4 text-sm text-muted-foreground leading-relaxed">
                  "{language === 'ms' ? testimonial.textMs : testimonial.textEn}"
                </p>

                {/* Name */}
                <p className="font-semibold text-foreground">
                  {language === 'ms' ? testimonial.nameMs : testimonial.nameEn}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
