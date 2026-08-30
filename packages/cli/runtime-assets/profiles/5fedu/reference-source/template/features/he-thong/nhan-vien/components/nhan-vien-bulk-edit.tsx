
import React, { useMemo, useState } from 'react';
import { txt } from '@/lib/text';
import { Users, Briefcase, CircleDot, Save, X } from 'lucide-react';
import GenericDrawer from '@/components/shared/GenericDrawer';
import FormSection from '@/components/shared/FormSection';
import Combobox from '@/components/ui/Combobox';
import Button from '@/components/ui/Button';
import { useDepartments } from '@/features/he-thong/phong-ban/hooks/use-phong-ban';
import { useActivePositions } from '@/features/he-thong/chuc-vu/hooks/use-chuc-vu';
import { getAvatarUrl } from '@/lib/utils';
import { STATUS_OPTIONS } from '../core/constants';
import { useBulkUpdateEmployees } from '../hooks/use-nhan-vien';
import { Employee } from '../core/types';
import {
  buildEmployeePositionComboboxOptions,
  getDepartmentIdForPosition,
} from '../utils/build-employee-position-options';

export interface BulkEditFields {
  phong_ban_id?: string;
  chuc_vu_id?: string;
  trang_thai?: string;
}

interface Props {
  selectedEmployees: Employee[];
  onClose: () => void;
  onSuccess: () => void;
}

const BulkEditSheet: React.FC<Props> = ({ selectedEmployees, onClose, onSuccess }) => {
  const [fields, setFields] = useState<BulkEditFields>({});
  const [enabledFields, setEnabledFields] = useState<Set<keyof BulkEditFields>>(new Set());

  const { data: departments = [] } = useDepartments();
  const { data: positions = [] } = useActivePositions();
  const bulkMutation = useBulkUpdateEmployees(() => {
    onSuccess();
    onClose();
  });

  const positionOptions = useMemo(
    () => buildEmployeePositionComboboxOptions(departments, positions),
    [departments, positions],
  );
  const statusOptions = STATUS_OPTIONS.map(s => ({ value: String(s.value), label: s.label }));

  const toggleField = (field: keyof BulkEditFields) => {
    const next = new Set(enabledFields);
    if (next.has(field)) {
      next.delete(field);
      const nextFields = { ...fields };
      delete nextFields[field];
      if (field === 'chuc_vu_id') {
        delete nextFields.phong_ban_id;
      }
      setFields(nextFields);
    } else {
      next.add(field);
    }
    setEnabledFields(next);
  };

  const handleSubmit = () => {
    const ids = selectedEmployees.map(e => e.id);
    const payload: Partial<BulkEditFields> = {};
    enabledFields.forEach(key => {
      if (key === 'phong_ban_id') return;
      if (fields[key] !== undefined && fields[key] !== '') {
        payload[key] = fields[key] as BulkEditFields[typeof key];
      }
    });
    if (payload.chuc_vu_id) {
      const deptId = getDepartmentIdForPosition(positions, payload.chuc_vu_id);
      if (deptId) payload.phong_ban_id = deptId;
    }
    if (Object.keys(payload).length === 0) return;
    bulkMutation.mutate({ ids, fields: payload });
  };

  const hasChanges = enabledFields.size > 0 && Array.from(enabledFields).some(k => {
    if (k === 'phong_ban_id') return false;
    return fields[k] !== undefined && fields[k] !== '';
  });

  const renderFieldToggle = (field: keyof BulkEditFields, label: string) => (
    <label className="flex items-center gap-2 cursor-pointer group">
      <input
        type="checkbox"
        checked={enabledFields.has(field)}
        onChange={() => toggleField(field)}
        className="w-4 h-4 rounded border-border text-primary accent-primary cursor-pointer"
      />
      <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">{label}</span>
    </label>
  );

  const footer = (
    <div className="flex items-center justify-between w-full gap-3">
      <Button variant="outline" onClick={onClose} className="border-border text-muted-foreground">
        <X size={16} className="mr-2" /> {txt('common.cancel')}
      </Button>
      <Button
        onClick={handleSubmit}
        isLoading={bulkMutation.isPending}
        disabled={!hasChanges}
        className="bg-primary text-white shadow-lg"
      >
        <Save size={16} className="mr-2" /> {txt('employee.bulk.applyButton', { count: selectedEmployees.length })}
      </Button>
    </div>
  );

  return (
    <GenericDrawer
      title={txt('employee.bulk.title')}
      subtitle={`${selectedEmployees.length} ${txt('employee.bulk.subtitle')}`}
      icon={<Users size={20} />}
      onClose={onClose}
      footer={footer}
      maxWidthClass="sm:w-[36rem] sm:min-w-[36rem] sm:max-w-[36rem]"
    >
      <div className="space-y-1">
        <div className="bg-muted/30 rounded-xl p-3 border border-border/50">
          <p className="text-xs font-medium text-muted-foreground mb-2">{txt('employee.bulk.selectedLabel')}</p>
          <div className="flex flex-wrap gap-1.5 max-h-[100px] overflow-y-auto custom-scrollbar">
            {selectedEmployees.map(emp => (
              <span key={emp.id} className="inline-flex items-center gap-1.5 bg-card border border-border rounded-lg px-2 py-1 text-xs">
                <img src={emp.anh_dai_dien || getAvatarUrl(emp.ho_ten ?? '')} className="w-5 h-5 rounded-full object-cover" alt={emp.ho_ten} />
                <span className="font-medium text-foreground">{emp.ho_ten}</span>
                <span className="text-muted-foreground font-mono">#{emp.id}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 flex items-start gap-3">
          <span className="text-amber-600 font-bold text-lg leading-none shrink-0">!</span>
          <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
            {txt('employee.bulk.warning')}
          </p>
        </div>

        <FormSection title={txt('employee.bulk.workSection')} icon={<Briefcase size={14} />}>
          <div className="space-y-4">
            <div className="space-y-2">
              {renderFieldToggle('chuc_vu_id', txt('employee.bulk.changePosition'))}
              {enabledFields.has('chuc_vu_id') && (
                <Combobox
                  options={positionOptions}
                  value={fields.chuc_vu_id || ''}
                  onChange={(val) => {
                    const deptId = getDepartmentIdForPosition(positions, val);
                    setFields(prev => ({
                      ...prev,
                      chuc_vu_id: val,
                      ...(deptId ? { phong_ban_id: deptId } : {}),
                    }));
                  }}
                  placeholder={txt('employee.form.positionPlaceholder')}
                  icon={<Briefcase size={16} className="text-muted-foreground" />}
                  dropdownInPortal
                />
              )}
              {enabledFields.has('chuc_vu_id') && (
                <p className="text-xs text-muted-foreground">{txt('employee.form.departmentAutoHint')}</p>
              )}
            </div>
            <div className="space-y-2">
              {renderFieldToggle('trang_thai', txt('employee.bulk.changeStatus'))}
              {enabledFields.has('trang_thai') && (
                <Combobox
                  options={statusOptions}
                  value={fields.trang_thai ?? ''}
                  onChange={(val) => setFields(prev => ({ ...prev, trang_thai: val }))}
                  placeholder={txt('employee.form.workStatusPlaceholder')}
                  icon={<CircleDot size={16} className="text-muted-foreground" />}
                  searchable={false}
                />
              )}
            </div>
          </div>
        </FormSection>
      </div>
    </GenericDrawer>
  );
};

export default BulkEditSheet;
