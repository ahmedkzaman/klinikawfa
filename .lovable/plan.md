
# Plan: Medical Consultation Transcriber

## Overview

Add a real-time speech-to-text transcription feature to video consultations that automatically captures and structures the conversation between doctor and patient according to standard medical interview format (SOAP-like notes).

## How It Will Work

1. **During the Call**: A transcription panel appears alongside the video call (collapsible on mobile)
2. **Real-time Speech Recognition**: Audio from both doctor and patient is transcribed live using ElevenLabs Scribe API
3. **Smart Categorization**: The AI analyzes the conversation and organizes it into medical sections
4. **Post-Call Summary**: Structured medical notes are saved to the database and can be reviewed/edited

## Medical Interview Structure

The transcriber will organize content into these sections:

| Section | Content |
|---------|---------|
| **Chief Complaint (CC)** | Primary reason for consultation |
| **History of Present Illness (HPI)** | Details about current symptoms, onset, duration, severity |
| **Past Medical History (PMH)** | Previous illnesses, surgeries, hospitalizations |
| **Family History (FH)** | Relevant family medical conditions |
| **Allergies** | Drug allergies, food allergies, other allergies |
| **Social History** | Smoking, alcohol, occupation, lifestyle factors |
| **Examination Findings** | Observations noted during video consultation |
| **Assessment** | Doctor's clinical impression/diagnosis |
| **Plan** | Treatment plan, medications, follow-up instructions |

## User Interface

### Desktop Layout (Staff View)

```text
+------------------+------------------+-------------------+
|                  |                  |                   |
|   Remote Video   |   Local Video    |   Transcription   |
|   (Patient)      |   (Doctor)       |   Panel           |
|                  |                  |                   |
|                  |                  | [Live transcript] |
|                  |                  | [Structured notes]|
+------------------+------------------+-------------------+
|              Call Controls              | [Transcript]  |
+-----------------------------------------+---------------+
```

### Mobile Layout (Staff View)

```text
+-------------------------+
|     Call Header         |
+-------------------------+
|                         |
|     Remote Video        |
|     (Full Screen)       |
|            +--------+   |
|            | PiP    |   |
|            +--------+   |
|                         |
| [Transcript FAB Button] |
+-------------------------+
|     Call Controls       |
+-------------------------+
```

Pressing the transcript button opens a bottom sheet with live transcription.

## Technical Implementation

### 1. Database Changes

Add new table to store consultation transcripts:

```sql
CREATE TABLE consultation_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES video_rooms(id) ON DELETE CASCADE,
  
  -- Raw transcript data
  raw_transcript JSONB DEFAULT '[]',
  
  -- Structured medical notes (SOAP format)
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
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies
ALTER TABLE consultation_transcripts ENABLE ROW LEVEL SECURITY;

-- Staff/Admin can manage transcripts
CREATE POLICY "Staff/Admin can view transcripts"
  ON consultation_transcripts FOR SELECT
  USING (is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff/Admin can insert transcripts"
  ON consultation_transcripts FOR INSERT
  WITH CHECK (is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff/Admin can update transcripts"
  ON consultation_transcripts FOR UPDATE
  USING (is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff/Admin can delete transcripts"
  ON consultation_transcripts FOR DELETE
  USING (is_staff_or_admin(auth.uid()));
```

### 2. ElevenLabs Integration

Connect ElevenLabs for real-time speech-to-text:

**Files to create:**
- `supabase/functions/elevenlabs-scribe-token/index.ts` - Token generation for secure WebSocket connection

**Edge Function Implementation:**
```typescript
// Generates single-use token for ElevenLabs Scribe API
serve(async (req) => {
  const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
  
  const response = await fetch(
    "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe",
    {
      method: "POST",
      headers: { "xi-api-key": ELEVENLABS_API_KEY },
    }
  );
  
  const { token } = await response.json();
  return new Response(JSON.stringify({ token }));
});
```

### 3. AI-Powered Note Structuring

Create an edge function that uses Lovable AI (Gemini) to analyze raw transcripts and organize them into medical sections:

**File:** `supabase/functions/structure-medical-notes/index.ts`

This function will:
- Receive raw transcript text
- Use AI to identify and categorize medical information
- Return structured SOAP notes

### 4. Frontend Components

**New files to create:**

| File | Purpose |
|------|---------|
| `src/hooks/useTranscription.ts` | Hook for managing ElevenLabs Scribe connection and transcription state |
| `src/components/video/TranscriptionPanel.tsx` | Desktop panel showing live transcript and structured notes |
| `src/components/video/TranscriptionSheet.tsx` | Mobile bottom sheet for transcription |
| `src/components/video/TranscriptionToggle.tsx` | Toggle button to show/hide transcription |
| `src/components/video/MedicalNotesEditor.tsx` | Editable form for structured medical notes |

### 5. Integration with Existing Video Call

**Files to modify:**

| File | Changes |
|------|---------|
| `src/pages/VideoCallStaff.tsx` | Add transcription panel, initialize hook, save notes on call end |
| `src/components/video/MobileCallLayout.tsx` | Add transcript FAB button and bottom sheet |
| `src/components/video/index.ts` | Export new components |
| `supabase/config.toml` | Register new edge functions |

### 6. Post-Call Transcript View

Add transcript viewing to the Video Call Management:

**File to modify:** `src/pages/admin/VideoCallManagement.tsx`
- Add "View Transcript" option in the dropdown menu for ended calls
- Show modal with structured notes that can be edited

## Flow Diagram

```text
[Call Starts]
      |
      v
[Audio Capture from WebRTC Streams]
      |
      v
[ElevenLabs Scribe API (Real-time STT)]
      |
      v
[Raw Transcript Stored in State]
      |
      +---> [Live Display in Panel]
      |
[Call Ends]
      |
      v
[Send to Lovable AI for Structuring]
      |
      v
[Save Structured Notes to Database]
      |
      v
[View/Edit in Admin Panel]
```

## Implementation Steps

1. **Set up ElevenLabs connector** - Connect ElevenLabs for API access
2. **Database migration** - Create `consultation_transcripts` table with RLS
3. **Edge functions** - Create token and structuring functions
4. **Transcription hook** - Build `useTranscription` with ElevenLabs Scribe integration
5. **UI components** - Create transcription panel and related components
6. **Video call integration** - Add transcription to staff video call page
7. **Post-call view** - Add transcript viewing/editing in admin

## Files Summary

| Category | Files |
|----------|-------|
| **Database** | 1 migration file |
| **Edge Functions** | 2 new functions |
| **Hooks** | 1 new hook |
| **Components** | 4-5 new components |
| **Modified Files** | 4 files |
| **Config** | Update `config.toml` |

## Privacy & Compliance Notes

- Transcriptions are only stored in the database, not sent to external services beyond the STT provider
- Only staff/admin can access transcripts (enforced via RLS)
- Patients are not shown the transcription during the call
- Consider adding a disclaimer at call start that the call may be transcribed for medical records

## Dependencies Required

- ElevenLabs API key (via connector)
- `@elevenlabs/react` npm package (for useScribe hook)
