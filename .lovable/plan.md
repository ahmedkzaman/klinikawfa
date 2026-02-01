
# Improvement: Add Copy Link Button to Video Call Dashboard

## Current Limitation
Staff must manually copy the room code and construct the patient link.

## Proposed Enhancement
Add a button to copy the complete patient video call link directly from the admin dashboard.

---

## What Will Change

### Video Call Management Table
Add a "Copy Link" button next to the existing "Copy Room Code" button that copies the full patient URL.

**Example:**
- Room code: `ABC123`
- Copied link: `https://klinikawfa.lovable.app/video-call?room=ABC123`

---

## Technical Details

### File to Modify
`src/pages/admin/VideoCallManagement.tsx`

### Changes
1. Add a `copyPatientLink` function that constructs and copies the full URL
2. Add a new button with a link icon next to the copy room code button
3. Show a toast notification when the link is copied

### Code Snippet
```typescript
const copyPatientLink = (code: string) => {
  const baseUrl = window.location.origin;
  const patientUrl = `${baseUrl}/video-call?room=${code}`;
  navigator.clipboard.writeText(patientUrl);
  toast({
    title: 'Link copied!',
    description: 'Patient video call link copied to clipboard',
  });
};
```

---

## Summary
This is a simple quality-of-life improvement that adds a "Copy Link" button to each row in the video calls table, making it easier for staff to share the complete URL with patients via WhatsApp, SMS, or email.
