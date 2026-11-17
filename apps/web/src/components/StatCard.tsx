import { Link } from 'react-router';

interface StatCardProps {
  label: string;
  value: number | string;
  hint?: string;
  tone?: 'neutral' | 'good' | 'warning' | 'critical';
  to?: string;
}

export function StatCard({ label, value, hint, tone = 'neutral', to }: StatCardProps) {
  const body = (
    <>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </>
  );

  return to ? (
    <Link to={to} className={`stat-card tone-${tone}`}>
      {body}
    </Link>
  ) : (
    <div className={`stat-card tone-${tone}`}>{body}</div>
  );
}
