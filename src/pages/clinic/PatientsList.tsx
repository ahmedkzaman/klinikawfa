import { Users } from 'lucide-react';
import { ClinicPlaceholder } from './_Placeholder';

export default function PatientsList() {
  return (
    <ClinicPlaceholder
      title="Patients"
      description="Searchable patient registry with demographics, allergies, and visit history will live here."
      icon={Users}
    />
  );
}
