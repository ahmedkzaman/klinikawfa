import { Pill } from 'lucide-react';
import { ClinicPlaceholder } from './_Placeholder';

export default function Dispensary() {
  return (
    <ClinicPlaceholder
      title="Dispensary"
      description="Medication dispensing workflow with stock decrement and labeling will be wired here."
      icon={Pill}
    />
  );
}
