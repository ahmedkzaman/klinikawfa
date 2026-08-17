export type InsightAccess = {
  canOpenInsight: boolean;
  canSeeNamedDoctors: boolean;
  canSeeClinicDoctorBenchmarks: boolean;
  canSeeServicePerformance: boolean;
  ownDoctorId: string | null;
};

type InsightRole = string | null;

const noInsightAccess: InsightAccess = {
  canOpenInsight: false,
  canSeeNamedDoctors: false,
  canSeeClinicDoctorBenchmarks: false,
  canSeeServicePerformance: false,
  ownDoctorId: null,
};

export function getInsightAccess(role: InsightRole, doctorId: string | null): InsightAccess {
  switch (role) {
    case 'special_admin':
    case 'doctor_admin':
      return {
        canOpenInsight: true,
        canSeeNamedDoctors: true,
        canSeeClinicDoctorBenchmarks: true,
        canSeeServicePerformance: true,
        ownDoctorId: null,
      };
    case 'admin':
      return {
        canOpenInsight: true,
        canSeeNamedDoctors: false,
        canSeeClinicDoctorBenchmarks: true,
        canSeeServicePerformance: true,
        ownDoctorId: null,
      };
    case 'resident_doctor':
      return {
        canOpenInsight: true,
        canSeeNamedDoctors: false,
        canSeeClinicDoctorBenchmarks: true,
        canSeeServicePerformance: false,
        ownDoctorId: doctorId,
      };
    case 'ops_staff':
    case 'operations':
      return {
        canOpenInsight: true,
        canSeeNamedDoctors: false,
        canSeeClinicDoctorBenchmarks: true,
        canSeeServicePerformance: true,
        ownDoctorId: null,
      };
    case 'locum':
    case 'guest':
    case null:
    default:
      return noInsightAccess;
  }
}

export function doctorConcentrationLabel(
  doctorName: string,
  sharePct: number,
  canSeeNamedDoctors: boolean,
): string {
  const share = `${sharePct.toFixed(0)}% of revenue`;
  return canSeeNamedDoctors ? `${doctorName}: ${share}` : `Largest doctor share: ${share}`;
}

export function doctorAttributionField(canSeeNamedDoctors: boolean): 'doctor_name' | 'doctor_id' {
  return canSeeNamedDoctors ? 'doctor_name' : 'doctor_id';
}
