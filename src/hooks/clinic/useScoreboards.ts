import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import {
  isProcedureScoreboardRow,
  normalizeProcedureName,
  resolveCurrentProcedureCogs,
} from '@/lib/clinic/procedureRoi';
import {
  rankMedicationsByDispensedVisits,
  type MedicationDispenseRow,
} from '@/lib/clinic/medicationVisitRanking';

// View not yet in generated types — same loose-cast pattern as useFinancialInsights.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface ViewRow {
  id: string;
  item_name: string;
  visit_date: string;
  payment_method: string | null;
  revenue: number | string | null;
  profit: number | string | null;
  queue_entry_id: string;
  doctor_id: string | null;
  doctor_name: string;
  diagnosis_id: string | null;
  diagnosis_name: string;
  patient_id: string;
  kind: 'service' | 'medication' | 'package' | 'other';
}

export interface DoctorScore {
  doctorId: string | null;
  doctorName: string;
  uniquePatients: number;
  totalRevenue: number;
  totalCogs: number;
  totalProfit: number;
  revenuePerPatient: number;
  marginPct: number;
}

export interface DiagnosisRank {
  diagnosisId: string | null;
  diagnosisName: string;
  encounters: number;
  totalRevenue: number;
}

export interface MedicationRank {
  itemName: string;
  dispensedVisitCount: number;
}

export interface ProcedureROI {
  itemName: string;
  count: number;
  totalRevenue: number;
  totalCogs: number;
  marginPct: number;
}

export interface ScoreboardsData {
  doctors: DoctorScore[];
  topDiagnoses: DiagnosisRank[];
  topMedications: MedicationRank[];
  procedureRoi: ProcedureROI[];
}

