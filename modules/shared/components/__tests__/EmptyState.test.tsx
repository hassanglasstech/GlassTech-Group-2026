/**
 * EmptyState.test.tsx — the "nothing here yet" component: title + optional
 * description + optional primary/secondary actions.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { EmptyState } from '@/modules/shared/components/EmptyState';

afterEach(cleanup);

describe('EmptyState', () => {
  it('renders the title and description', () => {
    render(<EmptyState title="No requisitions match" description="Try clearing filters." />);
    expect(screen.getByText('No requisitions match')).toBeTruthy();
    expect(screen.getByText('Try clearing filters.')).toBeTruthy();
  });

  it('renders the primary action and fires its onClick', () => {
    const onClick = vi.fn();
    render(<EmptyState title="Empty" action={{ label: 'New Requisition', onClick }} />);
    fireEvent.click(screen.getByRole('button', { name: 'New Requisition' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders both primary and secondary actions', () => {
    render(
      <EmptyState
        title="Empty"
        action={{ label: 'Create', onClick: vi.fn() }}
        secondaryAction={{ label: 'Clear filters', onClick: vi.fn() }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Create' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeTruthy();
  });

  it('shows no action button when none is provided', () => {
    const { container } = render(<EmptyState title="Empty" />);
    expect(container.querySelector('button')).toBeNull();
  });
});
