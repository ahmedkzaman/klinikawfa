

# Encrypted Video Call System with Payment Integration

## Overview

Create a secure, encrypted telemedicine video calling feature with integrated payment processing. Patients must pay an RM50 deposit before joining a video consultation, and will be charged RM5 per minute for the duration of the call.

## Payment Model

| Item | Amount |
|------|--------|
| Initial Deposit | RM50 |
| Per-Minute Rate | RM5/minute |
| Minimum Charge | RM50 (deposit) |

**How billing works:**
- Patient pays RM50 deposit upfront via Stripe
- Timer starts when both parties are connected
- At call end, if duration exceeds 10 minutes (RM50 worth), an additional charge is applied
- Example: 15-minute call = RM50 deposit + RM25 additional = RM75 total

---

## Implementation Steps

### Step 1: Enable Stripe Integration

Stripe will be enabled to handle secure payment processing. This will prompt you for your Stripe secret key.

### Step 2: Create Database Tables

**Table: `video_rooms`**
- `id` - unique identifier
- `room_code` - shareable code (e.g., "ABC-123-XYZ")
- `created_by` - staff who created the room
- `patient_name` - filled when patient joins
- `patient_email` - for payment receipt
- `status` - pending, paid, active, ended
- `deposit_amount` - RM50 stored amount
- `per_minute_rate` - RM5 stored rate
- `started_at` - when call began
- `ended_at` - when call ended
- `total_duration_seconds` - calculated duration
- `total_amount` - final charge
- `stripe_payment_intent_id` - for deposit
- `stripe_additional_charge_id` - for extra minutes
- `expires_at` - 24-hour expiry

**Table: `video_payments`**
- `id` - unique identifier
- `room_id` - links to video_rooms
- `type` - deposit or additional
- `amount` - payment amount
- `stripe_payment_id` - Stripe reference
- `status` - pending, succeeded, failed
- `created_at` - timestamp

### Step 3: Create Edge Functions

**Function: `video-room`**
- Create new room (staff only)
- Validate room code (public)
- Update room status
- Record call start/end times

**Function: `video-payment`**
- Create Stripe Payment Intent for deposit
- Process payment confirmation
- Calculate additional charges based on duration
- Create charge for extra minutes
- Generate payment receipts

**Function: `video-webhook`**
- Handle Stripe webhook events
- Update payment status on success/failure

### Step 4: Create Public Video Call Flow

New page `/video-call` with multi-step process:

**Step A: Enter Room Code**
- Patient enters room code provided by clinic
- System validates room exists and is not expired

**Step B: Payment Form**
- Display deposit amount (RM50)
- Explain per-minute charges (RM5/min after 10 mins)
- Collect patient name and email
- PDPA consent checkbox
- Stripe card payment form
- "Pay & Join Call" button

**Step C: Video Call Interface**
- WebRTC peer-to-peer encrypted video
- Live timer showing call duration
- Mute/unmute audio and video controls
- "End Call" button
- Connection status indicators

**Step D: Call Summary**
- Show call duration
- Display total charges
- Option to download/email receipt
- Thank you message

### Step 5: Create Admin Video Call Management

New admin page `/admin/video-calls`:
- Create new room button
- List of active/recent rooms with status
- Room code display with copy button
- Share via WhatsApp button
- Join call button for staff
- View payment status
- End call and trigger final billing

### Step 6: WebRTC Video Components

**Components:**
- `VideoCallRoom.tsx` - Main video call interface
- `VideoControls.tsx` - Audio/video toggle buttons
- `CallTimer.tsx` - Live duration display with cost estimate
- `PaymentForm.tsx` - Stripe Elements payment form

**Hooks:**
- `useWebRTC.ts` - WebRTC peer connection management
- `useVideoRoom.ts` - Room state and Supabase Realtime signaling
- `useCallTimer.ts` - Duration tracking and cost calculation

### Step 7: Update Routing and Navigation

- Add `/video-call` public route
- Add `/video-call/:roomCode` for direct links
- Add `/admin/video-calls` admin route
- Add menu item to admin sidebar with Video icon

---

## Technical Architecture

### Payment Flow Diagram

```text
Patient Flow:
1. Enter room code → 2. Validate room → 3. Show payment form
4. Pay RM50 deposit → 5. Join video call → 6. Call ends
7. Calculate duration → 8. Charge extra if needed → 9. Show receipt

Backend Flow:
- Stripe Payment Intent created for RM50
- Payment confirmed via webhook
- Room status updated to "paid"
- Call duration tracked in database
- Additional charge created if > 10 minutes
```

### WebRTC Signaling

Using Supabase Realtime for exchanging:
- SDP offers and answers
- ICE candidates
- Connection state updates

All media encrypted with DTLS-SRTP (WebRTC standard).

### Security Features

- End-to-end encrypted video (WebRTC)
- Secure payment processing (Stripe PCI compliant)
- Unique room codes (cryptographically random)
- 24-hour room expiry
- Payment required before call access
- PDPA-compliant consent notices

---

## File Changes Summary

**New Files:**
- `supabase/functions/video-room/index.ts` - Room management
- `supabase/functions/video-payment/index.ts` - Payment processing
- `supabase/functions/video-webhook/index.ts` - Stripe webhooks
- `src/pages/VideoCall.tsx` - Public video call page
- `src/pages/admin/VideoCallManagement.tsx` - Admin dashboard
- `src/components/video/VideoCallRoom.tsx` - Video UI
- `src/components/video/VideoControls.tsx` - Call controls
- `src/components/video/CallTimer.tsx` - Duration display
- `src/components/video/PaymentForm.tsx` - Stripe payment form
- `src/hooks/useWebRTC.ts` - WebRTC hook
- `src/hooks/useVideoRoom.ts` - Room management hook
- `src/hooks/useCallTimer.ts` - Timer hook

**Modified Files:**
- `supabase/config.toml` - Register new functions
- `src/App.tsx` - Add new routes
- `src/components/admin/AdminSidebar.tsx` - Add Video Calls menu
- `src/pages/admin/index.ts` - Export new admin page

---

## Bilingual Support

All UI text will support Malay and English:
- Payment instructions and amounts
- Consent notices
- Call status messages
- Error messages
- Receipt content

