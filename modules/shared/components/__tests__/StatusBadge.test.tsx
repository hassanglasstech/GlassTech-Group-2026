/**
 * StatusBadge.test.tsx — component render test (Testing Library) establishing
 * the RTL pattern for this repo. Proves the badge renders the label and pulls
 * its colour from the central statusColors tone map (not hand-picked classes).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';

afterEach(cleanup);

describe('StatusBadge', () => {
  it('renders the status label', () => {
    render(<StatusBadge status="QC-Passed" />);
    expect(screen.getByText('QC-Passed')).toBeTruthy();
  });

  it('applies the semantic tone class for the status', () => {
    render(<StatusBadge status="Overdue" />);
    const el = screen.getByText('Overdue');
    expect(el.className).toContain('bg-danger-subtle');
    expect(el.className).toContain('text-danger');
  });

  it('renders a leading, aria-hidden dot in the tone colour when dot is set', () => {
    const { container } = render(<StatusBadge status="Paid" dot />);
    const dot = container.querySelector('[aria-hidden]') as HTMLElement | null;
    expect(dot).not.toBeNull();
    expect(dot?.className).toContain('bg-success');
    expect(dot?.className).toContain('rounded-full');
  });

  it('has no dot by default', () => {
    const { container } = render(<StatusBadge status="Draft" />);
    expect(container.querySelector('[aria-hidden]')).toBeNull();
  });

  it('applies the small size classes', () => {
    render(<StatusBadge status="Draft" size="sm" />);
    expect(screen.getByText('Draft').className).toContain('text-2xs');
  });
});
