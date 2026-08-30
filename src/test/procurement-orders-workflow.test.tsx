import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@tanstack/react-query', () => ({ useQuery: vi.fn(), useMutation: vi.fn(), useQueryClient: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('date-fns', () => ({ format: vi.fn(() => 'Aug 30, 2026') }));

vi.mock('@/hooks/clinic/usePurchaseOrders', () => ({
  usePurchaseOrders: vi.fn(),
  usePurchaseOrder: vi.fn(),
}));
vi.mock('@/hooks/clinic/useSuppliers', () => ({ useSuppliers: vi.fn() }));
vi.mock('@/hooks/clinic/useInventoryItems', () => ({ useInventoryItems: vi.fn(() => ({ items: [], isLoading: false })) }));
vi.mock('@/hooks/clinic/useClinicSettings', () => ({
  useClinicSettings: vi.fn(() => ({ settings: {}, isLoading: false, update: vi.fn() })),
}));
vi.mock('@/hooks/clinic/useProcurementAttachments', () => ({
  useProcurementAttachments: vi.fn(() => ({
    attachments: { data: [], isLoading: false },
    uploadAttachment: { mutateAsync: vi.fn(), isPending: false },
    deleteAttachment: { mutateAsync: vi.fn(), isPending: false },
    downloadAttachment: vi.fn(),
  })),
}));
vi.mock('@/hooks/clinic/usePurchaseOrderItems', () => ({
  usePurchaseOrderItems: vi.fn(() => ({
    addLine: { mutateAsync: vi.fn(), isPending: false },
    updateLine: { mutateAsync: vi.fn(), isPending: false },
    removeLine: { mutateAsync: vi.fn(), isPending: false },
  })),
}));
vi.mock('@/hooks/clinic/useProcurementDashboard', () => ({
  useProcurementDashboard: vi.fn(),
  useProcurementAccess: vi.fn(),
}));

import { OrdersTab } from '@/components/clinic/procurement/dashboard/OrdersTab';
import { POSheet } from '@/components/clinic/procurement/POSheet';
import { useProcurementAccess } from '@/hooks/clinic/useProcurementDashboard';
import { usePurchaseOrders, usePurchaseOrder } from '@/hooks/clinic/usePurchaseOrders';
import { useSuppliers } from '@/hooks/clinic/useSuppliers';
import type { PurchaseOrderDetail, PurchaseOrderListRow } from '@/hooks/clinic/usePurchaseOrders';
import type { ProcurementAttachmentRow } from '@/hooks/clinic/useProcurementAttachments';

/* ---------------- shared fakes ---------------- */

const listRow = (overrides: Partial<PurchaseOrderListRow> = {}): PurchaseOrderListRow => ({
  id: 'po-1',
  po_number: 'PO-2026-001',
  supplier_id: 's1',
  order_date: '2026-08-30',
  expected_date: '2026-09-06',
  status: 'Draft',
  total_amount: 100,
  notes: null,
  received_at: null,
  created_at: '2026-08-30T00:00:00Z',
  order_channel: 'internal',
  supplier_reference: null,
  approved_at: null,
  approved_by: null,
  ordered_at: null,
  ordered_by: null,
  supplier: { id: 's1', name: 'Pharma Sdn Bhd' },
  ...overrides,
});

const detail = (overrides: Partial<PurchaseOrderDetail> = {}): PurchaseOrderDetail => ({
  ...listRow(overrides),
  items: [
    {
      id: 'li1',
      po_id: 'po-1',
      inventory_item_id: 'i1',
      order_qty: 100,
      received_qty: 0,
      unit_cost: 2.5,
      total_price: 250,
      inventory_item: { id: 'i1', name: 'Paracetamol', cost_price: 2.5 },
    },
  ],
  ...overrides,
});

/* ---------------- OrdersTab ---------------- */

