export interface ConsultationFeeInput {
  panelId: string | null;
  panelFee: number | null;
  cashFee: number;
}

export interface ConsultationFeeResolution {
  amount: number;
  source: 'panel' | 'cash-fallback' | 'cash';
}

export function resolveConsultationFee(input: ConsultationFeeInput): ConsultationFeeResolution {
  if (!input.panelId) return { amount: input.cashFee, source: 'cash' };
  if (input.panelFee !== null) return { amount: input.panelFee, source: 'panel' };
  return { amount: input.cashFee, source: 'cash-fallback' };
}
