import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  role: 'ops_staff' as string | null,
  navigate: vi.fn(),
  invalidateQueries: vi.fn(),
  checkout: vi.fn(),
  addConsultationItem: vi.fn(),
  legacySetCheckoutPortions: vi.fn(),
  includeOtherCharge: false,
  items: [{ id: 'item-1', item_id: null, item_name: 'Medication', quantity: 1, price: 100 }],
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ queueEntryId: 'queue-1' }),
    useNavigate: () => state.navigate,
  };
});

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: state.invalidateQueries }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ role: state.role, isLocum: state.role === 'locum' }),
}));

vi.mock('@/hooks/clinic/useQueueEntries', () => ({
  useConsultationQueueEntries: () => ({
    data: [{
      id: 'queue-1',
      patient_id: 'patient-1',
      panel_id: 'panel-1',
      clinic_status: 'dispensing_payment',
      created_at: '2026-08-04T08:00:00.000Z',
      queue_sequence: 1,
      patients: { id: 'patient-1', name: 'Amina', date_of_birth: '1990-01-01' },
      doctors: { name: 'Dr Noor' },
    }],
    isLoading: false,
  }),
  useUpdateQueueEntry: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/clinic/useConsultations', () => ({
  useConsultation: () => ({
    data: {
      id: 'consultation-1',
      patient_id: 'patient-1',
      doctor_id: 'doctor-1',
      diagnosis_text: 'Review',
      status: 'in_progress',
    },
    isFetched: true,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/hooks/clinic/useConsultationItems', () => ({
  useConsultationItems: () => ({
    data: state.items,
    refetch: vi.fn(),
  }),
  useAddConsultationItem: () => ({
    mutateAsync: state.addConsultationItem,
    isPending: false,
  }),
}));

vi.mock('@/hooks/clinic/useClinicPreferences', () => ({
  useClinicPreferences: () => ({
    isLoading: false,
    getPreference: (key: string, fallback = '') => {
      if (key === 'default_consultation_fee_name') return 'Consultation Fee';
      if (key === 'default_consultation_fee_price') return '45';
      return fallback;
    },
  }),
}));

vi.mock('@/hooks/clinic/useVisitConsultationFee', () => ({
  useVisitConsultationFee: () => ({
    data: { amount: 18, source: 'panel' },
    isLoading: false,
  }),
}));

vi.mock('@/hooks/clinic/useConsultationLock', () => ({
  useConsultationLock: () => ({ isLockedByOther: false, canEdit: true, forceUnlock: vi.fn() }),
}));

vi.mock('@/hooks/clinic/useClinicSettings', () => ({
  useClinicSettings: () => ({ settings: {} }),
}));

vi.mock('@/hooks/clinic/useDrugLabelSettings', () => ({
  useDrugLabelSettings: () => ({ data: undefined }),
}));

vi.mock('@/hooks/clinic/usePayments', () => ({
  usePayments: () => ({ data: [] }),
}));

vi.mock('@/hooks/clinic/useInsuranceProviders', () => ({
  useInsuranceProviders: () => ({ data: [{ id: 'panel-1', name: 'Care Panel' }] }),
}));

vi.mock('@/hooks/clinic/useClinicDocuments', () => ({
  useConsultationDocuments: () => ({ data: [] }),
  useDeleteConsultationDocument: () => ({ mutateAsync: vi.fn() }),
  useDocumentTemplates: () => ({ data: [] }),
}));

vi.mock('@/hooks/clinic/usePanelClaims', () => ({
  useSetCheckoutPanelClaimPortions: () => ({
    mutateAsync: state.legacySetCheckoutPortions,
    isPending: false,
  }),
}));

vi.mock('@/integrations/supabase/client', () => {
  const insuranceQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({
      data: {
        name: 'Care Panel',
        medication_discount_pct: 0,
        consultation_fee_override: null,
      },
      error: null,
    })),
  };
  insuranceQuery.select.mockReturnValue(insuranceQuery);
  insuranceQuery.eq.mockReturnValue(insuranceQuery);

  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'insurance_providers') return insuranceQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
      rpc: state.checkout,
    },
  };
});

