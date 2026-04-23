import { Package } from 'lucide-react';
import { ClinicPlaceholder } from './_Placeholder';

export default function Inventory() {
  return (
    <ClinicPlaceholder
      title="Inventory"
      description="Stock / Allocated / Available columns, expiry tracking, and reorder alerts will live in this module."
      icon={Package}
    />
  );
}
