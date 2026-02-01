import { Header } from './Header';
import { Footer } from './Footer';
import { MobileCTABar } from './MobileCTABar';
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
      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        {children}
      </main>
      <Footer />
      <MobileCTABar />
    </div>
  );
}
