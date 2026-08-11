# Doctor Card Portrait Sizing Design

## Goal

Make doctor portraits visually fill the existing photo area without changing the doctor-card structure or cropping the subject excessively.

## Design

- Keep the existing circular portrait, centered in the current `16:10` media frame.
- Increase the portrait diameter from 112/144px to approximately 170px on small screens and 220px on medium screens and above.
- Retain `object-cover`, the circular mask, shadow, and four-pixel accent ring.
- Keep the experience badge in its existing bottom-right position.
- Apply the same responsive dimensions to the fallback avatar so cards remain consistent when a doctor has no photo.
- Do not alter staff-member thumbnails elsewhere on the page.

## Responsive and Safety Requirements

- The portrait must remain inside the media frame at supported viewport sizes.
- Doctor cards must retain equal media-frame heights.
- Existing portrait URLs, accessible alt text, and content below the frame remain unchanged.
- Add a focused regression test that verifies the enlarged responsive portrait and fallback sizes.

## Acceptance Criteria

1. Doctor portraits are substantially larger and use the available frame height.
2. Portraits remain circular, centered, and visually consistent.
3. The experience badge does not overlap the doctor’s face.
4. The production build and focused Doctors-page regression tests pass.
