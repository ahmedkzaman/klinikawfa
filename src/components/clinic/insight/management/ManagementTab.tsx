import { FinancialControlTab } from './FinancialControlTab';

interface ManagementTabProps {
  startDate: Date;
  endDate: Date;
  enabled?: boolean;
}

export function ManagementTab({ startDate, endDate, enabled = true }: ManagementTabProps) {
  return <FinancialControlTab startDate={startDate} endDate={endDate} enabled={enabled} />;
}
