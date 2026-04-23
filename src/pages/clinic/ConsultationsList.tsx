import { Stethoscope } from 'lucide-react';
import { ClinicPlaceholder } from './_Placeholder';

export default function ConsultationsList() {
  return (
    <ClinicPlaceholder
      title="Consultations"
      description="Active and completed consultation notes, diagnoses, and prescriptions will be managed from this screen."
      icon={Stethoscope}
    />
  );
}
