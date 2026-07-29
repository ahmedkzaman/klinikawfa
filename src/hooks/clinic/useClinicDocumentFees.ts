import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type DocumentFeeType = 'mc' | 'prescription' | 'referral';

export interface ClinicDocumentFee {
  documentType: DocumentFeeType;
  amount: number;
}

type DocumentFeeRow = {
  document_type: DocumentFeeType;
  amount: number | string;
};

type DocumentFeeDatabase = {
  from: (table: 'clinic_document_fees') => {
    select: (columns: string) => Promise<{ data: DocumentFeeRow[] | null; error: Error | null }>;
  };
  rpc: (
    functionName: 'set_clinic_document_fee',
    arguments_: { _document_type: DocumentFeeType; _amount: number },
  ) => Promise<{ data: DocumentFeeRow | null; error: Error | null }>;
};

const documentFeeDatabase = supabase as unknown as DocumentFeeDatabase;

function normalizeFee(row: DocumentFeeRow): ClinicDocumentFee {
  const amount = Number(row.amount);
  if (!Number.isFinite(amount)) {
    throw new Error(`Invalid fee returned for ${row.document_type}`);
  }

  return { documentType: row.document_type, amount };
}

export function useClinicDocumentFees() {
  return useQuery({
    queryKey: ['clinic-document-fees'],
    queryFn: async (): Promise<ClinicDocumentFee[]> => {
      const { data, error } = await documentFeeDatabase
        .from('clinic_document_fees')
        .select('document_type, amount');
      if (error) throw error;

      return (data ?? []).map(normalizeFee);
    },
  });
}

export function useSetClinicDocumentFee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ documentType, amount }: { documentType: DocumentFeeType; amount: number }) => {
      const { data, error } = await documentFeeDatabase.rpc('set_clinic_document_fee', {
        _document_type: documentType,
        _amount: amount,
      });
      if (error) throw error;
      if (!data) throw new Error('The document fee was not saved.');

      return normalizeFee(data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clinic-document-fees'] }),
  });
}