vi.mock('@/components/clinic/consultation/IssueDocumentModal', () => ({ IssueDocumentModal: () => null }));
vi.mock('@/components/clinic/consultation/DocumentAuditLine', () => ({ DocumentAuditLine: () => null }));
vi.mock('@/components/clinic/consultation/ViewDocumentModal', () => ({ ViewDocumentModal: () => null }));
vi.mock('@/components/clinic/billing/PrintReceiptDialog', () => ({ PrintReceiptDialog: () => null }));
vi.mock('@/components/clinic/StatusBadge', () => ({ StatusBadge: () => null }));
vi.mock('@/components/clinic/patient/FollowUpScheduler', () => ({ FollowUpScheduler: () => null }));
vi.mock('@/components/clinic/visit/VisitDetailsColumn', () => ({ VisitDetailsColumn: () => null }));
vi.mock('@/components/clinic/visit/AttachmentsCard', () => ({ AttachmentsCard: () => null }));
vi.mock('@/components/clinic/visit/BillingDetailsColumn', () => ({
  BillingDetailsColumn: ({ onChargesChange }: {
    onChargesChange?: (charges: Array<{ charge_type_id: string; name: string; amount: number }>) => void;
  }) => {
    useEffect(() => {
      onChargesChange?.(state.includeOtherCharge
        ? [{
            charge_type_id: 'regulatory-charge-type-1',
            name: 'Regulatory Compliance Charges',
            amount: 15,
          }]
        : []);
    }, [onChargesChange]);
    return null;
  },
}));
vi.mock('@/components/clinic/visit/DispensePanel', () => ({ DispensePanel: () => null }));
vi.mock('@/components/clinic/PatientAlertBanner', () => ({ PatientAlertBanner: () => null }));
vi.mock('@/components/clinic/VisitRemarksBanner', () => ({ VisitRemarksBanner: () => null }));
vi.mock('@/components/clinic/visit/CatalogItemPicker', () => ({ CatalogItemPicker: () => null }));
vi.mock('@/components/clinic/visit/EditInstructionsDialog', () => ({ EditInstructionsDialog: () => null }));
vi.mock('@/components/clinic/consultation/ConsultationLockBanner', () => ({ ConsultationLockBanner: () => null }));

import DispenseCheckout from '@/pages/clinic/DispenseCheckout';

async function renderCheckout() {
  render(<DispenseCheckout />);
  await screen.findByText(/Panel Billing Applied: Care Panel/i);
}

