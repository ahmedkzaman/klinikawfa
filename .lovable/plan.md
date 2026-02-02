# Plan: Medical Consultation Transcriber

## ✅ Implementation Complete

The medical consultation transcriber has been implemented and integrated with the video call system.

## What Was Built

### Database
- `consultation_transcripts` table with RLS policies for staff/admin access
- Stores raw transcript segments and structured SOAP-format medical notes

### Edge Functions
- `elevenlabs-scribe-token` - Generates single-use tokens for ElevenLabs Scribe API
- `structure-medical-notes` - Uses Lovable AI (Gemini) to organize transcripts into medical note sections

### Frontend Components
- `useTranscription` hook - Manages ElevenLabs Scribe connection, transcription state, and saving
- `TranscriptionPanel` - Desktop panel with live transcript and structured notes tabs
- `TranscriptionSheet` - Mobile bottom sheet triggered by FAB button
- `MedicalNotesEditor` - Editable form for the 9 medical note sections

### Integration
- Staff video call page now includes transcription panel (desktop) or FAB button (mobile)
- Transcription auto-saves when call ends
- AI structures notes into SOAP format before saving

## Medical Note Sections

1. Chief Complaint (CC)
2. History of Present Illness (HPI)
3. Past Medical History (PMH)
4. Family History (FH)
5. Allergies
6. Social History
7. Examination Findings
8. Assessment
9. Plan

## How to Use

1. Start a video consultation as staff
2. Click "Start" on the transcription panel (or open the sheet on mobile)
3. Speak normally - the transcriber captures audio automatically
4. Click "Structure with AI" to organize notes into medical format
5. Edit any sections as needed
6. Notes are saved automatically when the call ends

## Files Created/Modified

| File | Type |
|------|------|
| `supabase/functions/elevenlabs-scribe-token/index.ts` | New |
| `supabase/functions/structure-medical-notes/index.ts` | New |
| `src/hooks/useTranscription.ts` | New |
| `src/components/video/TranscriptionPanel.tsx` | New |
| `src/components/video/TranscriptionSheet.tsx` | New |
| `src/components/video/MedicalNotesEditor.tsx` | New |
| `src/pages/VideoCallStaff.tsx` | Modified |
| `src/components/video/index.ts` | Modified |
| `supabase/config.toml` | Modified |
