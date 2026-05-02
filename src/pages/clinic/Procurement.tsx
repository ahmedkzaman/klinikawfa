import { Package } from 'lucide-react';
import { ClinicPlaceholder } from './_Placeholder';

/**
 * Sprint 1 placeholder. The medicines-dispensing workflow now lives at
 * /clinic/dispensary; this route is reserved for the upcoming supply-chain
 * (purchase orders, supplier ledger, restocking) module.
 */
export default function Procurement() {
  return (
    <ClinicPlaceholder
      title="Procurement Engine"
      description="Supply chain module coming in Sprint 2."
      icon={Package}
    />
  );
}
