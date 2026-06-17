import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Sparkles, ChevronDown, ChevronUp, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface GeneratedContent {
  title_ms: string;
  title_en: string;
  content_ms: string;
  content_en: string;
  excerpt_ms: string;
  excerpt_en: string;
  suggested_reading_time: number;
}

interface AIWritingAssistantProps {
  onContentGenerated: (content: GeneratedContent) => void;
  categoryName?: string;
}

const TONES = [
  { value: 'empathetic', labelMs: 'Empati', labelEn: 'Empathetic', descMs: 'Fokus pada pemahaman dan sokongan', descEn: 'Focus on understanding and support' },
  { value: 'educational', labelMs: 'Pendidikan', labelEn: 'Educational', descMs: 'Informatif dan mudah difahami', descEn: 'Informative and easy to understand' },
  { value: 'motivational', labelMs: 'Motivasi', labelEn: 'Motivational', descMs: 'Memberi inspirasi untuk bertindak', descEn: 'Inspiring action' },
] as const;

const TARGET_AUDIENCES = [
  { value: 'parents', labelMs: 'Ibu bapa', labelEn: 'Parents' },
  { value: 'parents-children', labelMs: 'Ibu bapa kanak-kanak kecil', labelEn: 'Parents of young children' },
  { value: 'adults', labelMs: 'Dewasa', labelEn: 'Adults' },
  { value: 'elderly', labelMs: 'Warga emas', labelEn: 'Elderly' },
  { value: 'general', labelMs: 'Umum', labelEn: 'General public' },
];

