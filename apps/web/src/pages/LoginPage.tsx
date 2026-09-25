import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';

export function LoginPage() {
  const { login } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={(event) => void submit(event)}>
        <h1>NetWatch</h1>
        <p className="muted">Supervision du réseau de votre entreprise</p>

        <label>
          Mot de passe d’accès
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoFocus
            required
          />
        </label>

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Connexion…' : 'Se connecter'}
        </button>

        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
