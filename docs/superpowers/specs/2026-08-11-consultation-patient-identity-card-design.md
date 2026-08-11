# Consultation Patient Identity Card Design

## Goal

Make the patient identity card in the consultation workspace show the patient's complete name and address without clipping, truncation, or horizontal overflow.

## Scope

- Update the demographics card in `ConsultationDetail`.
- Replace the truncated single-line patient name with a naturally wrapping full name.
- Preserve the queue-number badge at the upper right without allowing it to overlap the name.
- Add an Address field below IC and Gender that spans the full card width.
- Render the stored `patients.address` value, preserving intentional line breaks while wrapping long words safely.
- Render an em dash when the address is empty or unavailable.
- Keep the existing date of birth, age, IC, gender, payment type, colors, and overall card styling.

## Data Flow

`useConsultationQueueEntries` already selects the full related patient record through `patients (*)`. The card will read `patient.address` from that existing result. No database schema, migration, permission, or additional network request is required.

## Responsive Behaviour

The identity header will remain a two-part flex layout. The patient information section may shrink and wrap, while the queue badge remains fixed-size. The name and address will use safe word-breaking rules so long content stays within the card at desktop and mobile widths.

## Empty and Error States

- Missing name retains the page's existing fallback behaviour.
- Missing or blank address displays `—`.
- Address text is displayed as plain text; stored content is not interpreted as HTML.

## Testing

- Add a focused component-level regression test proving a long patient name is not assigned truncation styling.
- Prove the full address is rendered and receives wrapping/whitespace styling.
- Prove a missing address renders the fallback.
- Run the focused test, relevant consultation tests, TypeScript checking, production build, and diff validation before deployment.