describe('OrdersTab', () => {
  const baseHook = {
    orders: [] as PurchaseOrderListRow[],
    isLoading: false,
    createDraft: { mutateAsync: vi.fn(), isPending: false },
    updateHeader: { mutateAsync: vi.fn(), isPending: false },
    transitionOrder: { mutateAsync: vi.fn(), isPending: false },
    receiveGoods: { mutateAsync: vi.fn(), isPending: false },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePurchaseOrders).mockReturnValue(baseHook as ReturnType<typeof usePurchaseOrders>);
  });

  it('renders status filters and order columns', () => {
    vi.mocked(usePurchaseOrders).mockReturnValue({
      ...baseHook,
      orders: [listRow()],
    } as ReturnType<typeof usePurchaseOrders>);
    render(
      <MemoryRouter>
        <OrdersTab onOpenPO={() => {}} onAddPO={() => {}} />
      </MemoryRouter>,
    );
    for (const f of ['Draft', 'Awaiting approval', 'Ordered', 'Received', 'All']) {
      expect(screen.getByRole('button', { name: f })).toBeInTheDocument();
    }
    expect(screen.getByText('PO-2026-001')).toBeInTheDocument();
    expect(screen.getByText('Pharma Sdn Bhd')).toBeInTheDocument();
    expect(screen.getByText('RM 100.00')).toBeInTheDocument();
  });

  it('links to supplier and invoice administration', () => {
    render(
      <MemoryRouter>
        <OrdersTab onOpenPO={() => {}} onAddPO={() => {}} />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: /manage suppliers/i });
    expect(link).toHaveAttribute('href', '/clinic/procurement');
  });
});

/* ---------------- POSheet workflow ---------------- */

describe('POSheet workflow', () => {
  const transitionMock = { mutateAsync: vi.fn(), isPending: false };
  const receiveMock = { mutateAsync: vi.fn(), isPending: false };
  const updateMock = { mutateAsync: vi.fn(), isPending: false };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSuppliers).mockReturnValue({
      suppliers: [{ id: 's1', name: 'Pharma Sdn Bhd', status: 'active' }],
      isLoading: false,
    } as ReturnType<typeof useSuppliers>);
    vi.mocked(usePurchaseOrders).mockReturnValue({
      orders: [],
      isLoading: false,
      createDraft: { mutateAsync: vi.fn(), isPending: false },
      updateHeader: updateMock,
      transitionOrder: transitionMock,
      receiveGoods: receiveMock,
    } as ReturnType<typeof usePurchaseOrders>);
  });

  it('shows Submit order on drafts; result Awaiting approval surfaces management approval toast', async () => {
    vi.mocked(usePurchaseOrder).mockReturnValue({
      data: detail({ status: 'Draft' }),
      isLoading: false,
    } as ReturnType<typeof usePurchaseOrder>);
    vi.mocked(useProcurementAccess).mockReturnValue({
      canManage: true,
      canApprove: false,
      isLoading: false,
    } as ReturnType<typeof useProcurementAccess>);
    transitionMock.mutateAsync.mockResolvedValue('Awaiting approval');

    const { toast } = await import('sonner');
    render(
      <MemoryRouter>
        <POSheet poId="po-1" open onOpenChange={() => {}} canApprove={false} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /submit order/i }));
    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /submit order/i }));

    await vi.waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Order sent for management approval');
    });
    expect(transitionMock.mutateAsync).toHaveBeenCalledWith({ id: 'po-1', status: 'Ordered' });
  });

  it('shows Approve and order only for permitted approvers', () => {
    vi.mocked(usePurchaseOrder).mockReturnValue({
      data: detail({ status: 'Awaiting approval' }),
      isLoading: false,
    } as ReturnType<typeof usePurchaseOrder>);
    vi.mocked(useProcurementAccess).mockReturnValue({
      canManage: true,
      canApprove: true,
      isLoading: false,
    } as ReturnType<typeof useProcurementAccess>);

    render(
      <MemoryRouter>
        <POSheet poId="po-1" open onOpenChange={() => {}} canApprove />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /approve and order/i })).toBeInTheDocument();
  });

  it('operations (non-approver) do not see Approve and order', () => {
    vi.mocked(usePurchaseOrder).mockReturnValue({
      data: detail({ status: 'Awaiting approval' }),
      isLoading: false,
    } as ReturnType<typeof usePurchaseOrder>);
    vi.mocked(useProcurementAccess).mockReturnValue({
      canManage: true,
      canApprove: false,
      isLoading: false,
    } as ReturnType<typeof useProcurementAccess>);

    render(
      <MemoryRouter>
        <POSheet poId="po-1" open onOpenChange={() => {}} canApprove={false} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('button', { name: /approve and order/i })).not.toBeInTheDocument();
  });

  it('Ordered records show Follow up and Receive goods', () => {
    vi.mocked(usePurchaseOrder).mockReturnValue({
      data: detail({ status: 'Ordered' }),
      isLoading: false,
    } as ReturnType<typeof usePurchaseOrder>);
    vi.mocked(useProcurementAccess).mockReturnValue({
      canManage: true,
      canApprove: false,
      isLoading: false,
    } as ReturnType<typeof useProcurementAccess>);

    render(
      <MemoryRouter>
        <POSheet poId="po-1" open onOpenChange={() => {}} canApprove={false} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /follow up/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /receive goods/i })).toBeInTheDocument();
  });

  it('external channel reveals supplier reference and evidence upload', () => {
    vi.mocked(usePurchaseOrder).mockReturnValue({
      data: detail({ status: 'Ordered', order_channel: 'whatsapp' }),
      isLoading: false,
    } as ReturnType<typeof usePurchaseOrder>);
    vi.mocked(useProcurementAccess).mockReturnValue({
      canManage: true,
      canApprove: false,
      isLoading: false,
    } as ReturnType<typeof useProcurementAccess>);

    render(
      <MemoryRouter>
        <POSheet poId="po-1" open onOpenChange={() => {}} canApprove={false} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/supplier reference/i)).toBeInTheDocument();
    expect(screen.getByText(/evidence/i)).toBeInTheDocument();
    expect(
      document.querySelector('input[type="file"]'),
    ).not.toBeNull();
  });

  it('disables action buttons while mutations are pending', () => {
    vi.mocked(usePurchaseOrder).mockReturnValue({
      data: detail({ status: 'Ordered' }),
      isLoading: false,
    } as ReturnType<typeof usePurchaseOrder>);
    vi.mocked(useProcurementAccess).mockReturnValue({
      canManage: true,
      canApprove: false,
      isLoading: false,
    } as ReturnType<typeof useProcurementAccess>);

    const first = render(
      <MemoryRouter>
        <POSheet poId="po-1" open onOpenChange={() => {}} canApprove={false} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /receive goods/i })).toBeEnabled();
    first.unmount();

    // now with a pending receive mutation
    vi.mocked(usePurchaseOrders).mockReturnValue({
      orders: [],
      isLoading: false,
      createDraft: { mutateAsync: vi.fn(), isPending: false },
      updateHeader: updateMock,
      transitionOrder: transitionMock,
      receiveGoods: { mutateAsync: vi.fn(), isPending: true },
    } as ReturnType<typeof usePurchaseOrders>);
    render(
      <MemoryRouter>
        <POSheet poId="po-1" open onOpenChange={() => {}} canApprove={false} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /receive goods/i })).toBeDisabled();
  });

  it('Received and Cancelled records are read-only', () => {
    vi.mocked(usePurchaseOrder).mockReturnValue({
      data: detail({ status: 'Received' }),
      isLoading: false,
    } as ReturnType<typeof usePurchaseOrder>);
    vi.mocked(useProcurementAccess).mockReturnValue({
      canManage: true,
      canApprove: false,
      isLoading: false,
    } as ReturnType<typeof useProcurementAccess>);

    render(
      <MemoryRouter>
        <POSheet poId="po-1" open onOpenChange={() => {}} canApprove={false} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/can no longer be edited/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /submit order/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /receive goods/i })).not.toBeInTheDocument();
  });
});

