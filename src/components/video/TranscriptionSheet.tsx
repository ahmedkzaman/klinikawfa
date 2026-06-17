import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { FileText } from 'lucide-react';
import { TranscriptionPanel } from './TranscriptionPanel';
import { TranscriptSegment, StructuredNotes } from '@/hooks/useTranscription';
import { useLanguage } from '@/contexts/LanguageContext';

interface TranscriptionSheetProps {
  isTranscribing: boolean;
  isConnected: boolean;
  segments: TranscriptSegment[];
  partialText: string;
  structuredNotes: StructuredNotes | null;
  isStructuring: boolean;
  isSaving: boolean;
  onStartTranscription: () => void;
  onStopTranscription: () => void;
  onStructureNotes: () => void;
  onSave: () => void;
  onUpdateNotes: (updates: Partial<StructuredNotes>) => void;
}

export function TranscriptionSheet({
  isTranscribing,
  isConnected,
  segments,
  partialText,
  structuredNotes,
  isStructuring,
  isSaving,
  onStartTranscription,
  onStopTranscription,
  onStructureNotes,
  onSave,
  onUpdateNotes,
}: TranscriptionSheetProps) {
  const { language } = useLanguage();

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="secondary"
          size="icon"
          className="absolute bottom-24 left-4 h-12 w-12 rounded-full shadow-lg z-30"
        >
          <FileText className="h-5 w-5" />
          {isConnected && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white animate-pulse" />
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[70vh] p-0">
        <SheetHeader className="px-4 py-3 border-b">
          <SheetTitle className="text-base">
            {language === 'ms' ? 'Transkripsi Perubatan' : 'Medical Transcription'}
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 h-[calc(70vh-60px)] p-4">
          <TranscriptionPanel
            isTranscribing={isTranscribing}
            isConnected={isConnected}
            segments={segments}
            partialText={partialText}
            structuredNotes={structuredNotes}
            isStructuring={isStructuring}
            isSaving={isSaving}
            onStartTranscription={onStartTranscription}
            onStopTranscription={onStopTranscription}
            onStructureNotes={onStructureNotes}
            onSave={onSave}
            onUpdateNotes={onUpdateNotes}
            className="h-full border-0 shadow-none"
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