function openAndConfirmDefaultSplit() {
  fireEvent.click(screen.getByRole('switch', { name: 'Split panel payment' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm portions' }));
}

describe('dispensary panel payment split', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.role = 'ops_staff';
    state.includeOtherCharge = false;
    state.items = [{ id: 'item-1', item_id: null, item_name: 'Medication', quantity: 1, price: 100 }];
    state.addConsultationItem.mockResolvedValue({
      id: 'fee-1',
      item_name: 'Consultation Fee',
      quantity: 1,
      price: 18,
    });
    state.checkout.mockResolvedValue({
      data: { status: 'partial', balance_due: 100, payment_id: null },
      error: null,
    });
    state.legacySetCheckoutPortions.mockResolvedValue({ panelClaimId: 'claim-1', portions: [] });
  });

  it('keeps checkout unsplit by default', async () => {
    await renderCheckout();

    expect(screen.getByRole('switch', { name: 'Split panel payment' })).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Complete Panel Checkout' }));

    await waitFor(() => expect(state.navigate).toHaveBeenCalledWith('/clinic/queue'));
    expect(state.checkout).toHaveBeenCalledTimes(1);
    expect(state.legacySetCheckoutPortions).not.toHaveBeenCalled();
    expect(state.checkout).toHaveBeenCalledWith('checkout_visit', expect.objectContaining({
      p_panel_covered_amount: 100,
      p_panel_portions: null,
      p_checkout_idempotency_key: expect.any(String),
    }));
  });

  it('preserves the charge type identity when checkout saves an other charge', async () => {
    state.includeOtherCharge = true;
    await renderCheckout();

    fireEvent.click(screen.getByRole('button', { name: 'Complete Panel Checkout' }));

    await waitFor(() => expect(state.checkout).toHaveBeenCalledTimes(1));
    expect(state.checkout).toHaveBeenCalledWith('checkout_visit', expect.objectContaining({
      p_other_charges: [{
        charge_type_id: 'regulatory-charge-type-1',
        name: 'Regulatory Compliance Charges',
        amount: 15,
      }],
    }));
  });

  it('hides the split control from unauthorized roles', async () => {
    state.role = 'resident_doctor';
    await renderCheckout();

    expect(screen.queryByRole('switch', { name: 'Split panel payment' })).not.toBeInTheDocument();
  });

  it('lets operations staff add the resolved consultation fee at dispensary', async () => {
    await renderCheckout();

    fireEvent.click(screen.getByRole('button', { name: /Add consultation fee/i }));

    await waitFor(() => expect(state.addConsultationItem).toHaveBeenCalledTimes(1));
    expect(state.addConsultationItem).toHaveBeenCalledWith({
      consultation_id: 'consultation-1',
      item_name: 'Consultation Fee',
      quantity: 1,
      price: 18,
    });
  });

  it('does not offer to add a duplicate consultation fee', async () => {
    state.items = [
      { id: 'item-1', item_id: null, item_name: 'Medication', quantity: 1, price: 100 },
      { id: 'fee-1', item_id: null, item_name: 'Consultation Fee', quantity: 1, price: 18 },
    ];

    await renderCheckout();

    expect(screen.queryByRole('button', { name: /Add consultation fee/i })).not.toBeInTheDocument();
  });

  it('allows a purchaser to commit a split in the checkout transaction', async () => {
    state.role = 'purchaser';
    await renderCheckout();
    openAndConfirmDefaultSplit();

    fireEvent.click(screen.getByRole('button', { name: 'Complete Panel Checkout' }));

    await waitFor(() => expect(state.navigate).toHaveBeenCalledWith('/clinic/queue'));
    expect(state.checkout).toHaveBeenCalledTimes(1);
    expect(state.checkout).toHaveBeenCalledWith('checkout_visit', expect.objectContaining({
      p_panel_covered_amount: 100,
      p_panel_portions: [
        { amount: 50, remark: '' },
        { amount: 50, remark: '' },
      ],
    }));
    expect(state.legacySetCheckoutPortions).not.toHaveBeenCalled();
  });

  it('disables checkout until edited portions exactly match panel coverage', async () => {
    await renderCheckout();
    const checkout = screen.getByRole('button', { name: 'Complete Panel Checkout' });
    fireEvent.click(screen.getByRole('switch', { name: 'Split panel payment' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Portion 1 amount (RM)')).toHaveValue(50);
    expect(within(dialog).getByLabelText('Portion 2 amount (RM)')).toHaveValue(50);
    expect(checkout).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText('Portion 1 amount (RM)'), {
      target: { value: '40' },
    });
    expect(within(dialog).getByText('Portions must add up exactly to the claim amount.')).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Confirm portions' })).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText('Portion 2 amount (RM)'), {
      target: { value: '60' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm portions' }));
    expect(checkout).toBeEnabled();
  });

  it('creates portions totaling panel coverage for a mixed-payer checkout', async () => {
    await renderCheckout();
    fireEvent.change(screen.getByLabelText('Covered by Panel (RM)'), { target: { value: '60' } });
    openAndConfirmDefaultSplit();

    fireEvent.click(screen.getByRole('button', { name: 'Record Co-pay & Complete' }));

    await waitFor(() => expect(state.navigate).toHaveBeenCalledWith('/clinic/queue'));
    expect(state.checkout).toHaveBeenCalledWith('checkout_visit', expect.objectContaining({
      p_total_amount: 100,
      p_amount_paid: 40,
      p_panel_covered_amount: 60,
      p_panel_portions: [
        { amount: 30, remark: '' },
        { amount: 30, remark: '' },
      ],
      p_checkout_idempotency_key: expect.any(String),
    }));
    expect(state.legacySetCheckoutPortions).not.toHaveBeenCalled();
    expect(state.navigate).toHaveBeenCalledWith('/clinic/queue');
  });

  it('retries an ambiguous atomic checkout with the same durable idempotency key', async () => {
    state.checkout
      .mockResolvedValueOnce({ data: null, error: new Error('Connection closed after commit') })
      .mockResolvedValueOnce({
        data: { status: 'paid', balance_due: 0, payment_id: null },
        error: null,
      });
    await renderCheckout();
    openAndConfirmDefaultSplit();

    fireEvent.click(screen.getByRole('button', { name: 'Complete Panel Checkout' }));

    await waitFor(() => expect(state.checkout).toHaveBeenCalledTimes(1));
    expect(state.navigate).not.toHaveBeenCalled();
    expect(screen.queryByText('Visit completed, but the panel split still needs saving.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Complete Panel Checkout' }));

    await waitFor(() => expect(state.navigate).toHaveBeenCalledWith('/clinic/queue'));
    expect(state.checkout).toHaveBeenCalledTimes(2);
    const firstKey = state.checkout.mock.calls[0][1].p_checkout_idempotency_key;
    const secondKey = state.checkout.mock.calls[1][1].p_checkout_idempotency_key;
    expect(firstKey).toEqual(secondKey);
    expect(state.legacySetCheckoutPortions).not.toHaveBeenCalled();
  });
});
