import { useLanguage } from '@/contexts/LanguageContext';
import { useRelatedPosts } from '@/hooks/useBlogPosts';
import BlogCard from './BlogCard';
import { Skeleton } from '@/components/ui/skeleton';

interface RelatedPostsProps {
  categoryId: string | null;
  currentPostId: string;
}

export default function RelatedPosts({ categoryId, currentPostId }: RelatedPostsProps) {
  const { language } = useLanguage();
  const { data: posts, isLoading } = useRelatedPosts(categoryId, currentPostId);

  if (isLoading) {
    return (
      <section className="py-12">
        <h2 className="mb-6 text-2xl font-bold">
          {language === 'ms' ? 'Artikel Berkaitan' : 'Related Articles'}
        </h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="aspect-video w-full" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (!posts || posts.length === 0) {
    return null;
  }

  return (
    <section className="py-12">
      <h2 className="mb-6 text-2xl font-bold">
        {language === 'ms' ? 'Artikel Berkaitan' : 'Related Articles'}
      </h2>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
          <BlogCard key={post.id} post={post} />
        ))}
      </div>
    </section>
  );
}
