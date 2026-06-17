import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'sonner';
import { MessageCircle, Facebook, Twitter, Link2 } from 'lucide-react';

interface ShareButtonsProps {
  title: string;
  url: string;
  excerpt?: string;
}

export default function ShareButtons({ title, url, excerpt }: ShareButtonsProps) {
  const { language } = useLanguage();
  const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`;
  const shareText = excerpt ? `${title} - ${excerpt}` : title;

  const handleWhatsAppShare = () => {
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${shareText}\n\n${fullUrl}`)}`;
    window.open(whatsappUrl, '_blank');
  };

  const handleFacebookShare = () => {
    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(fullUrl)}`;
    window.open(facebookUrl, '_blank', 'width=600,height=400');
  };

  const handleTwitterShare = () => {
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(fullUrl)}`;
    window.open(twitterUrl, '_blank', 'width=600,height=400');
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      toast.success(language === 'ms' ? 'Pautan disalin!' : 'Link copied!');
    } catch (error) {
      toast.error(language === 'ms' ? 'Gagal menyalin pautan' : 'Failed to copy link');
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium text-muted-foreground">
        {language === 'ms' ? 'Kongsi artikel ini:' : 'Share this article:'}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleWhatsAppShare}
          className="gap-2"
        >
          <MessageCircle className="h-4 w-4" />
          WhatsApp
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleFacebookShare}
          className="gap-2"
        >
          <Facebook className="h-4 w-4" />
          Facebook
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleTwitterShare}
          className="gap-2"
        >
          <Twitter className="h-4 w-4" />
          X
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopyLink}
          className="gap-2"
        >
          <Link2 className="h-4 w-4" />
          {language === 'ms' ? 'Salin Pautan' : 'Copy Link'}
        </Button>
      </div>
    </div>
  );
}
