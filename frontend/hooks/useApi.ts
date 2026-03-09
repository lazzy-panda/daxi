import { useState, useCallback, useRef, useEffect } from 'react';
import { ApiError } from '../services/api';

interface UseApiState<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
}

interface UseApiResult<T> extends UseApiState<T> {
  execute: (...args: unknown[]) => Promise<T | null>;
  setData: (data: T | null) => void;
  reset: () => void;
}

export function useApi<T>(
  apiFn: (...args: unknown[]) => Promise<T>,
  options?: {
    onSuccess?: (data: T) => void;
    onError?: (error: string) => void;
    immediate?: boolean;
  }
): UseApiResult<T> {
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    isLoading: false,
    error: null,
  });

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const execute = useCallback(
    async (...args: unknown[]): Promise<T | null> => {
      if (!isMountedRef.current) return null;

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const data = await apiFn(...args);
        if (isMountedRef.current) {
          setState({ data, isLoading: false, error: null });
          options?.onSuccess?.(data);
        }
        return data;
      } catch (err) {
        const errorMessage =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
            ? err.message
            : 'An unexpected error occurred';

        if (isMountedRef.current) {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: errorMessage,
          }));
          options?.onError?.(errorMessage);
        }
        return null;
      }
    },
    [apiFn, options]
  );

  const setData = useCallback((data: T | null) => {
    setState((prev) => ({ ...prev, data }));
  }, []);

  const reset = useCallback(() => {
    setState({ data: null, isLoading: false, error: null });
  }, []);

  return { ...state, execute, setData, reset };
}

export function useApiCallback<T>(
  apiFn: (...args: unknown[]) => Promise<T>
): {
  execute: (...args: unknown[]) => Promise<T | null>;
  isLoading: boolean;
  error: string | null;
} {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (...args: unknown[]): Promise<T | null> => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await apiFn(...args);
        setIsLoading(false);
        return data;
      } catch (err) {
        const errorMessage =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
            ? err.message
            : 'An unexpected error occurred';
        setIsLoading(false);
        setError(errorMessage);
        return null;
      }
    },
    [apiFn]
  );

  return { execute, isLoading, error };
}
