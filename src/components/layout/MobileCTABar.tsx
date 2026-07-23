import { useLanguage } from '@/contexts/LanguageContext';
import { CLINIC_INFO } from '@/lib/constants';
import { Phone, MessageCircle } from 'lucide-react';

export function MobileCTABar() {
  const { t } = useLanguage();

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background p-2 lg:hidden">
      <div className="flex gap-2">
        <a
          href={CLINIC_INFO.phoneLink}
          className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-phone px-3 text-sm font-semibold text-phone-foreground transition-colors hover:bg-phone/90"
        >
          <Phone className="h-5 w-5" />
          {t('cta.call')}
        </a>
        <a
          href={CLINIC_INFO.whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-whatsapp px-3 text-sm font-semibold text-whatsapp-foreground transition-colors hover:bg-whatsapp/90"
        >
          <MessageCircle className="h-5 w-5" />
          WhatsApp
        </a>
      </div>
    </div>
  );
}
