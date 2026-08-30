import React from 'react';
import { cn } from '@/lib/utils';

export interface FormStepperStep {
  id: string;
  label: string;
  description?: string;
}

export interface FormStepperProps {
  steps: FormStepperStep[];
  /** Bước đang active (0-based) */
  currentStep: number;
  className?: string;
  /** Cho phép bấm lại các bước đã qua */
  allowBackNavigation?: boolean;
  onStepClick?: (index: number) => void;
  idPrefix?: string;
  /** `aria-label` cho `<nav>` (mặc định tiếng Việt; có thể truyền `txt('…')`) */
  ariaLabel?: string;
}

/**
 * Thanh bước cho form dài — component cha giữ state `currentStep` và render nội dung từng bước.
 */
export function FormStepper({
  steps,
  currentStep,
  className,
  allowBackNavigation = false,
  onStepClick,
  idPrefix = 'form-stepper',
  ariaLabel = 'Tiến trình form',
}: FormStepperProps) {
  return (
    <nav className={cn('w-full', className)} aria-label={ariaLabel}>
      <ol className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
        {steps.map((step, index) => {
          const isActive = index === currentStep;
          const isPast = index < currentStep;
          const isFuture = index > currentStep;
          const canGoBack = Boolean(allowBackNavigation && isPast && onStepClick);

          const circle = (
            <span
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                isActive && 'bg-primary text-primary-foreground ring-2 ring-primary/30',
                isPast && !isActive && 'bg-primary/15 text-primary',
                isFuture && 'bg-muted text-muted-foreground'
              )}
            >
              {index + 1}
            </span>
          );

          return (
            <li
              key={step.id}
              className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-[220px]"
              aria-current={isActive ? 'step' : undefined}
            >
              {canGoBack ? (
                <button
                  type="button"
                  id={`${idPrefix}-step-${index}`}
                  onClick={() => onStepClick!(index)}
                  className="flex items-start gap-2 rounded-lg text-left outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {circle}
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-foreground">{step.label}</span>
                    {step.description ? (
                      <span className="mt-0.5 block text-[10px] text-muted-foreground line-clamp-2">
                        {step.description}
                      </span>
                    ) : null}
                  </span>
                </button>
              ) : (
                <div className="flex items-start gap-2" id={`${idPrefix}-step-${index}`}>
                  {circle}
                  <span className="min-w-0">
                    <span
                      className={cn(
                        'block text-xs font-semibold',
                        isActive ? 'text-foreground' : 'text-muted-foreground'
                      )}
                    >
                      {step.label}
                    </span>
                    {step.description ? (
                      <span className="mt-0.5 block text-[10px] text-muted-foreground line-clamp-2">
                        {step.description}
                      </span>
                    ) : null}
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
