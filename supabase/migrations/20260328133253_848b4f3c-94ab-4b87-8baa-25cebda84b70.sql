ALTER TABLE public.performance_appraisals ADD COLUMN appraisal_type text NOT NULL DEFAULT 'doctor';
ALTER TABLE public.appraisal_responses ADD COLUMN competency_responses jsonb DEFAULT '{}'::jsonb;