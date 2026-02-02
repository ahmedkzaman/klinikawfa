-- Create consultation_transcripts table
CREATE TABLE public.consultation_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES public.video_rooms(id) ON DELETE CASCADE NOT NULL,
  
  -- Raw transcript data (array of speaker segments)
  raw_transcript JSONB DEFAULT '[]'::jsonb,
  
  -- Structured medical notes (SOAP-like format)
  chief_complaint TEXT,
  history_present_illness TEXT,
  past_medical_history TEXT,
  family_history TEXT,
  allergies TEXT,
  social_history TEXT,
  examination_findings TEXT,
  assessment TEXT,
  plan TEXT,
  
  -- Additional notes
  additional_notes TEXT,
  
  -- Metadata
  is_finalized BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.consultation_transcripts ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Only staff/admin can manage transcripts
CREATE POLICY "Staff/Admin can view transcripts"
  ON public.consultation_transcripts
  FOR SELECT
  USING (public.is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff/Admin can insert transcripts"
  ON public.consultation_transcripts
  FOR INSERT
  WITH CHECK (public.is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff/Admin can update transcripts"
  ON public.consultation_transcripts
  FOR UPDATE
  USING (public.is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff/Admin can delete transcripts"
  ON public.consultation_transcripts
  FOR DELETE
  USING (public.is_staff_or_admin(auth.uid()));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_consultation_transcripts_updated_at
  BEFORE UPDATE ON public.consultation_transcripts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups by room_id
CREATE INDEX idx_consultation_transcripts_room_id ON public.consultation_transcripts(room_id);