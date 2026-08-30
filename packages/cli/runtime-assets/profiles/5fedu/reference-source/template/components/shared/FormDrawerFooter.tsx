import React from 'react';
import { Save, ArrowRight, UserPlus } from 'lucide-react';
import Button from '@/components/ui/Button';
import { BTN_CANCEL, BTN_SAVE, BTN_CREATE } from '@/lib/button-labels';
import { txt } from '@/lib/text';

export interface FormDrawerStepNavigation {
  currentStep: number;
  totalSteps: number;
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
}

export interface FormDrawerFooterProps {
  /** Id của form để submit từ ngoài (nút Lưu/Tạo gửi submit cho form này) */
  formId: string;
  onCancel: () => void;
  isLoading?: boolean;
  isEdit?: boolean;
  /** Nút gọn (h-8, text-xs, shadow-sm) — dùng cùng `footerCompact` trên GenericDrawer */
  compact?: boolean;
  /** Nhãn nút Lưu khi sửa (mặc định BTN_SAVE) */
  saveLabel?: string;
  /** Nhãn nút Tạo khi thêm mới (mặc định BTN_CREATE) */
  createLabel?: string;
  /** Nhãn nút Hủy (mặc định BTN_CANCEL) */
  cancelLabel?: string;
  /** Icon bên trái nút gửi khi **tạo mới** (mặc định UserPlus); nhãn nút lấy `BTN_CREATE` → **Thêm** */
  createIcon?: React.ReactNode;
  /** Form nhiều bước: hiển thị Quay lại / Tiếp thay cho Lưu khi chưa ở bước cuối */
  steps?: FormDrawerStepNavigation;
}

/**
 * Footer form drawer: Hủy (trái), Lưu / Thêm (phải) — `lib/button-labels.ts`, `docs/patterns-button-labels.md`.
 */
export const FormDrawerFooter: React.FC<FormDrawerFooterProps> = ({
  formId,
  onCancel,
  isLoading = false,
  isEdit = false,
  compact = false,
  saveLabel,
  createLabel,
  cancelLabel,
  createIcon,
  steps,
}) => {
  const resolvedCancel = cancelLabel ?? BTN_CANCEL();
  const resolvedSave = saveLabel ?? BTN_SAVE();
  const resolvedCreate = createLabel ?? BTN_CREATE();
  const resolvedCreateIcon = createIcon ?? <UserPlus className="mr-2 h-4 w-4" />;
  const resolvedCreateIconCompact = createIcon ?? <UserPlus className="w-3.5 h-3.5 mr-1.5 shrink-0" />;
  const onLastStep = !steps || steps.currentStep >= steps.totalSteps - 1;
  const resolvedNextLabel = steps?.nextLabel ?? txt('employee.form.stepNext');

  if (compact) {
    return (
      <div className="flex items-center justify-between w-full gap-2 flex-wrap">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          className="h-8 px-3 text-xs border-border text-muted-foreground"
        >
          {resolvedCancel}
        </Button>
        <div className="flex items-center gap-2">
          {steps && steps.currentStep > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={steps.onBack}
              className="h-8 px-3 text-xs"
            >
              {txt('nav.back')}
            </Button>
          )}
          {onLastStep ? (
            <Button
              type="submit"
              form={formId}
              size="sm"
              isLoading={isLoading}
              className="h-8 px-3 text-xs bg-primary text-white shadow-sm hover:bg-primary/90"
            >
              {isEdit ? (
                <>
                  <Save className="w-3.5 h-3.5 mr-1.5 shrink-0" /> {resolvedSave}
                </>
              ) : (
                <>
                  {resolvedCreateIconCompact}
                  {resolvedCreate}
                </>
              )}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={steps!.onNext}
              className="h-8 px-3 text-xs bg-primary text-white shadow-sm hover:bg-primary/90"
            >
              {resolvedNextLabel}
              <ArrowRight className="w-3.5 h-3.5 ml-1.5 shrink-0" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between w-full gap-3">
      <Button variant="outline" onClick={onCancel} className="border-border text-muted-foreground">
        {resolvedCancel}
      </Button>
      <Button type="submit" form={formId} isLoading={isLoading} className="bg-primary text-white shadow-lg">
        {isEdit ? (
          <>
            <Save className="mr-2 h-4 w-4" /> {resolvedSave}
          </>
        ) : (
          <>
            {resolvedCreateIcon} {resolvedCreate} <ArrowRight className="ml-2 h-4 w-4" />
          </>
        )}
      </Button>
    </div>
  );
};

export default FormDrawerFooter;
