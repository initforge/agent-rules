import React, { useMemo, useState, useEffect } from 'react';
import { txt } from '@/lib/text';
import { Shield, Building2 } from 'lucide-react';
import GenericDrawer, { DRAWER_WIDTH_DETAIL } from './GenericDrawer';
import Button from '@/components/ui/Button';
import { BTN_CLOSE } from '@/lib/button-labels';

export interface PositionOption {
  id: string;
  ten_chuc_vu: string;
  id_phong_ban?: string | null;
  ten_phong_ban?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  positions: PositionOption[];
  selectedIds: string[];
  onSave: (ids: string[]) => void;
  title?: string;
  /** Chỉ hiển thị chức vụ đang active (trang_thai === "Đang hoạt động") nếu type có trang_thai */
  activeOnly?: boolean;
}

const PositionPermissionPicker: React.FC<Props> = ({
  open,
  onClose,
  positions,
  selectedIds,
  onSave,
  title,
  activeOnly = true,
}) => {
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedIds));

  useEffect(() => {
    if (open) queueMicrotask(() => setSelected(new Set(selectedIds)));
  }, [open, selectedIds]);

  const byPhong = useMemo(() => {
    const list = activeOnly && 'trang_thai' in (positions[0] ?? {})
      ? (positions as (PositionOption & { trang_thai?: string })[]).filter((p) => p.trang_thai !== 'Ngừng hoạt động')
      : positions;
    const map = new Map<string, PositionOption[]>();
    for (const p of list) {
      const key = p.id_phong_ban ?? '__none__';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    const phongOrder = new Map<string, string>();
    list.forEach((p) => {
      const key = p.id_phong_ban ?? '__none__';
      if (!phongOrder.has(key)) phongOrder.set(key, p.ten_phong_ban || (txt('common.unknown') as string) || 'Không xác định');
    });
    return { map, order: Array.from(phongOrder.entries()).sort((a, b) => a[1].localeCompare(b[1])) };
  }, [positions, activeOnly]);

  const togglePosition = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePhong = (phongKey: string) => {
    const group = byPhong.map.get(phongKey) ?? [];
    const ids = group.map((p) => p.id);
    const allSelected = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const handleSave = () => {
    onSave(Array.from(selected));
    onClose();
  };

  const phongLabel = (key: string) => (key === '__none__' ? (txt('common.unknown') || 'Không xác định') : (byPhong.map.get(key)?.[0]?.ten_phong_ban ?? key));

  return (
    <GenericDrawer
      title={title ?? txt('taiLieu.detail.phanQuyenTitle')}
      icon={<Shield size={20} />}
      onClose={onClose}
      maxWidthClass={DRAWER_WIDTH_DETAIL}
      stackLevel={1}
      variant="modal"
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <Button variant="ghost" onClick={onClose} className="text-muted-foreground border border-border">
            {BTN_CLOSE()}
          </Button>
          <Button onClick={handleSave} className="bg-primary text-white hover:bg-primary/90">
            {txt('common.save')}
          </Button>
        </div>
      }
    >
      <p className="text-sm text-muted-foreground mb-4">{txt('taiLieu.detail.phanQuyenMessage')}</p>
      <div className="space-y-4">
        {byPhong.order.map(([phongKey]) => {
          const group = byPhong.map.get(phongKey) ?? [];
          if (group.length === 0) return null;
          const label = phongLabel(phongKey);
          const allSelected = group.every((p) => selected.has(p.id));
          const someSelected = group.some((p) => selected.has(p.id));
          return (
            <div key={phongKey} className="rounded-xl border border-border bg-card overflow-hidden">
              <button
                type="button"
                onClick={() => togglePhong(phongKey)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-muted/50 hover:bg-muted/70 transition-colors text-left"
              >
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected && !allSelected;
                  }}
                  onChange={() => togglePhong(phongKey)}
                  className="w-4 h-4 rounded border-border text-primary accent-primary cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                />
                <Building2 size={18} className="text-muted-foreground shrink-0" />
                <span className="font-medium text-foreground">{label}</span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {group.filter((p) => selected.has(p.id)).length}/{group.length}
                </span>
              </button>
              <div className="divide-y divide-border">
                {group.map((pos) => (
                  <label
                    key={pos.id}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(pos.id)}
                      onChange={() => togglePosition(pos.id)}
                      className="w-4 h-4 rounded border-border text-primary accent-primary cursor-pointer"
                    />
                    <span className="text-sm text-foreground">{pos.ten_chuc_vu}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </GenericDrawer>
  );
};

export default PositionPermissionPicker;
