import { Fragment, useState } from 'react';
import { format } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDoctorClinicalActivity } from '@/hooks/clinic/useDoctorClinicalActivity';
import { bento, bentoHeader } from '@/lib/clinic/bentoTokens';
import {
  doctorActivityQueueLabel,
  doctorClinicalActivityCsv,
  type DoctorActivityRow,
  type DoctorActivitySummary,
} from '@/lib/clinic/doctorClinicalActivity';
import { cn } from '@/lib/utils';

interface DoctorClinicalActivityProps {
  startDate: Date;
  endDate: Date;
}

const TH = 'text-[11px] font-semibold text-slate-500 uppercase tracking-wider';
const TR = 'border-slate-100';
const documentTypeLabels = {
  mc: 'Medical Certificate',
  quarantine: 'Quarantine',
  referral: 'Referral',
} as const;

export function DoctorClinicalActivity({ startDate, endDate }: DoctorClinicalActivityProps) {
  const { data, isLoading, isError, error } = useDoctorClinicalActivity(startDate, endDate);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const rangeKey = `${format(startDate, 'yyyy-MM-dd')}:${format(endDate, 'yyyy-MM-dd')}`;

  const exportCsv = (summaries: DoctorActivitySummary[], doctor?: DoctorActivitySummary) => {
    const csv = doctorClinicalActivityCsv(summaries, doctor?.doctorId);
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const period = `${format(startDate, 'yyyy-MM-dd')}-to-${format(endDate, 'yyyy-MM-dd')}`;
    const safeDoctorName = doctor?.doctorName
      .trim()
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'doctor';

    anchor.href = url;
    anchor.download = doctor
      ? `doctor-clinical-activity-${safeDoctorName}-${period}.csv`
      : `doctor-clinical-activity-${period}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <Card className={bento} role="status" aria-label="Loading doctor clinical activity">
        <CardContent className="p-6 space-y-3">
          <Skeleton className="h-4 w-52" />
          <Skeleton className="h-[180px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className={bento} role="alert">
        <CardContent className="py-6 text-sm text-rose-600">
          Failed to load doctor clinical activity: {error?.message ?? 'Unknown error'}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={bento}>
      <CardContent className="p-6">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className={cn(bentoHeader, 'mb-1')}>Doctor Clinical Activity</h3>
            <p className="text-xs text-slate-500">
              Procedures and selected documents credited to the treating doctor.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={isLoading || !data?.length}
            onClick={() => exportCsv(data ?? [])}
          >
            Export all
          </Button>
        </div>
        {!data?.length ? (
          <div className="flex h-[180px] items-center justify-center text-sm text-slate-400">
            No doctor clinical activity in this period.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className={cn(TR, 'hover:bg-transparent')}>
                <TableHead className={TH}>Doctor</TableHead>
                <TableHead className={cn(TH, 'text-right')}>Procedures</TableHead>
                <TableHead className={cn(TH, 'text-right')}>MC</TableHead>
                <TableHead className={cn(TH, 'text-right')}>Quarantine</TableHead>
                <TableHead className={cn(TH, 'text-right')}>Referral</TableHead>
                <TableHead className={cn(TH, 'text-right')}>Total Documents</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((summary) => {
                const doctorKey = summary.doctorId ?? '__unassigned__';
                const doctorExpansionKey = `${rangeKey}:${doctorKey}`;
                const isExpanded = expandedKey === doctorExpansionKey;

                return (
                  <Fragment key={doctorKey}>
                    <TableRow className={TR}>
                      <TableCell className="font-medium text-slate-800">
                        <Button
                          variant="ghost"
                          className="h-auto w-full justify-start p-0 font-medium text-slate-800 hover:bg-transparent hover:text-slate-950"
                          aria-expanded={isExpanded}
                          onClick={() => setExpandedKey(isExpanded ? null : doctorExpansionKey)}
                        >
                          {summary.doctorName}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="mt-1 h-auto px-0 text-xs text-slate-500 hover:bg-transparent hover:text-slate-800"
                          disabled={isLoading || summary.rows.length === 0}
                          onClick={() => exportCsv(data, summary)}
                        >
                          Export {summary.doctorName}
                        </Button>
                      </TableCell>
                      <TableCell className="text-right text-slate-600">{summary.procedures}</TableCell>
                      <TableCell className="text-right text-slate-600">{summary.mc}</TableCell>
                      <TableCell className="text-right text-slate-600">{summary.quarantine}</TableCell>
                      <TableCell className="text-right text-slate-600">{summary.referral}</TableCell>
                      <TableCell className="text-right font-semibold text-slate-900">
                        {summary.totalDocuments}
                      </TableCell>
                    </TableRow>
                    {isExpanded ? (
                      <TableRow className={TR}>
                        <TableCell colSpan={6} className="bg-slate-50 p-4">
                          <ActivityDetails key={doctorExpansionKey} summary={summary} />
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityDetails({ summary }: { summary: DoctorActivitySummary }) {
  const procedures = summary.rows.filter((row) => row.activityKind === 'procedure');
  const documents = summary.rows.filter((row) => row.activityKind !== 'procedure');
  const [activeTab, setActiveTab] = useState(
    procedures.length === 0 && documents.length > 0 ? 'documents' : 'procedures',
  );

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList className="h-9">
        <TabsTrigger value="procedures" onClick={() => setActiveTab('procedures')}>
          Procedures
        </TabsTrigger>
        <TabsTrigger value="documents" onClick={() => setActiveTab('documents')}>
          Documents
        </TabsTrigger>
      </TabsList>
      <TabsContent value="procedures">
        <ActivityRows rows={procedures} emptyLabel="No procedures recorded." kind="procedures" />
      </TabsContent>
      <TabsContent value="documents">
        <ActivityRows rows={documents} emptyLabel="No documents recorded." kind="documents" />
      </TabsContent>
    </Tabs>
  );
}

function ActivityRows({
  rows,
  emptyLabel,
  kind,
}: {
  rows: DoctorActivityRow[];
  emptyLabel: string;
  kind: 'procedures' | 'documents';
}) {
  if (rows.length === 0) {
    return <p className="py-4 text-sm text-slate-400">{emptyLabel}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className={cn(TR, 'hover:bg-transparent')}>
          <TableHead className={TH}>Date</TableHead>
          {kind === 'documents' ? <TableHead className={TH}>Type</TableHead> : null}
          <TableHead className={TH}>
            {kind === 'documents' ? 'Document Name' : 'Procedure'}
          </TableHead>
          <TableHead className={TH}>Patient</TableHead>
          <TableHead className={cn(TH, 'text-right')}>Queue</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const queueNo = doctorActivityQueueLabel(row);
          return (
            <TableRow key={row.activityId} className={TR}>
              <TableCell className="whitespace-nowrap text-slate-600">{row.activityDate}</TableCell>
              {kind === 'documents' && row.activityKind !== 'procedure' ? (
                <TableCell className="text-slate-600">
                  {documentTypeLabels[row.activityKind]}
                </TableCell>
              ) : null}
              <TableCell className="text-slate-700">{row.activityName}</TableCell>
              <TableCell className="text-slate-600">{row.patientName}</TableCell>
              <TableCell className="text-right">
                <a className="text-blue-600 hover:underline" href={`/clinic/visit/${row.queueEntryId}`}>
                  {queueNo}
                </a>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
