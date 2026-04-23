import { ListOrdered } from 'lucide-react';
import { ClinicPlaceholder } from './_Placeholder';

export default function QueueBoard() {
  return (
    <ClinicPlaceholder
      title="Queue Board"
      description="Live patient queue with consultation rooms, urgency flags, and doctor assignments will appear here."
      icon={ListOrdered}
    />
  );
}