export default function AIWritingAssistant({ onContentGenerated, categoryName }: AIWritingAssistantProps) {
  const { language } = useLanguage();
  const { toast } = useToast();
  
  const [isOpen, setIsOpen] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [topic, setTopic] = useState('');
  const [keyPoints, setKeyPoints] = useState('');
  const [tone, setTone] = useState<'empathetic' | 'educational' | 'motivational'>('empathetic');
  const [targetAudience, setTargetAudience] = useState('parents');

  const handleGenerate = async () => {
    if (!topic.trim()) {
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms' ? 'Sila masukkan topik.' : 'Please enter a topic.',
        variant: 'destructive',
      });
      return;
    }

    // Parse key points from textarea (one per line)
    const pointsArray = keyPoints
      .split('\n')
      .map(p => p.trim())
      .filter(p => p.length > 0);

    if (pointsArray.length === 0) {
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms' ? 'Sila masukkan sekurang-kurangnya satu poin utama.' : 'Please enter at least one key point.',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const audienceLabel = TARGET_AUDIENCES.find(a => a.value === targetAudience);
      
      const { data, error: fnError } = await supabase.functions.invoke('generate-blog-content', {
        body: {
          topic: topic.trim(),
          key_points: pointsArray,
          category: categoryName || 'General Health',
          tone,
          target_audience: language === 'ms' ? audienceLabel?.labelMs : audienceLabel?.labelEn,
        },
      });

      if (fnError) {
        throw new Error(fnError.message);
      }

      if (data.error) {
        throw new Error(data.error);
      }

      onContentGenerated(data);
      
      toast({
        title: language === 'ms' ? 'Berjaya!' : 'Success!',
        description: language === 'ms' 
          ? 'Kandungan AI dijana. Sila semak dan edit mengikut keperluan.' 
          : 'AI content generated. Please review and edit as needed.',
      });
    } catch (err: any) {
      console.error('Error generating content:', err);
      
      let errorMessage = language === 'ms' 
        ? 'Gagal menjana kandungan. Sila cuba lagi.' 
        : 'Failed to generate content. Please try again.';
      
      if (err.message?.includes('Rate limit') || err.message?.includes('429')) {
        errorMessage = language === 'ms'
          ? 'Terlalu banyak permintaan. Sila tunggu sebentar dan cuba lagi.'
          : 'Too many requests. Please wait a moment and try again.';
      } else if (err.message?.includes('402') || err.message?.includes('credits')) {
        errorMessage = language === 'ms'
          ? 'Kredit AI telah habis. Sila hubungi sokongan.'
          : 'AI credits exhausted. Please contact support.';
      }
      
      setError(errorMessage);
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card className="border-primary/20 bg-gradient-to-b from-primary/5 to-background">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">
                  {language === 'ms' ? 'Pembantu Penulisan AI' : 'AI Writing Assistant'}
                </CardTitle>
              </div>
              {isOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </CollapsibleTrigger>
          <CardDescription>
            {language === 'ms' 
              ? 'Jana kandungan emosi untuk blog kesihatan anda'
              : 'Generate emotional content for your health blog'}
          </CardDescription>
        </CardHeader>
        
        <CollapsibleContent>
          <CardContent className="space-y-4">
            {/* Topic */}
            <div className="space-y-2">
              <Label htmlFor="ai-topic">
                {language === 'ms' ? 'Topik' : 'Topic'} *
              </Label>
              <Input
                id="ai-topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={language === 'ms' 
                  ? 'cth: Pembersihan telinga untuk kanak-kanak'
                  : 'e.g., Ear cleaning for children'}
                disabled={isGenerating}
              />
            </div>

            {/* Key Points */}
            <div className="space-y-2">
              <Label htmlFor="ai-points">
                {language === 'ms' ? 'Poin Utama' : 'Key Points'} *
              </Label>
              <Textarea
                id="ai-points"
                value={keyPoints}
                onChange={(e) => setKeyPoints(e.target.value)}
                placeholder={language === 'ms' 
                  ? 'Satu poin setiap baris:\n- Prosedur yang selamat\n- Tiada kesakitan\n- Bila perlu berjumpa doktor'
                  : 'One point per line:\n- Safe procedure\n- No pain\n- When to see a doctor'}
                rows={4}
                disabled={isGenerating}
              />
              <p className="text-xs text-muted-foreground">
                {language === 'ms' 
                  ? 'Masukkan satu poin setiap baris'
                  : 'Enter one point per line'}
              </p>
            </div>

            {/* Tone */}
            <div className="space-y-2">
              <Label htmlFor="ai-tone">
                {language === 'ms' ? 'Nada Penulisan' : 'Writing Tone'}
              </Label>
              <Select value={tone} onValueChange={(v: any) => setTone(v)} disabled={isGenerating}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <div>
                        <div>{language === 'ms' ? t.labelMs : t.labelEn}</div>
                        <div className="text-xs text-muted-foreground">
                          {language === 'ms' ? t.descMs : t.descEn}
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Target Audience */}
            <div className="space-y-2">
              <Label htmlFor="ai-audience">
                {language === 'ms' ? 'Sasaran Pembaca' : 'Target Audience'}
              </Label>
              <Select value={targetAudience} onValueChange={setTargetAudience} disabled={isGenerating}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TARGET_AUDIENCES.map((a) => (
                    <SelectItem key={a.value} value={a.value}>
                      {language === 'ms' ? a.labelMs : a.labelEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Error Display */}
            {error && (
              <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Generate Button */}
            <Button 
              onClick={handleGenerate} 
              disabled={isGenerating}
              className="w-full"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {language === 'ms' ? 'Menjana kandungan...' : 'Generating content...'}
                </>
              ) : error ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {language === 'ms' ? 'Cuba Lagi' : 'Try Again'}
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  {language === 'ms' ? 'Jana Kandungan dengan AI' : 'Generate Content with AI'}
                </>
              )}
            </Button>

            {/* Info Note */}
            <p className="text-xs text-muted-foreground text-center">
              {language === 'ms' 
                ? 'AI akan menjana kandungan dalam Bahasa Melayu dan Bahasa Inggeris'
                : 'AI will generate content in both Malay and English'}
            </p>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
