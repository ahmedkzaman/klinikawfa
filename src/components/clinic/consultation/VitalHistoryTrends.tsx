import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Trash2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { usePatientVitalHistory } from '@/hooks/clinic/useVitalSigns';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';

const METRICS = [
  { key: 'height_cm', label: 'Height', color: 'hsl(var(--primary))', unit: 'cm' },
  { key: 'weight_kg', label: 'Weight', color: 'hsl(210, 70%, 50%)', unit: 'kg' },
  { key: 'temperature_c', label: 'Temperature', color: 'hsl(0, 70%, 50%)', unit: '°C' },
  { key: 'bp_systolic', label: 'BP-SYS', color: 'hsl(280, 60%, 50%)', unit: 'mmHg' },
  { key: 'bp_diastolic', label: 'BP-DIA', color: 'hsl(320, 60%, 50%)', unit: 'mmHg' },
  { key: 'heart_rate', label: 'Pulse', color: 'hsl(30, 80%, 50%)', unit: 'bpm' },
  { key: 'spo2', label: 'SpO2', color: 'hsl(170, 60%, 40%)', unit: '%' },
  { key: 'blood_glucose', label: 'Blood glucose', color: 'hsl(50, 70%, 45%)', unit: 'mmol/L' },
  { key: 'respiratory_rate', label: 'Resp rate', color: 'hsl(140, 50%, 40%)', unit: '/min' },
] as const;

type MetricKey = (typeof METRICS)[number]['key'];

export function VitalHistoryTrends({
  patientId,
  currentQueueId,
}: {
  patientId: string;
  currentQueueId?: string;
}) {
  const { data: history = [] } = usePatientVitalHistory(patientId);
  const qc = useQueryClient();
  const [selectedMetrics, setSelectedMetrics] = useState<Set<MetricKey>>(
    new Set(['weight_kg', 'temperature_c', 'bp_systolic', 'bp_diastolic', 'heart_rate']),
  );

  const toggleMetric = (key: MetricKey) => {
    setSelectedMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('vital_signs').delete().eq('id', id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Vital record deleted');
    qc.invalidateQueries({ queryKey: ['vital_history', patientId] });
    qc.invalidateQueries({ queryKey: ['vital_signs'] });
  };

  const chartData = useMemo(() => {
    return [...history].reverse().map((r) => ({
      date: format(new Date(r.created_at), 'MMM d, HH:mm'),
      height_cm: r.height_cm,
      weight_kg: r.weight_kg,
      temperature_c: r.temperature_c,
      bp_systolic: r.bp_systolic,
      bp_diastolic: r.bp_diastolic,
      heart_rate: r.heart_rate,
      spo2: r.spo2,
      blood_glucose: r.blood_glucose,
      respiratory_rate: r.respiratory_rate,
    }));
  }, [history]);

  if (history.length === 0) return null;

  return (
    <div className="space-y-4 mt-4">
      <div>
        <h4 className="text-sm font-medium mb-2">Vital records</h4>
        <div className="border rounded-md overflow-auto max-h-[300px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">DATE</TableHead>
                <TableHead className="text-xs">TIME</TableHead>
                <TableHead className="text-xs">HEIGHT</TableHead>
                <TableHead className="text-xs">WEIGHT</TableHead>
                <TableHead className="text-xs">TEMP</TableHead>
                <TableHead className="text-xs">BP</TableHead>
                <TableHead className="text-xs">PULSE</TableHead>
                <TableHead className="text-xs">SPO2</TableHead>
                <TableHead className="text-xs">BGL</TableHead>
                <TableHead className="text-xs">RESP RATE</TableHead>
                <TableHead className="text-xs w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((r) => {
                const isThisVisit =
                  !!currentQueueId && r.queue_entry_id === currentQueueId;
                return (
                <TableRow key={r.id} className={cn(isThisVisit && 'bg-primary/5')}>
                  <TableCell className="text-xs py-2">
                    {format(new Date(r.created_at), 'dd/MM/yyyy')}
                  </TableCell>
                  <TableCell className="text-xs py-2">
                    <div className="flex items-center gap-1.5">
                      <span>{format(new Date(r.created_at), 'HH:mm')}</span>
                      {isThisVisit && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary">
                          This visit
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs py-2">{r.height_cm ?? '—'}</TableCell>
                  <TableCell className="text-xs py-2">{r.weight_kg ?? '—'}</TableCell>
                  <TableCell className="text-xs py-2">{r.temperature_c ?? '—'}</TableCell>
                  <TableCell className="text-xs py-2">
                    {r.bp_systolic && r.bp_diastolic
                      ? `${r.bp_systolic}/${r.bp_diastolic}`
                      : '—'}
                  </TableCell>
                  <TableCell className="text-xs py-2">{r.heart_rate ?? '—'}</TableCell>
                  <TableCell className="text-xs py-2">{r.spo2 ?? '—'}</TableCell>
                  <TableCell className="text-xs py-2">{r.blood_glucose ?? '—'}</TableCell>
                  <TableCell className="text-xs py-2">{r.respiratory_rate ?? '—'}</TableCell>
                  <TableCell className="py-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleDelete(r.id)}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div>
        <h4 className="text-sm font-medium mb-2">Vital trends</h4>
        <div className="flex flex-wrap gap-2 mb-3">
          {METRICS.map((m) => (
            <label
              key={m.key}
              className="flex items-center gap-1.5 text-xs cursor-pointer select-none rounded-full border px-2.5 py-1 transition-colors"
              style={{
                borderColor: selectedMetrics.has(m.key) ? m.color : undefined,
                backgroundColor: selectedMetrics.has(m.key)
                  ? m.color.replace(')', ' / 0.1)')
                  : undefined,
              }}
            >
              <Checkbox
                checked={selectedMetrics.has(m.key)}
                onCheckedChange={() => toggleMetric(m.key)}
                className="h-3 w-3"
              />
              {m.label}
            </label>
          ))}
        </div>
        {chartData.length >= 1 ? (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} className="text-muted-foreground" />
              <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {METRICS.filter((m) => selectedMetrics.has(m.key)).map((m) => (
                <Line
                  key={m.key}
                  type="monotone"
                  dataKey={m.key}
                  name={m.label}
                  stroke={m.color}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-xs text-muted-foreground">No vital records to show trends.</p>
        )}
      </div>
    </div>
  );
}
