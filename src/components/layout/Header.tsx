import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { NAV_ITEMS, CLINIC_INFO } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CalendarDays, Menu, Phone, MessageCircle, LogIn, Settings, LogOut, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import logoKlinikAwfa from '@/assets/logo-klinik-awfa.png';
import { usePublishedNavigation } from '@/hooks/usePublishedNavigation';

export function Header() {
  const { language, setLanguage, t } = useLanguage();
  const { user, isStaffOrAdmin, signOut, loading } = useAuth();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const managedNavigation = usePublishedNavigation();
  const navigationItems = managedNavigation?.filter((item) => !item.parentId).map((item) => ({ href: item.href, label: language === 'en' ? item.labelEn || item.labelMs : item.labelMs })) ?? NAV_ITEMS.map((item) => ({ href: item.href, label: t(item.labelKey) }));

  const isActive = (href: string) => {
    if (href === '/') return location.pathname === '/';
    return location.pathname.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background">
      <div className="container flex h-16 items-center justify-between md:h-18">
        {/* Logo */}
        <Link to="/" className="group flex items-center gap-3">
          <img
            src={logoKlinikAwfa}
            alt="Klinik Awfa Logo"
            className="h-11 w-auto object-contain"
          />
          <span className="hidden font-display text-xl font-bold text-foreground sm:inline-block group-hover:text-primary transition-colors">
            {CLINIC_INFO.name}
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav aria-label={language === 'ms' ? 'Navigasi utama' : 'Main navigation'} className="hidden items-center gap-1 2xl:flex">
          {navigationItems.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                'relative inline-flex min-h-11 items-center px-3 text-sm font-medium transition-colors duration-200',
                isActive(item.href)
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              {item.label}
              {isActive(item.href) && (
                <div
                  className="absolute inset-x-3 -bottom-[13px] h-0.5 bg-primary"
                />
              )}
            </Link>
          ))}
        </nav>

        {/* Desktop Actions */}
        <div className="hidden items-center gap-3 2xl:flex">
          <Button size="sm" className="min-h-11" asChild>
            <Link to="/appointment">{language === 'ms' ? 'Buat Temujanji' : 'Book Appointment'}</Link>
          </Button>

          <Button size="sm" className="min-h-11 bg-whatsapp text-whatsapp-foreground hover:bg-whatsapp/90" asChild>
            <a href={CLINIC_INFO.whatsapp} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="mr-2 h-4 w-4" />
              WhatsApp
            </a>
          </Button>

          <Button size="sm" variant="outline" className="min-h-11" asChild>
            <a href={CLINIC_INFO.phoneLink}>{CLINIC_INFO.phone}</a>
          </Button>

          {/* Language Toggle */}
          <div className="flex items-center rounded-lg border border-border p-1" role="group" aria-label="Language selection">
            <button
              onClick={() => setLanguage('ms')}
              aria-label="Tukar ke Bahasa Melayu"
              aria-pressed={language === 'ms'}
              className={cn(
                'min-h-11 px-3 text-xs font-semibold rounded-md transition-colors',
                language === 'ms' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              BM
            </button>
            <button
              onClick={() => setLanguage('en')}
              aria-label="Switch to English"
              aria-pressed={language === 'en'}
              className={cn(
                'min-h-11 px-3 text-xs font-semibold rounded-md transition-colors',
                language === 'en' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              EN
            </button>
          </div>

          {/* Auth / Admin */}
          {!loading && (
            <>
              {!user ? (
                <Button variant="ghost" size="sm" className="min-h-11 hover:bg-muted/50" asChild>
                  <Link to="/auth">
                    <LogIn className="mr-2 h-4 w-4" />
                    {language === 'ms' ? 'Log Masuk' : 'Login'}
                  </Link>
                </Button>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="min-h-11 gap-2 hover:bg-muted/50">
                      <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center">
                        <User className="h-4 w-4 text-primary-foreground" />
                      </div>
                      <span className="max-w-[100px] truncate text-xs">{user.email}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {isStaffOrAdmin && (
                      <>
                        <DropdownMenuItem asChild>
                          <Link to="/staff/dashboard" className="flex items-center gap-2">
                            <Settings className="h-4 w-4" />
                            {language === 'ms' ? 'Portal Staf' : 'Staff Portal'}
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuItem onClick={() => signOut()} className="flex items-center gap-2 text-destructive">
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
        <div data-testid="compact-header-controls" className="flex items-center gap-2 2xl:hidden">
          {/* Language Toggle Mobile */}
          <div className="flex items-center rounded-lg border border-border/50 bg-muted/30 p-0.5" role="group" aria-label="Language selection">
            <button
              onClick={() => setLanguage('ms')}
              aria-label="Tukar ke Bahasa Melayu"
              aria-pressed={language === 'ms'}
              className={cn(
                'min-h-11 px-2 text-xs font-semibold rounded-md transition-colors',
                language === 'ms'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground'
              )}
            >
              BM
            </button>
            <button
              onClick={() => setLanguage('en')}
              aria-label="Switch to English"
              aria-pressed={language === 'en'}
              className={cn(
                'min-h-11 px-2 text-xs font-semibold rounded-md transition-colors',
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
              <Button variant="ghost" size="icon" className="min-h-11 min-w-11 hover:bg-muted/50" aria-label={language === 'ms' ? 'Menu' : 'Menu'}>
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-full max-w-sm bg-background border-l border-border"
              aria-describedby={undefined}
            >
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <div className="flex flex-col gap-6 pt-8">
                <nav aria-label={language === 'ms' ? 'Navigasi utama' : 'Main navigation'} className="flex flex-col gap-2">
                  {navigationItems.map((item) => (
                    <Link
                      key={item.href}
                      to={item.href}
                      onClick={() => setIsOpen(false)}
                      className={cn(
                        'px-4 py-3.5 text-base font-medium rounded-xl transition-all',
                        isActive(item.href)
                          ? 'bg-primary/10 text-primary'
                          : 'text-foreground hover:bg-muted/50'
                      )}
                    >
                      {item.label}
                    </Link>
                  ))}
                </nav>

                <div data-testid="compact-header-actions" className="flex flex-col gap-3 border-t border-border/50 pt-6">
                  <Button size="lg" asChild onClick={() => setIsOpen(false)}>
                    <Link to="/appointment">
                      <CalendarDays className="mr-2 h-5 w-5" />
                      {t('cta.bookAppointment')}
                    </Link>
                  </Button>
                  <Button size="lg" className="bg-whatsapp text-whatsapp-foreground hover:bg-whatsapp/90" asChild>
                    <a href={CLINIC_INFO.whatsapp} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="mr-2 h-5 w-5" />
                      WhatsApp
                    </a>
                  </Button>
                  <Button size="lg" variant="outline" className="border-2" asChild>
                    <a href={CLINIC_INFO.phoneLink}>
                      <Phone className="mr-2 h-5 w-5" />
                      {t('cta.call')} - {CLINIC_INFO.phone}
                    </a>
                  </Button>

                  {/* Auth / Admin Mobile */}
                  {!loading && (
                    <>
                      {!user ? (
                        <Button size="lg" variant="outline" className="border-2" asChild onClick={() => setIsOpen(false)}>
                          <Link to="/auth">
                            <LogIn className="mr-2 h-5 w-5" />
                            {language === 'ms' ? 'Log Masuk' : 'Login'}
                          </Link>
                        </Button>
                      ) : (
                        <>
                          {isStaffOrAdmin && (
                            <Button size="lg" variant="outline" className="border-2" asChild onClick={() => setIsOpen(false)}>
                              <Link to="/staff/dashboard">
                                <Settings className="mr-2 h-5 w-5" />
                                {language === 'ms' ? 'Portal Staf' : 'Staff Portal'}
                              </Link>
                            </Button>
                          )}
                          <Button size="lg" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => { signOut(); setIsOpen(false); }}>
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
