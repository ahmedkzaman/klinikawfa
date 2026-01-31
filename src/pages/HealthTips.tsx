import { MainLayout } from '@/components/layout';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { CLINIC_INFO } from '@/lib/constants';
import { Calendar, User, ArrowRight, BookOpen } from 'lucide-react';

// Placeholder blog categories
const categories = [
  { id: 'children', labelMs: 'Kesihatan Kanak-kanak', labelEn: "Children's Health" },
  { id: 'general', labelMs: 'Kesihatan Umum', labelEn: 'General Health' },
  { id: 'lump-wart', labelMs: 'Info Ketumbuhan & Ketuat', labelEn: 'Lump & Wart Info' },
  { id: 'ent', labelMs: 'Tips Penjagaan Telinga', labelEn: 'ENT / Ear Care Tips' },
];

// Placeholder blog posts
const placeholderPosts = [
  {
    id: 1,
    slug: 'tip-kesihatan-kanak-kanak',
    titleMs: 'Tips Menjaga Kesihatan Kanak-kanak',
    titleEn: "Tips for Children's Health Care",
    excerptMs: 'Panduan lengkap untuk ibu bapa dalam menjaga kesihatan anak-anak...',
    excerptEn: 'A complete guide for parents on maintaining children\'s health...',
    category: 'children',
    date: '2024-01-15',
    author: 'Dr. Awfa',
  },
  {
    id: 2,
    slug: 'apa-itu-microsuction',
    titleMs: 'Apa Itu Microsuction? Panduan Lengkap',
    titleEn: 'What is Microsuction? Complete Guide',
    excerptMs: 'Ketahui tentang prosedur pembersihan telinga yang selamat dan berkesan...',
    excerptEn: 'Learn about the safe and effective ear cleaning procedure...',
    category: 'ent',
    date: '2024-01-10',
    author: 'Dr. Awfa',
  },
  {
    id: 3,
    slug: 'rawatan-ketumbuhan',
    titleMs: 'Bila Perlu Berjumpa Doktor untuk Ketumbuhan?',
    titleEn: 'When Should You See a Doctor for Lumps?',
    excerptMs: 'Tanda-tanda yang perlu anda perhatikan dan bila masa sesuai untuk mendapatkan rawatan...',
    excerptEn: 'Signs you should watch for and when is the right time to seek treatment...',
    category: 'lump-wart',
    date: '2024-01-05',
    author: 'Dr. Awfa',
  },
];

export default function HealthTips() {
  const { language } = useLanguage();

  return (
    <MainLayout>
      {/* Hero */}
      <section className="bg-gradient-to-b from-background to-primary/5 py-16 md:py-24">
        <div className="container">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="mb-4">
              {language === 'ms' ? 'Tips Kesihatan' : 'Health Tips'}
            </h1>
            <p className="text-lg text-muted-foreground">
              {language === 'ms'
                ? 'Artikel dan panduan kesihatan daripada pakar kami.'
                : 'Health articles and guides from our experts.'}
            </p>
          </div>
        </div>
      </section>

      {/* Filter Buttons */}
      <section className="border-b border-border py-4">
        <div className="container">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" className="bg-primary text-primary-foreground">
              {language === 'ms' ? 'Semua' : 'All'}
            </Button>
            {categories.map((cat) => (
              <Button key={cat.id} variant="outline" size="sm">
                {language === 'ms' ? cat.labelMs : cat.labelEn}
              </Button>
            ))}
          </div>
        </div>
      </section>

      {/* Blog Grid */}
      <section className="py-16 md:py-24">
        <div className="container">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {placeholderPosts.map((post) => (
              <Card key={post.id} className="group overflow-hidden border-border/50 shadow-soft transition-all hover:shadow-card">
                {/* Placeholder image */}
                <div className="aspect-video bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                  <BookOpen className="h-12 w-12 text-primary/30" />
                </div>
                <CardContent className="p-6">
                  <div className="mb-3 flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {new Date(post.date).toLocaleDateString(language === 'ms' ? 'ms-MY' : 'en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    <span className="flex items-center gap-1">
                      <User className="h-4 w-4" />
                      {post.author}
                    </span>
                  </div>
                  <h3 className="mb-2 text-lg font-semibold group-hover:text-primary transition-colors">
                    {language === 'ms' ? post.titleMs : post.titleEn}
                  </h3>
                  <p className="mb-4 text-sm text-muted-foreground line-clamp-2">
                    {language === 'ms' ? post.excerptMs : post.excerptEn}
                  </p>
                  <Button variant="ghost" size="sm" className="group/btn -ml-2">
                    {language === 'ms' ? 'Baca Lagi' : 'Read More'}
                    <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* TODO Notice */}
          <div className="mt-8 rounded-xl border border-dashed border-muted-foreground/30 bg-muted/50 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {language === 'ms'
                ? '📝 Artikel blog akan diurus melalui admin dashboard apabila Lovable Cloud diaktifkan.'
                : '📝 Blog articles will be managed through the admin dashboard when Lovable Cloud is enabled.'}
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-muted/50 py-16">
        <div className="container">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="mb-4">
              {language === 'ms' ? 'Ada Soalan Kesihatan?' : 'Have Health Questions?'}
            </h2>
            <p className="mb-8 text-muted-foreground">
              {language === 'ms'
                ? 'Jangan ragu untuk menghubungi kami. Kami sedia membantu!'
                : "Don't hesitate to contact us. We're here to help!"}
            </p>
            <Button size="lg" asChild>
              <Link to="/appointment">
                <Calendar className="mr-2 h-5 w-5" />
                {language === 'ms' ? 'Buat Temujanji' : 'Book Appointment'}
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </MainLayout>
  );
}
