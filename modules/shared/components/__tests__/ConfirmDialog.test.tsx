/**
 * ConfirmDialog.test.tsx — the branded window.confirm replacement. Proves the
 * async confirmModal() flow: the dialog shows with a variant inferred from the
 * message, and resolves true/false on Confirm/Cancel.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { ConfirmProvider, confirmModal } from '@/modules/shared/components/ConfirmDialog';

afterEach(cleanup);

const mount = () => render(<ConfirmProvider><div>app</div></ConfirmProvider>);

describe('confirmModal via ConfirmProvider', () => {
  it('shows a delete-variant dialog and resolves TRUE on confirm', async () => {
    mount();
    let result: boolean | undefined;
    await act(async () => { confirmModal('Delete this record?').then(r => { result = r; }); });

    // delete variant → "Confirm delete" title + "Delete" button
    expect(screen.getByText('Confirm delete')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Delete' })); });
    expect(result).toBe(true);
  });

  it('resolves FALSE on cancel', async () => {
    mount();
    let result: boolean | undefined;
    await act(async () => { confirmModal('Approve this quotation?').then(r => { result = r; }); });

    // "approve" → action variant, label "Approve"
    expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); });
    expect(result).toBe(false);
  });

  it('infers the danger variant for irreversible wording', async () => {
    mount();
    await act(async () => { confirmModal('This will permanently reset all data.').then(() => {}); });
    expect(screen.getByText('Warning')).toBeTruthy();                 // detectTitle('danger')
    expect(screen.getByRole('button', { name: 'Yes, proceed' })).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); });
  });
});
