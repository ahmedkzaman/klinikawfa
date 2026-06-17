import { useState, useCallback, useRef, useEffect } from 'react';
import { useScribe, CommitStrategy } from '@elevenlabs/react';
import { supabase } from '@/integrations/supabase/client';

export interface TranscriptSegment {
  id: string;
  text: string;
  speaker?: string;
  timestamp: number;
}

export interface StructuredNotes {
  chief_complaint?: string;
  history_present_illness?: string;
  past_medical_history?: string;
  family_history?: string;
  allergies?: string;
  social_history?: string;
  examination_findings?: string;
  assessment?: string;
  plan?: string;
}

interface UseTranscriptionOptions {
  roomId: string;
  onError?: (error: string) => void;
}

export function useTranscription({ roomId, onError }: UseTranscriptionOptions) {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [partialText, setPartialText] = useState('');
  const [structuredNotes, setStructuredNotes] = useState<StructuredNotes | null>(null);
  const [isStructuring, setIsStructuring] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const segmentIdCounter = useRef(0);

  const scribe = useScribe({
    modelId: 'scribe_v2_realtime',
    commitStrategy: CommitStrategy.VAD,
    onPartialTranscript: (data) => {
      setPartialText(data.text);
    },
    onCommittedTranscript: (data) => {
      const newSegment: TranscriptSegment = {
        id: `seg-${++segmentIdCounter.current}`,
        text: data.text,
        timestamp: Date.now(),
      };
      setSegments(prev => [...prev, newSegment]);
      setPartialText('');
    },
  });

  const startTranscription = useCallback(async () => {
    try {
      // Request microphone permission first
      await navigator.mediaDevices.getUserMedia({ audio: true });

      // Get token from edge function
      const { data, error } = await supabase.functions.invoke('elevenlabs-scribe-token');

      if (error || !data?.token) {
        throw new Error(error?.message || 'Failed to get transcription token');
      }

      // Connect to ElevenLabs Scribe
      await scribe.connect({
        token: data.token,
        microphone: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      setIsTranscribing(true);
    } catch (error) {
      console.error('[useTranscription] Start error:', error);
      onError?.(error instanceof Error ? error.message : 'Failed to start transcription');
    }
  }, [scribe, onError]);

  const stopTranscription = useCallback(async () => {
    try {
      await scribe.disconnect();
      setIsTranscribing(false);
      setPartialText('');
    } catch (error) {
      console.error('[useTranscription] Stop error:', error);
    }
  }, [scribe]);

  const getFullTranscript = useCallback(() => {
    return segments.map(s => s.text).join('\n\n');
  }, [segments]);

  const structureNotes = useCallback(async () => {
    const transcript = getFullTranscript();
    if (!transcript.trim()) {
      onError?.('No transcript to structure');
      return null;
    }

    setIsStructuring(true);
    try {
      const { data, error } = await supabase.functions.invoke('structure-medical-notes', {
        body: { transcript },
      });

      if (error) {
        throw new Error(error.message || 'Failed to structure notes');
      }

      setStructuredNotes(data);
      return data as StructuredNotes;
    } catch (error) {
      console.error('[useTranscription] Structure error:', error);
      onError?.(error instanceof Error ? error.message : 'Failed to structure notes');
      return null;
    } finally {
      setIsStructuring(false);
    }
  }, [getFullTranscript, onError]);

  const saveTranscript = useCallback(async (notes?: StructuredNotes) => {
    const notesToSave = notes || structuredNotes;
    const rawTranscript = segments.map(s => ({
      id: s.id,
      text: s.text,
      timestamp: s.timestamp,
    }));

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('consultation_transcripts')
        .upsert({
          room_id: roomId,
          raw_transcript: rawTranscript,
          chief_complaint: notesToSave?.chief_complaint || null,
          history_present_illness: notesToSave?.history_present_illness || null,
          past_medical_history: notesToSave?.past_medical_history || null,
          family_history: notesToSave?.family_history || null,
          allergies: notesToSave?.allergies || null,
          social_history: notesToSave?.social_history || null,
          examination_findings: notesToSave?.examination_findings || null,
          assessment: notesToSave?.assessment || null,
          plan: notesToSave?.plan || null,
          is_finalized: false,
        }, {
          onConflict: 'room_id',
        });

      if (error) {
        throw error;
      }

      return true;
    } catch (error) {
      console.error('[useTranscription] Save error:', error);
      onError?.(error instanceof Error ? error.message : 'Failed to save transcript');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [roomId, segments, structuredNotes, onError]);

  const updateNotes = useCallback((updates: Partial<StructuredNotes>) => {
    setStructuredNotes(prev => prev ? { ...prev, ...updates } : updates);
  }, []);

  const clearTranscript = useCallback(() => {
    setSegments([]);
    setPartialText('');
    setStructuredNotes(null);
    segmentIdCounter.current = 0;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scribe.isConnected) {
        scribe.disconnect();
      }
    };
  }, [scribe]);

  return {
    // State
    isTranscribing,
    isConnected: scribe.isConnected,
    segments,
    partialText,
    structuredNotes,
    isStructuring,
    isSaving,

    // Actions
    startTranscription,
    stopTranscription,
    getFullTranscript,
    structureNotes,
    saveTranscript,
    updateNotes,
    clearTranscript,
  };
}
