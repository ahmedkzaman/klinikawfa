import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
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
import logoKlinikAwfa from '@/assets/logo-klinik-awfa.png';

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
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="sticky top-0 z-50 w-full border-b border-border/30 glass"
    >
      <div className="container flex h-16 items-center justify-between md:h-18">
        {/* Logo */}
        <Link to="/" className="group flex items-center gap-3">
          <motion.img
            whileHover={{ scale: 1.05, rotate: 2 }}
            whileTap={{ scale: 0.95 }}
            src={logoKlinikAwfa}
            alt="Klinik Awfa Logo"
            className="h-11 w-auto object-contain"
          />
          <span className="hidden font-display text-xl font-bold text-foreground sm:inline-block group-hover:text-primary transition-colors">
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
                'relative px-4 py-2 text-sm font-medium rounded-xl transition-all duration-300',
                isActive(item.href)
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              {t(item.labelKey)}
              {isActive(item.href) && (
                <motion.div
                  layoutId="activeNav"
                  className="absolute inset-0 bg-primary/10 rounded-xl -z-10"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
            </Link>
          ))}
        </nav>

        {/* Desktop Actions */}
        <div className="hidden items-center gap-3 lg:flex">
          {/* Language Toggle */}
          <div className="flex items-center rounded-xl border border-border/50 bg-muted/30 p-1" role="group" aria-label="Language selection">
            <button
              onClick={() => setLanguage('ms')}
              aria-label="Tukar ke Bahasa Melayu"
              aria-pressed={language === 'ms'}
              className={cn(
                'px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-300',
                language === 'ms'
                  ? 'bg-gradient-to-r from-primary to-primary-glow text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              BM
            </button>
            <button
              onClick={() => setLanguage('en')}
              aria-label="Switch to English"
              aria-pressed={language === 'en'}
              className={cn(
                'px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-300',
                language === 'en'
                  ? 'bg-gradient-to-r from-primary to-primary-glow text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              EN
            </button>
          </div>

          <Button variant="outline" size="sm" className="border-2 hover:border-primary/50 hover:bg-primary/5" asChild>
            <a href={CLINIC_INFO.phoneLink}>
              <Phone className="mr-2 h-4 w-4" />
              {t('cta.call')}
            </a>
          </Button>

          <Button size="sm" className="bg-whatsapp text-whatsapp-foreground hover:bg-whatsapp/90 shadow-sm" asChild>
            <a href={CLINIC_INFO.whatsapp} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="mr-2 h-4 w-4" />
              WhatsApp
            </a>
          </Button>

          {/* Auth / Admin */}
          {!loading && (
            <>
              {!user ? (
                <Button variant="ghost" size="sm" className="hover:bg-muted/50" asChild>
                  <Link to="/auth">
                    <LogIn className="mr-2 h-4 w-4" />
                    {language === 'ms' ? 'Log Masuk' : 'Login'}
                  </Link>
                </Button>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-2 hover:bg-muted/50">
                      <div className="h-7 w-7 rounded-full bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center">
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
        <div className="flex items-center gap-2 lg:hidden">
          {/* Language Toggle Mobile */}
          <div className="flex items-center rounded-lg border border-border/50 bg-muted/30 p-0.5" role="group" aria-label="Language selection">
            <button
              onClick={() => setLanguage('ms')}
              aria-label="Tukar ke Bahasa Melayu"
              aria-pressed={language === 'ms'}
              className={cn(
                'px-2 py-1 text-xs font-semibold rounded-md transition-all',
                language === 'ms'
                  ? 'bg-gradient-to-r from-primary to-primary-glow text-primary-foreground'
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
                'px-2 py-1 text-xs font-semibold rounded-md transition-all',
                language === 'en'
                  ? 'bg-gradient-to-r from-primary to-primary-glow text-primary-foreground'
                  : 'text-muted-foreground'
              )}
            >
              EN
            </button>
          </div>

          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-10 w-10 hover:bg-muted/50">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full max-w-sm glass border-l border-border/30">
              <div className="flex flex-col gap-6 pt-8">
                <nav className="flex flex-col gap-2">
                  {NAV_ITEMS.map((item) => (
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
                      {t(item.labelKey)}
                    </Link>
                  ))}
                </nav>

                <div className="flex flex-col gap-3 border-t border-border/50 pt-6">
                  <Button size="lg" variant="outline" className="border-2" asChild>
                    <a href={CLINIC_INFO.phoneLink}>
                      <Phone className="mr-2 h-5 w-5" />
                      {t('cta.call')} - {CLINIC_INFO.phone}
                    </a>
                  </Button>
                  <Button size="lg" className="bg-whatsapp text-whatsapp-foreground hover:bg-whatsapp/90" asChild>
                    <a href={CLINIC_INFO.whatsapp} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="mr-2 h-5 w-5" />
                      WhatsApp
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
    </motion.header>
  );
}
