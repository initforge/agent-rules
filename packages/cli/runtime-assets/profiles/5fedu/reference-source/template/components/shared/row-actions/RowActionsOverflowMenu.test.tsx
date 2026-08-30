import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React, { useRef } from 'react';
import { Mail } from 'lucide-react';
import { RowActionsOverflowMenu } from './RowActionsOverflowMenu';

function Harness({
  open,
  onClose,
  portalEnabled,
}: {
  open: boolean;
  onClose: () => void;
  portalEnabled: boolean;
}) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  return (
    <div>
      <button type="button" ref={anchorRef}>
        more
      </button>
      <RowActionsOverflowMenu
        open={open}
        onClose={onClose}
        anchorRef={anchorRef}
        portalEnabled={portalEnabled}
        items={[
          {
            key: 'mail',
            label: 'Send mail',
            icon: <Mail size={14} data-testid="mail-icon" />,
            onClick: vi.fn(),
          },
        ]}
      />
    </div>
  );
}

describe('RowActionsOverflowMenu', () => {
  it('renders menu items in portal when open', () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} portalEnabled />);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Send mail' })).toBeInTheDocument();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} portalEnabled />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
