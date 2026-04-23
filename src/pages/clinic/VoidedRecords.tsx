import { Archive } from 'lucide-react';
import { ClinicPlaceholder } from './_Placeholder';

export default function VoidedRecords() {
  return (
    <ClinicPlaceholder
      title="Voided Records"
      description="Audit log of soft-deleted consultations, items, payments, and queue entries — visible to special admins only."
      icon={Archive}
    />
  );
}
