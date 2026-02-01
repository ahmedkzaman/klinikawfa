import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { NAV_ITEMS, CLINIC_INFO } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Menu, Phone, MessageCircle, LogIn, Settings, LogOut, User } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Header() {
  const { language, setLanguage, t } = useLanguage();
  const { user, isStaffOrAdmin, signOut, loading } = useAuth();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === '/') return location.pathname === '/';
    return location.pathname.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container flex h-16 items-center justify-between md:h-18">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-lg">
            KA
          </div>
          <span className="hidden font-display text-xl font-bold text-foreground sm:inline-block">
            {CLINIC_INFO.name}
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-1 lg:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                'px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                isActive(item.href)
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {t(item.labelKey)}
            </Link>
          ))}
        </nav>

        {/* Desktop Actions */}
        <div className="hidden items-center gap-2 lg:flex">
          {/* Language Toggle */}
          <div className="flex items-center rounded-lg border border-border p-0.5">
            <button
              onClick={() => setLanguage('ms')}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                language === 'ms'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              BM
            </button>
            <button
              onClick={() => setLanguage('en')}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                language === 'en'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              EN
            </button>
          </div>

          <Button variant="outline" size="sm" asChild>
            <a href={CLINIC_INFO.phoneLink}>
              <Phone className="mr-2 h-4 w-4" />
              {t('cta.call')}
            </a>
          </Button>

          <Button size="sm" className="bg-whatsapp hover:bg-whatsapp/90" asChild>
            <a href={CLINIC_INFO.whatsapp} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="mr-2 h-4 w-4" />
              WhatsApp
            </a>
          </Button>

          {/* Auth / Admin */}
          {!loading && (
            <>
              {!user ? (
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/auth">
                    <LogIn className="mr-2 h-4 w-4" />
                    {language === 'ms' ? 'Log Masuk' : 'Login'}
                  </Link>
                </Button>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-2">
                      <User className="h-4 w-4" />
                      <span className="max-w-[120px] truncate">{user.email}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {isStaffOrAdmin && (
                      <>
                        <DropdownMenuItem asChild>
                          <Link to="/admin" className="flex items-center gap-2">
                            <Settings className="h-4 w-4" />
                            {language === 'ms' ? 'Panel Admin' : 'Admin Panel'}
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuItem onClick={() => signOut()} className="flex items-center gap-2">
                      <LogOut className="h-4 w-4" />
                      {language === 'ms' ? 'Log Keluar' : 'Logout'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </>
          )}
        </div>

        {/* Mobile Menu */}
        <div className="flex items-center gap-2 lg:hidden">
          {/* Language Toggle Mobile */}
          <div className="flex items-center rounded-lg border border-border p-0.5">
            <button
              onClick={() => setLanguage('ms')}
              className={cn(
                'px-2 py-1 text-xs font-medium rounded-md transition-colors',
                language === 'ms'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground'
              )}
            >
              BM
            </button>
            <button
              onClick={() => setLanguage('en')}
              className={cn(
                'px-2 py-1 text-xs font-medium rounded-md transition-colors',
                language === 'en'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground'
              )}
            >
              EN
            </button>
          </div>

          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full max-w-sm">
              <div className="flex flex-col gap-6 pt-6">
                <nav className="flex flex-col gap-1">
                  {NAV_ITEMS.map((item) => (
                    <Link
                      key={item.href}
                      to={item.href}
                      onClick={() => setIsOpen(false)}
                      className={cn(
                        'px-4 py-3 text-base font-medium rounded-lg transition-colors',
                        isActive(item.href)
                          ? 'bg-primary/10 text-primary'
                          : 'text-foreground hover:bg-muted'
                      )}
                    >
                      {t(item.labelKey)}
                    </Link>
                  ))}
                </nav>

                <div className="flex flex-col gap-3 border-t border-border pt-6">
                  <Button size="lg" variant="outline" asChild>
                    <a href={CLINIC_INFO.phoneLink}>
                      <Phone className="mr-2 h-5 w-5" />
                      {t('cta.call')} - {CLINIC_INFO.phone}
                    </a>
                  </Button>
                  <Button size="lg" className="bg-whatsapp hover:bg-whatsapp/90" asChild>
                    <a href={CLINIC_INFO.whatsapp} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="mr-2 h-5 w-5" />
                      WhatsApp
                    </a>
                  </Button>

                  {/* Auth / Admin Mobile */}
                  {!loading && (
                    <>
                      {!user ? (
                        <Button size="lg" variant="outline" asChild onClick={() => setIsOpen(false)}>
                          <Link to="/auth">
                            <LogIn className="mr-2 h-5 w-5" />
                            {language === 'ms' ? 'Log Masuk' : 'Login'}
                          </Link>
                        </Button>
                      ) : (
                        <>
                          {isStaffOrAdmin && (
                            <Button size="lg" variant="outline" asChild onClick={() => setIsOpen(false)}>
                              <Link to="/admin">
                                <Settings className="mr-2 h-5 w-5" />
                                {language === 'ms' ? 'Panel Admin' : 'Admin Panel'}
                              </Link>
                            </Button>
                          )}
                          <Button size="lg" variant="ghost" onClick={() => { signOut(); setIsOpen(false); }}>
                            <LogOut className="mr-2 h-5 w-5" />
                            {language === 'ms' ? 'Log Keluar' : 'Logout'}
                          </Button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