/* ---------------- ProcurementAttachments ---------------- */

describe('ProcurementAttachments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists file name, uploader timestamp, download and delete; enforces accepted types', async () => {
    const attachmentsHook = await import('@/hooks/clinic/useProcurementAttachments');
    const rows: ProcurementAttachmentRow[] = [
      {
        id: 'a1',
        po_id: 'po-1',
        storage_path: 'po-1/uuid-invoice.pdf',
        file_name: 'invoice.pdf',
        mime_type: 'application/pdf',
        size_bytes: 1234,
        created_at: '2026-08-30T10:00:00Z',
        uploaded_by: null,
      },
    ];
    vi.spyOn(attachmentsHook, 'useProcurementAttachments').mockReturnValue({
      attachments: { data: rows, isLoading: false },
      uploadAttachment: { mutateAsync: vi.fn(), isPending: false },
      deleteAttachment: { mutateAsync: vi.fn(), isPending: false },
      downloadAttachment: vi.fn(),
    } as ReturnType<typeof attachmentsHook.useProcurementAttachments>);

    const { ProcurementAttachments } = await import('@/components/clinic/procurement/ProcurementAttachments');
    render(<ProcurementAttachments poId="po-1" />);
    expect(screen.getByText('invoice.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.accept).toBe('application/pdf,image/jpeg,image/png,image/webp');
  });
});
