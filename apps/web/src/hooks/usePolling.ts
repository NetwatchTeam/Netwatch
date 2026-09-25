import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { config } from '../config';

interface PollingState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
}

/**
 * Charge une ressource puis la rafraîchit périodiquement.
 * Le rafraîchissement est suspendu quand l'onglet n'est pas visible.
 * Passer intervalMs = 0 pour un chargement unique.
 */
export function usePolling<T>(
  fetcher: () => Promise<T>,
  deps: DependencyList = [],
  intervalMs: number = config.refreshIntervalMs,
) {
  const [state, setState] = useState<PollingState<T>>({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);

  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const data = await fetcherRef.current();
        if (!cancelled) setState({ data, error: null, loading: false });
      } catch (err) {
        if (!cancelled) {
          setState((s) => ({ ...s, error: err as Error, loading: false }));
        }
      }
    };

    setState((s) => ({ ...s, loading: true }));
    run();

    const id =
      intervalMs > 0
        ? setInterval(() => {
            if (!document.hidden) run();
          }, intervalMs)
        : undefined;

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [intervalMs, tick, ...deps]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  return { ...state, refresh };
}
