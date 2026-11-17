import type { ReactNode } from 'react';

interface AsyncStateProps<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  onRetry?: () => void;
  children: (data: T) => ReactNode;
}

/** Les données déjà affichées restent visibles pendant un rafraîchissement ou une erreur passagère. */
export function AsyncState<T>({ data, error, loading, onRetry, children }: AsyncStateProps<T>) {
  if (data === null) {
    if (error) return <ErrorBox error={error} onRetry={onRetry} />;
    if (loading) return <p className="muted">Chargement…</p>;
    return null;
  }

  return (
    <>
      {error && <ErrorBox error={error} onRetry={onRetry} />}
      {children(data)}
    </>
  );
}

export function ErrorBox({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div className="error-box" role="alert">
      <span>{error.message}</span>
      {onRetry && (
        <button type="button" className="btn btn-small" onClick={onRetry}>
          Réessayer
        </button>
      )}
    </div>
  );
}
