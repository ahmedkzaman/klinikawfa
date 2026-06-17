import React, { useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Mic, MicOff, FileText, Loader2, Save, Wand2 } from 'lucide-react';
import { TranscriptSegment, StructuredNotes } from '@/hooks/useTranscription';
import { MedicalNotesEditor } from './MedicalNotesEditor';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

interface TranscriptionPanelProps {
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
  className?: string;
}

export function TranscriptionPanel({
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
  className,
}: TranscriptionPanelProps) {
  const { language } = useLanguage();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new segments arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [segments, partialText]);

  const hasTranscript = segments.length > 0;

  return (
    <Card className={cn('flex flex-col h-full', className)}>
      <CardHeader className="flex-shrink-0 pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {language === 'ms' ? 'Transkripsi' : 'Transcription'}
          </CardTitle>
          <div className="flex items-center gap-2">
            {isConnected && (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5 animate-pulse" />
                {language === 'ms' ? 'Aktif' : 'Active'}
              </Badge>
            )}
            <Button
              variant={isTranscribing ? 'destructive' : 'default'}
              size="sm"
              onClick={isTranscribing ? onStopTranscription : onStartTranscription}
            >
              {isTranscribing ? (
                <>
                  <MicOff className="h-4 w-4 mr-1" />
                  {language === 'ms' ? 'Henti' : 'Stop'}
                </>
              ) : (
                <>
                  <Mic className="h-4 w-4 mr-1" />
                  {language === 'ms' ? 'Mula' : 'Start'}
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col min-h-0 pt-0">
        <Tabs defaultValue="transcript" className="flex flex-col flex-1 min-h-0">
          <TabsList className="grid w-full grid-cols-2 mb-3">
            <TabsTrigger value="transcript">
              {language === 'ms' ? 'Transkrip' : 'Transcript'}
            </TabsTrigger>
            <TabsTrigger value="notes">
              {language === 'ms' ? 'Nota' : 'Notes'}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="transcript" className="flex-1 min-h-0 mt-0">
            <div className="flex flex-col h-full">
              <ScrollArea className="flex-1 border rounded-md p-3" ref={scrollRef}>
                {segments.length === 0 && !partialText ? (
                  <div className="text-center text-muted-foreground py-8">
                    <Mic className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">
                      {language === 'ms' 
                        ? 'Klik "Mula" untuk memulakan transkripsi' 
                        : 'Click "Start" to begin transcription'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {segments.map((segment) => (
                      <div key={segment.id} className="text-sm">
                        <span className="text-muted-foreground text-xs">
                          {new Date(segment.timestamp).toLocaleTimeString()}
                        </span>
                        <p className="mt-0.5">{segment.text}</p>
                      </div>
                    ))}
                    {partialText && (
                      <div className="text-sm text-muted-foreground italic">
                        {partialText}...
                      </div>
                    )}
                  </div>
                )}
              </ScrollArea>

              {hasTranscript && (
                <div className="flex gap-2 mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onStructureNotes}
                    disabled={isStructuring}
                    className="flex-1"
                  >
                    {isStructuring ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Wand2 className="h-4 w-4 mr-1" />
                    )}
                    {language === 'ms' ? 'Struktur dengan AI' : 'Structure with AI'}
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="notes" className="flex-1 min-h-0 mt-0">
            <div className="flex flex-col h-full">
              <ScrollArea className="flex-1">
                <MedicalNotesEditor
                  notes={structuredNotes}
                  onUpdate={onUpdateNotes}
                  disabled={isStructuring}
                />
              </ScrollArea>

              <div className="flex gap-2 mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onStructureNotes}
                  disabled={isStructuring || !hasTranscript}
                  className="flex-1"
                >
                  {isStructuring ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4 mr-1" />
                  )}
                  {language === 'ms' ? 'Jana Semula' : 'Regenerate'}
                </Button>
                <Button
                  size="sm"
                  onClick={onSave}
                  disabled={isSaving || (!hasTranscript && !structuredNotes)}
                  className="flex-1"
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-1" />
                  )}
                  {language === 'ms' ? 'Simpan' : 'Save'}
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
