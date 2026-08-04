import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PanelClaimPortionEditor } from '@/components/clinic/claims/PanelClaimPortionEditor';

const initialPortions = [
  { amount: '150.00', remark: 'First approval' },
  { amount: '250.00', remark: '' },
];

function renderEditor(overrides: Partial<React.ComponentProps<typeof PanelClaimPortionEditor>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <PanelClaimPortionEditor
      claimAmount={400}
      initialPortions={initialPortions}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />,
  );
  return { onConfirm, onCancel };
}

describe('PanelClaimPortionEditor', () => {
  it('shows two initial rows with their optional remarks and exact allocation totals', () => {
    renderEditor();

    expect(screen.getAllByLabelText(/portion \d+ amount/i)).toHaveLength(2);
    expect(screen.getByLabelText('Portion 1 remarks')).toHaveValue('First approval');
    expect(screen.getByText('Allocated')).toBeVisible();
    expect(screen.getByText('RM 400.00')).toBeVisible();
    expect(screen.getByText('Remaining')).toBeVisible();
    expect(screen.getByText('RM 0.00')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confirm portions' })).toBeEnabled();
  });

  it('adds and removes rows while keeping the row controls available', () => {
    renderEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Add portion' }));
    expect(screen.getAllByLabelText(/portion \d+ amount/i)).toHaveLength(3);
    expect(screen.getByLabelText('Remove portion 3')).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Remove portion 3' }));
    expect(screen.getAllByLabelText(/portion \d+ amount/i)).toHaveLength(2);
  });

  it('updates live totals and blocks confirmation for an incomplete allocation', () => {
    renderEditor();

    fireEvent.change(screen.getByLabelText('Portion 2 amount (RM)'), { target: { value: '249.99' } });

    expect(screen.getByText('RM 399.99')).toBeVisible();
    expect(screen.getByText('RM 0.01')).toBeVisible();
    expect(screen.getByText('Portions must add up exactly to the claim amount.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confirm portions' })).toBeDisabled();
  });

  it('preserves in-progress edits across a parent rerender with equivalent initial portions', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { rerender } = render(
      <PanelClaimPortionEditor
        claimAmount={400}
        initialPortions={initialPortions}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    fireEvent.change(screen.getByLabelText('Portion 2 amount (RM)'), { target: { value: '200.00' } });
    fireEvent.change(screen.getByLabelText('Portion 2 remarks'), { target: { value: 'Awaiting balance' } });

    rerender(
      <PanelClaimPortionEditor
        claimAmount={400}
        initialPortions={initialPortions.map((portion) => ({ ...portion }))}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByLabelText('Portion 2 amount (RM)')).toHaveValue(200);
    expect(screen.getByLabelText('Portion 2 remarks')).toHaveValue('Awaiting balance');
  });

  it('preserves remaining row identity and values when a non-final row is removed', () => {
    renderEditor({
      initialPortions: [
        { amount: '100.00', remark: 'First approval' },
        { amount: '150.00', remark: 'Second approval' },
        { amount: '150.00', remark: 'Third approval' },
      ],
    });

    const secondAmount = screen.getByLabelText('Portion 2 amount (RM)');
    const thirdAmount = screen.getByLabelText('Portion 3 amount (RM)');
    fireEvent.change(secondAmount, { target: { value: '175.00' } });

    fireEvent.click(screen.getByRole('button', { name: 'Remove portion 1' }));

    expect(screen.getByLabelText('Portion 1 amount (RM)')).toBe(secondAmount);
    expect(screen.getByLabelText('Portion 2 amount (RM)')).toBe(thirdAmount);
    expect(secondAmount).toHaveValue(175);
    expect(thirdAmount).toHaveValue(150);
    expect(screen.getByLabelText('Portion 1 remarks')).toHaveValue('Second approval');
    expect(screen.getByLabelText('Portion 2 remarks')).toHaveValue('Third approval');
  });

  it('shows inline validation and blocks confirmation for malformed amounts', () => {
    renderEditor();

    fireEvent.change(screen.getByLabelText('Portion 2 amount (RM)'), { target: { value: '250.001' } });

    expect(screen.getByText('Enter a positive amount with up to two decimal places.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confirm portions' })).toBeDisabled();
  });

  it('confirms exact portions with normalized numeric amounts', () => {
    const { onConfirm } = renderEditor({
      initialPortions: [
        { amount: '150', remark: 'First approval' },
        { amount: '250.0', remark: 'Final approval' },
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Confirm portions' }));

    expect(onConfirm).toHaveBeenCalledWith([
      { amount: 150, remark: 'First approval' },
      { amount: 250, remark: 'Final approval' },
    ]);
  });

  it('disables all editing controls when locked while keeping cancellation available', () => {
    const { onCancel } = renderEditor({ disabled: true });

    expect(screen.getByLabelText('Portion 1 amount (RM)')).toBeDisabled();
    expect(screen.getByLabelText('Portion 1 remarks')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add portion' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove portion 1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Confirm portions' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
