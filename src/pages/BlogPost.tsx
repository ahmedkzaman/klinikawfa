import { Link, useParams } from 'react-router-dom';
import { MainLayout } from '@/components/layout';
import { SEOHead, ArticleSchema } from '@/components/seo';
import { useLanguage } from '@/contexts/LanguageContext';
import { useBlogPost } from '@/hooks/useBlogPosts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ShareButtons, RelatedPosts, MarkdownRenderer } from '@/components/blog';
import { ArrowLeft, Calendar, Clock, BookOpen } from 'lucide-react';
import { sanitizeRichHtml } from '@/lib/sanitize-rich-html';
import { derivePageMetadata } from '@/features/website-cms/seo/usePageMetadata';
import type { SeoFields } from '@/features/website-cms/domain/seo';
import { supabase } from '@/integrations/supabase/client';

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const { language } = useLanguage();
  const { data: post, isLoading, error } = useBlogPost(slug || '');

  if (isLoading) {
    return (
      <MainLayout>
        <div className="container py-8 md:py-16">
          <Skeleton className="mb-8 h-8 w-40" />
          <Skeleton className="mb-6 aspect-[21/9] w-full rounded-xl" />
          <Skeleton className="mb-4 h-6 w-32" />
          <Skeleton className="mb-4 h-12 w-3/4" />
          <div className="flex gap-4 mb-8">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      </MainLayout>
    );
  }

  if (error || !post) {
    return (
      <MainLayout>
        <SEOHead
          title={language === 'ms' ? 'Artikel Tidak Dijumpai' : 'Article Not Found'}
          description={language === 'ms' ? 'Artikel tidak wujud' : 'Article not found'}
          noIndex
        />
        <div className="container py-16 text-center">
          <BookOpen className="mx-auto mb-4 h-16 w-16 text-muted-foreground/50" />
          <h1 className="mb-4 text-2xl font-bold">
            {language === 'ms' ? 'Artikel Tidak Dijumpai' : 'Article Not Found'}
          </h1>
          <p className="mb-8 text-muted-foreground">
            {language === 'ms'
              ? 'Artikel yang anda cari tidak wujud atau telah dipadamkan.'
              : "The article you're looking for doesn't exist or has been removed."}
          </p>
          <Button asChild>
            <Link to="/health-tips">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {language === 'ms' ? 'Kembali ke Tips Kesihatan' : 'Back to Health Tips'}
            </Link>
          </Button>
        </div>
      </MainLayout>
    );
  }

  const title = language === 'ms' ? (post.title_ms || post.title) : (post.title_en || post.title);
  const content = language === 'ms' ? (post.content_ms || post.content) : (post.content_en || post.content);
  const excerpt = language === 'ms' ? post.excerpt_ms : post.excerpt_en;
  const category = post.category as { id: string; name: string; name_ms?: string; name_en?: string; slug: string } | null;
  const categoryName = category
    ? (language === 'ms' ? (category.name_ms || category.name) : (category.name_en || category.name))
    : null;
  const editorMetadata = (post as unknown as {
    website_editor_metadata?: {
      seoMs?: SeoFields;
      seoEn?: SeoFields;
      seoMsSocialImagePath?: string | null;
      seoEnSocialImagePath?: string | null;
    };
  }).website_editor_metadata;
  const metadata = derivePageMetadata(
    language === 'ms' ? editorMetadata?.seoMs : editorMetadata?.seoEn,
    { title, description: excerpt || title, path: `/health-tips/${post.slug}` },
  );
  const socialImagePath = language === 'ms'
    ? editorMetadata?.seoMsSocialImagePath
    : editorMetadata?.seoEnSocialImagePath;
  const socialImage = socialImagePath
    ? supabase.storage.from('website-media').getPublicUrl(socialImagePath).data.publicUrl
    : post.featured_image || undefined;

  return (
    <MainLayout>
      <SEOHead
        title={metadata.title}
        description={metadata.description}
        image={socialImage}
        url={`/health-tips/${post.slug}`}
        type="article"
        publishedTime={post.published_at || undefined}
        author="Klinik Awfa"
        canonicalUrl={metadata.canonical}
        noIndex={metadata.robots.includes('noindex')}
        noFollow={metadata.robots.includes('nofollow')}
        socialTitle={metadata.socialTitle}
        socialDescription={metadata.socialDescription}
      />
      <ArticleSchema
        title={title}
        description={excerpt || title}
        image={post.featured_image || undefined}
        url={`/health-tips/${post.slug}`}
        publishedTime={post.published_at || undefined}
      />

      {/* Back button */}
      <div className="container pt-8">
        <Button variant="ghost" asChild className="mb-6 -ml-4">
          <Link to="/health-tips">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {language === 'ms' ? 'Tips Kesihatan' : 'Health Tips'}
          </Link>
        </Button>
      </div>

      {/* Featured image */}
      {post.featured_image && (
        <div className="container mb-8">
          <div className="aspect-[21/9] overflow-hidden rounded-xl">
            <img
              src={post.featured_image}
              alt={title}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </div>
        </div>
      )}

      {/* Article header */}
      <article className="container max-w-3xl">
        {categoryName && (
          <Badge variant="secondary" className="mb-4">
            {categoryName}
          </Badge>
        )}
        
        <h1 className="mb-4 text-3xl font-bold md:text-4xl">{title}</h1>
        
        <div className="mb-8 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          {post.published_at && (
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {new Date(post.published_at).toLocaleDateString(language === 'ms' ? 'ms-MY' : 'en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </span>
          )}
          {post.reading_time && (
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {post.reading_time} {language === 'ms' ? 'minit bacaan' : 'min read'}
            </span>
          )}
        </div>

        {/* Article content */}
        {/<[a-z][\s\S]*>/i.test(content) ? (
          <div className="prose mb-12 max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(content) }} />
        ) : (
          <MarkdownRenderer content={content} className="mb-12" />
        )}

        {/* Share buttons */}
        <div className="mb-12 rounded-xl border border-border bg-muted/30 p-6">
          <ShareButtons
            title={title}
            url={`/health-tips/${post.slug}`}
            excerpt={excerpt || undefined}
          />
        </div>
      </article>

      {/* Related posts */}
      <div className="container">
        <RelatedPosts categoryId={post.category_id} currentPostId={post.id} />
      </div>

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
