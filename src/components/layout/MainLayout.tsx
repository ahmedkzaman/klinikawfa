import { Header } from './Header';
import { Footer } from './Footer';
import { SkipToContent } from './SkipToContent';
import { SchemaMarkup } from '@/components/seo';

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <SkipToContent />
      <SchemaMarkup />
      <Header />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  );
}
