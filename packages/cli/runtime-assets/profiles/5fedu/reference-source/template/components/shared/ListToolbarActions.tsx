import type { LucideIcon } from 'lucide-react';
import { Plus } from 'lucide-react';
import Button from '@/components/ui/Button';
import Tooltip from '@/components/ui/Tooltip';
import { BTN_ADD } from '@/lib/button-labels';
import {
  TOOLBAR_LIST_ACTION_ICON_CLASS,
  TOOLBAR_LIST_ADD_BUTTON_CLASS,
  TOOLBAR_LIST_ADD_ICON_CLASS,
  TOOLBAR_LIST_ICON_BUTTON_CLASS,
} from '@/lib/toolbar-list-actions';

interface ListToolbarIconButtonProps {
  icon: LucideIcon;
  tooltip: string;
  onClick: () => void;
  disabled?: boolean;
}

export function ListToolbarIconButton({
  icon: Icon,
  tooltip,
  onClick,
  disabled = false,
}: ListToolbarIconButtonProps): React.ReactElement {
  return (
    <Tooltip content={tooltip} placement="bottom">
      <Button
        variant="outline"
        size="sm"
        onClick={onClick}
        disabled={disabled}
        className={TOOLBAR_LIST_ICON_BUTTON_CLASS}
      >
        <Icon className={TOOLBAR_LIST_ACTION_ICON_CLASS} />
      </Button>
    </Tooltip>
  );
}

interface ListToolbarAddButtonProps {
  onClick: () => void;
  label?: string;
  disabled?: boolean;
}

export function ListToolbarAddButton({
  onClick,
  label,
  disabled = false,
}: ListToolbarAddButtonProps): React.ReactElement {
  const displayLabel = label ?? BTN_ADD();

  return (
    <Button
      onClick={onClick}
      size="sm"
      disabled={disabled}
      className={TOOLBAR_LIST_ADD_BUTTON_CLASS}
    >
      <Plus className={TOOLBAR_LIST_ADD_ICON_CLASS} />
      <span className="text-xs">{displayLabel}</span>
    </Button>
  );
}
