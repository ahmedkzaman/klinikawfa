import { describe, expect, it } from 'vitest';

import { displayClinicalNote } from '@/lib/clinic/legacyClinicalNote';

describe('legacy clinical-note display', () => {
  it('shows the Yezza Case Note without its internal source audit marker', () => {
    expect(
      displayClinicalNote(
        'alleged HORNET STING\nOVER LT ARM &amp; LT KNEE\n\nsource_system=yezza; source_visit_id=9744957',
      ),
    ).toBe('alleged HORNET STING\nOVER LT ARM & LT KNEE');
  });

  it('leaves ordinary consultation notes unchanged', () => {
    expect(displayClinicalNote('Fever for two days')).toBe('Fever for two days');
  });
});
