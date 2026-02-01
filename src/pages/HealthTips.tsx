import { useState } from 'react';
import { MainLayout } from '@/components/layout';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import { Calendar, BookOpen, FileX } from 'lucide-react';
import { useBlogPosts } from '@/hooks/useBlogPosts';
import { BlogCard, BlogSearch, BlogPagination } from '@/components/blog';

export default function HealthTips() {
  const { language } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(1);

  const { posts, totalPages, isLoading, categories, categoriesLoading } = useBlogPosts({
    category: selectedCategory,
    searchQuery,
    page: currentPage,
    limit: 6,
  });

  // Reset to page 1 when filters change
  const handleCategoryChange = (categorySlug: string | undefined) => {
    setSelectedCategory(categorySlug);
    setCurrentPage(1);
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
  };

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

      {/* Search */}
      <section className="border-b border-border py-4">
        <div className="container">
          <div className="max-w-md">
            <BlogSearch value={searchQuery} onChange={handleSearchChange} />
          </div>
        </div>
      </section>

      {/* Category Filter Buttons */}
      <section className="border-b border-border py-4">
        <div className="container">
          <div className="flex flex-wrap gap-2 overflow-x-auto pb-2 md:pb-0">
            <Button
              variant={!selectedCategory ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleCategoryChange(undefined)}
            >
              {language === 'ms' ? 'Semua' : 'All'}
            </Button>
            {categoriesLoading ? (
              <>
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-8 w-28" />
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-8 w-32" />
              </>
            ) : (
              categories.map((cat) => (
                <Button
                  key={cat.id}
                  variant={selectedCategory === cat.slug ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleCategoryChange(cat.slug)}
                >
                  {language === 'ms' ? (cat.name_ms || cat.name) : (cat.name_en || cat.name)}
                </Button>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Blog Grid */}
      <section className="py-16 md:py-24">
        <div className="container">
          {isLoading ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="space-y-3">
                  <Skeleton className="aspect-video w-full rounded-lg" />
                  <div className="space-y-2 p-2">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : posts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileX className="mb-4 h-16 w-16 text-muted-foreground/50" />
              <h3 className="mb-2 text-xl font-semibold">
                {language === 'ms' ? 'Tiada Artikel Dijumpai' : 'No Articles Found'}
              </h3>
              <p className="mb-6 text-muted-foreground">
                {searchQuery
                  ? (language === 'ms'
                      ? `Tiada hasil untuk "${searchQuery}". Cuba cari dengan kata kunci lain.`
                      : `No results for "${searchQuery}". Try different keywords.`)
                  : (language === 'ms'
                      ? 'Tiada artikel dalam kategori ini buat masa ini.'
                      : 'No articles in this category yet.')}
              </p>
              {(searchQuery || selectedCategory) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory(undefined);
                    setCurrentPage(1);
                  }}
                >
                  {language === 'ms' ? 'Kosongkan Penapis' : 'Clear Filters'}
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {posts.map((post) => (
                  <BlogCard key={post.id} post={post} />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-12">
                  <BlogPagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                  />
                </div>
              )}
            </>
          )}
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
