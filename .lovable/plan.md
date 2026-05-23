## WhatsApp Appointment Reminders

### Overview
Add a one-click WhatsApp reminder feature for clinic appointments. Staff click a button in the appointment detail sheet, which opens WhatsApp Web in a new tab with a pre-filled reminder message.

### Files to Create

1. **`src/lib/clinic/whatsappUtils.ts`**
   - `formatWhatsAppNumber(phone: string): string` — strip non-numeric chars, replace leading `0` with `60`, leave `6`-prefixed numbers untouched.
   - `generateAppointmentReminderLink(patientName: string, phone: string, appointmentDate: Date, appointmentTime: string): string` — format datetime as `"d MMM yyyy 'at' h:mm a"`, build reminder message, encodeURIComponent, return `https://wa.me/${phone}?text=${msg}`.

### Files to Edit

2. **`src/pages/clinic/Appointments.tsx`**
   - Import `MessageCircle` from `lucide-react` and the two utility functions.
   - In `AppointmentDetailsSheet`, add a "Send Reminder" button below the patient phone display (within the existing patient info card or just above the action buttons).
   - Button disabled if `!appt.patients?.phone`.
   - On click: `window.open(generateAppointmentReminderLink(...), '_blank')`.
   - Use the existing green/emerald style tokens for the button to match the "arrived" action pattern (e.g., `bg-emerald-600 text-white`).

### Notes
- No backend changes — pure frontend wa.me URL generation.
- `date-fns` is already used in the file for formatting.
- Patient phone is already fetched via `patients:patient_id(id, name, phone)` in the range query.
- Appointment time string is `HH:MM` format; combine with `appointment_date` into a Date before formatting.
