import { format } from 'date-fns';

/**
 * Normalises a Malaysian phone number for use with the wa.me link scheme.
 * - Strips all non-digit characters (spaces, dashes, plus, parens).
 * - Leading "0" is replaced with "60" (Malaysian country code).
 * - Numbers already prefixed with "6" are left as-is.
 */
export function formatWhatsAppNumber(phone: string): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) return `60${digits.slice(1)}`;
  if (digits.startsWith('6')) return digits;
  return digits;
}

/**
 * Builds a pre-filled wa.me link with a polite appointment reminder.
 *
 * @param patientName  Display name to greet the patient with.
 * @param phone        Raw phone string from the DB.
 * @param appointmentDate  A Date representing the full appointment moment
 *                         (date + time already combined by the caller).
 */
export function generateAppointmentReminderLink(
  patientName: string,
  phone: string,
  appointmentDate: Date,
): string {
  const formattedPhone = formatWhatsAppNumber(phone);
  const when = format(appointmentDate, "d MMM yyyy 'at' h:mm a");
  const message =
    `Hello ${patientName}, this is a gentle reminder from Klinik Awfa for your upcoming ` +
    `appointment on ${when}. Please reply to confirm or let us know if you need to ` +
    `reschedule. Thank you!`;
  return `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
}
