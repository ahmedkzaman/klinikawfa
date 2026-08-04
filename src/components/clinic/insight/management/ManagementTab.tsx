import { FinancialControlTab } from './FinancialControlTab';

interface ManagementTabProps {
  startDate: Date;
  endDate: Date;
}

export function ManagementTab({ startDate, endDate }: ManagementTabProps) {
  return <FinancialControlTab startDate={startDate} endDate={endDate} />;
}