export function useScoreboards(startDate: Date, endDate: Date) {
  const startKey = format(startDate, 'yyyy-MM-dd');
  const endKey = format(endDate, 'yyyy-MM-dd');

  return useQuery<ScoreboardsData>({
    queryKey: ['scoreboards', startKey, endKey],
    queryFn: async () => {
      const [financialQuery, servicesQuery] = await Promise.all([
        db
          .from('insight_financials_view')
          .select(
            'id, item_name, visit_date, payment_method, revenue, profit, queue_entry_id, ' +
              'doctor_id, doctor_name, diagnosis_id, diagnosis_name, patient_id, kind',
          )
          .gte('visit_date', startKey)
          .lte('visit_date', endKey),
        db.from('services').select('id, name, category, cost'),
      ]);

      if (financialQuery.error) throw financialQuery.error;
      if (servicesQuery.error) throw servicesQuery.error;

      const rows: ViewRow[] = (financialQuery.data ?? []) as ViewRow[];
      type ServiceCostRow = {
        id: string;
        name: string | null;
        category: string | null;
        cost: number | string | null;
      };
      const serviceRows = (servicesQuery.data ?? []) as ServiceCostRow[];
      const serviceCategories = new Map<string, string>(
        serviceRows
          .filter((service) => service.name && service.category)
          .map((service) => [normalizeProcedureName(service.name!), service.category!] as const),
      );
      const serviceCostsById = new Map(
        serviceRows.map((service) => [service.id, service.cost] as const),
      );
      const serviceCostsByName = new Map(
        serviceRows
          .filter((service) => service.name)
          .map((service) => [normalizeProcedureName(service.name!), service.cost] as const),
      );

      const medicationRows = rows.filter((row) => row.kind === 'medication');
      const detailItemIds = [
        ...new Set(
          rows
            .filter(
              (row) =>
                row.kind === 'medication' ||
                isProcedureScoreboardRow(row, serviceCategories),
            )
            .map((row) => row.id),
        ),
      ];
      const consultationItemDetails = new Map<
        string,
        {
          item_id: string | null;
          service_id: string | null;
          quantity: number | string | null;
          dispensed_qty: number | string | null;
          unit_cost: number | string | null;
        }
      >();

      for (let offset = 0; offset < detailItemIds.length; offset += 200) {
        const itemIds = detailItemIds.slice(offset, offset + 200);
        const detailsQuery = await db
          .from('consultation_items')
          .select('id, item_id, service_id, quantity, dispensed_qty, unit_cost')
          .in('id', itemIds)
          .is('deleted_at', null);

        if (detailsQuery.error) throw detailsQuery.error;

        for (const detail of detailsQuery.data ?? []) {
          consultationItemDetails.set(detail.id, detail);
        }
      }

      // ---- Aggregations ----------------------------------------------------
      type DoctorAcc = {
        doctorName: string;
        revenue: number;
        cogs: number;
        profit: number;
        patients: Set<string>;
      };
      const doctorMap = new Map<string, DoctorAcc>();

      type DiagnosisAcc = {
        diagnosisName: string;
        revenue: number;
        encounters: Set<string>;
      };
      const diagnosisMap = new Map<string, DiagnosisAcc>();

      type ProcedureAcc = {
        revenue: number;
        cogs: number;
        encounters: Set<string>;
      };
      const procedureMap = new Map<string, ProcedureAcc>();

      for (const r of rows) {
        const rev = Number(r.revenue ?? 0);
        const prof = Number(r.profit ?? 0);
        const cogs = rev - prof;

        // Doctor scoreboard
        const docKey = r.doctor_id ?? '__unassigned__';
        const docAcc =
          doctorMap.get(docKey) ??
          ({
            doctorName: r.doctor_name ?? 'Unassigned',
            revenue: 0,
            cogs: 0,
            profit: 0,
            patients: new Set<string>(),
          } as DoctorAcc);
        docAcc.revenue += rev;
        docAcc.cogs += cogs;
        docAcc.profit += prof;
        if (r.patient_id) docAcc.patients.add(r.patient_id);
        doctorMap.set(docKey, docAcc);

        // Diagnosis ranking
        const dxKey = r.diagnosis_id ?? `__txt__${r.diagnosis_name}`;
        const dxAcc =
          diagnosisMap.get(dxKey) ??
          ({
            diagnosisName: r.diagnosis_name ?? 'Undiagnosed',
            revenue: 0,
            encounters: new Set<string>(),
          } as DiagnosisAcc);
        dxAcc.revenue += rev;
        dxAcc.encounters.add(r.queue_entry_id);
        diagnosisMap.set(dxKey, dxAcc);

        // Procedure ROI (services only)
        if (isProcedureScoreboardRow(r, serviceCategories)) {
          const detail = consultationItemDetails.get(r.id);
          const currentServiceCost = detail?.service_id
            ? serviceCostsById.get(detail.service_id)
            : serviceCostsByName.get(normalizeProcedureName(r.item_name));
          const procedureCogs = detail
            ? resolveCurrentProcedureCogs({
                quantity: detail.quantity,
                recordedUnitCost: detail.unit_cost,
                currentServiceCost: currentServiceCost ?? null,
              })
            : cogs;
          const procAcc =
            procedureMap.get(r.item_name) ??
            ({ revenue: 0, cogs: 0, encounters: new Set<string>() } as ProcedureAcc);
          procAcc.revenue += rev;
          procAcc.cogs += procedureCogs;
          procAcc.encounters.add(r.queue_entry_id);
          procedureMap.set(r.item_name, procAcc);
        }
      }

      const doctors: DoctorScore[] = Array.from(doctorMap.entries())
        .map(([key, v]) => {
          const uniquePatients = v.patients.size;
          return {
            doctorId: key === '__unassigned__' ? null : key,
            doctorName: v.doctorName,
            uniquePatients,
            totalRevenue: v.revenue,
            totalCogs: v.cogs,
            totalProfit: v.profit,
            revenuePerPatient: uniquePatients > 0 ? v.revenue / uniquePatients : 0,
            marginPct: v.revenue > 0 ? (v.profit / v.revenue) * 100 : 0,
          };
        })
        .sort((a, b) => b.revenuePerPatient - a.revenuePerPatient);

      const topDiagnoses: DiagnosisRank[] = Array.from(diagnosisMap.entries())
        .map(([key, v]) => ({
          diagnosisId: key.startsWith('__txt__') ? null : key,
          diagnosisName: v.diagnosisName,
          encounters: v.encounters.size,
          totalRevenue: v.revenue,
        }))
        .sort((a, b) => b.encounters - a.encounters)
        .slice(0, 10);

      const topMedications: MedicationRank[] = rankMedicationsByDispensedVisits(
        medicationRows.flatMap((row): MedicationDispenseRow[] => {
          const detail = consultationItemDetails.get(row.id);
          if (!detail) return [];

          return [
            {
              itemId: detail.item_id,
              itemName: row.item_name,
              queueEntryId: row.queue_entry_id,
              quantity: detail.quantity,
              dispensedQuantity: detail.dispensed_qty,
            },
          ];
        }),
      );

      const procedureRoi: ProcedureROI[] = Array.from(procedureMap.entries())
        .map(([itemName, v]) => ({
          itemName,
          count: v.encounters.size,
          totalRevenue: v.revenue,
          totalCogs: v.cogs,
          marginPct: v.revenue > 0 ? ((v.revenue - v.cogs) / v.revenue) * 100 : 0,
        }))
        .sort((a, b) => b.marginPct - a.marginPct);

      return { doctors, topDiagnoses, topMedications, procedureRoi };
    },
  });
}
