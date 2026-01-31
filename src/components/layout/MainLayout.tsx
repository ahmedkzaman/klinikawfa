import { Header } from './Header';
import { Footer } from './Footer';
import { MobileCTABar } from './MobileCTABar';

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 pb-20 lg:pb-0">
        {children}
      </main>
      <Footer />
      <MobileCTABar />
    </div>
  );
}
