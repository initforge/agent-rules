import { useEffect, useMemo, useRef, useState } from 'react';
import { LOGIN_NAME_REGEX, normalizeLoginName } from '@/lib/validation/login-name';
import { isLoginNameTakenByOtherEmployee } from '../services/nhan-vien-service';
import { txt } from '@/lib/text';

const DEBOUNCE_MS = 400;

function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

interface UseLoginNameAvailabilityOptions {
  loginName: string;
  excludeEmployeeId?: string;
  initialLoginName?: string | null;
  enabled?: boolean;
  setFieldError: (message: string) => void;
  clearFieldError: () => void;
}

type CheckResult = 'idle' | 'duplicate' | 'available';

export function useLoginNameAvailability({
  loginName,
  excludeEmployeeId,
  initialLoginName,
  enabled = true,
  setFieldError,
  clearFieldError,
}: UseLoginNameAvailabilityOptions): {
  isChecking: boolean;
  isDuplicate: boolean;
} {
  const normalized = useMemo(
    () => (loginName.trim() ? normalizeLoginName(loginName) : ''),
    [loginName],
  );

  const initialNormalized = useMemo(
    () => (initialLoginName?.trim() ? normalizeLoginName(initialLoginName) : ''),
    [initialLoginName],
  );

  const shouldCheck = useMemo(() => {
    if (!enabled) return false;
    if (!normalized) return false;
    if (initialNormalized && normalized === initialNormalized) return false;
    if (!LOGIN_NAME_REGEX.test(normalized)) return false;
    return true;
  }, [enabled, normalized, initialNormalized]);

  const debouncedNormalized = useDebouncedValue(normalized, DEBOUNCE_MS);
  const isPendingDebounce = shouldCheck && normalized !== debouncedNormalized;

  const [checkResult, setCheckResult] = useState<CheckResult>('idle');
  const [isFetching, setIsFetching] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!shouldCheck) {
      clearFieldError();
    }
  }, [shouldCheck, clearFieldError]);

  useEffect(() => {
    if (!shouldCheck || normalized !== debouncedNormalized) {
      return;
    }

    const requestId = ++requestIdRef.current;
    let cancelled = false;

    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setIsFetching(true);

      void (async () => {
        try {
          const taken = await isLoginNameTakenByOtherEmployee(
            debouncedNormalized,
            excludeEmployeeId,
          );
          if (cancelled || requestId !== requestIdRef.current) return;
          setCheckResult(taken ? 'duplicate' : 'available');
          if (taken) {
            setFieldError(txt('employee.validation.loginNameDuplicate'));
          } else {
            clearFieldError();
          }
        } catch {
          if (cancelled || requestId !== requestIdRef.current) return;
          setCheckResult('idle');
        } finally {
          if (!cancelled && requestId === requestIdRef.current) {
            setIsFetching(false);
          }
        }
      })();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    shouldCheck,
    normalized,
    debouncedNormalized,
    excludeEmployeeId,
    setFieldError,
    clearFieldError,
  ]);

  const isChecking = shouldCheck && (isPendingDebounce || isFetching);
  const isDuplicate =
    shouldCheck &&
    !isPendingDebounce &&
    !isFetching &&
    checkResult === 'duplicate';

  return { isChecking, isDuplicate };
}
