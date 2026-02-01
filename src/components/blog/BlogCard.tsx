import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, User, ArrowRight, BookOpen, Clock } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import type { Tables } from '@/integrations/supabase/types';

type BlogPost = Tables<'blog_posts'>;

interface BlogCardProps {
  post: BlogPost;
}

export default function BlogCard({ post }: BlogCardProps) {
  const { language } = useLanguage();

  const title = language === 'ms' ? (post.title_ms || post.title) : (post.title_en || post.title);
  const excerpt = language === 'ms' ? post.excerpt_ms : post.excerpt_en;

  return (
    <Card className="group overflow-hidden border-border/50 shadow-soft transition-all hover:shadow-card">
      {/* Featured image or placeholder */}
      <Link to={`/health-tips/${post.slug}`}>
        {post.featured_image ? (
          <div className="aspect-video overflow-hidden">
            <img
              src={post.featured_image}
              alt={title}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          </div>
        ) : (
          <div className="aspect-video bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
            <BookOpen className="h-12 w-12 text-primary/30" />
          </div>
        )}
      </Link>
      <CardContent className="p-6">
        <div className="mb-3 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          {post.published_at && (
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {new Date(post.published_at).toLocaleDateString(language === 'ms' ? 'ms-MY' : 'en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </span>
          )}
          {post.reading_time && (
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {post.reading_time} {language === 'ms' ? 'min' : 'min read'}
            </span>
          )}
        </div>
        <Link to={`/health-tips/${post.slug}`}>
          <h3 className="mb-2 text-lg font-semibold group-hover:text-primary transition-colors line-clamp-2">
            {title}
          </h3>
        </Link>
        {excerpt && (
          <p className="mb-4 text-sm text-muted-foreground line-clamp-2">
            {excerpt}
          </p>
        )}
        <Button variant="ghost" size="sm" className="group/btn -ml-2" asChild>
          <Link to={`/health-tips/${post.slug}`}>
            {language === 'ms' ? 'Baca Lagi' : 'Read More'}
            <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
