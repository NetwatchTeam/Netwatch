import { Link } from 'react-router';
import { api } from '../api/netwatch';
import { AsyncState } from '../components/AsyncState';
import { EventList } from '../components/EventList';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';
import { ThroughputChart } from '../components/ThroughputChart';
import { usePolling } from '../hooks/usePolling';
import { formatMbps, formatPercent, formatRelative } from '../utils/format';

const HEALTH_MESSAGES = {
  good: 'Tout fonctionne normalement.',
  attention: 'Le réseau fonctionne, mais des points demandent votre attention.',
  critical: 'Une panne est en cours sur votre réseau.',
} as const;

/** Page d'accueil du gestionnaire : l'essentiel sans vocabulaire technique. */
export function OverviewPage() {
  const summary = usePolling(() => api.getSummary());
  const incidents = usePolling(() => api.getEvents({ category: 'incident', status: 'open' }));
  const throughput = usePolling(() => api.getThroughput(), [], 60_000);

  return (
    <>
      <PageHeader
        title="Vue d'ensemble"
        subtitle={
          summary.data
            ? `Dernière vérification ${formatRelative(summary.data.lastScanAt)}`
            : undefined
        }
      />

      <AsyncState {...summary} onRetry={summary.refresh}>
        {(data) => (
          <>
            <section className={`health-banner health-${data.health}`}>
              <strong>{HEALTH_MESSAGES[data.health]}</strong>
              {data.scannerStale && (
                <span>
                  Attention : le scanner n’a pas envoyé de résultat récemment, les informations
                  ci-dessous datent de {formatRelative(data.lastScanAt)}.
                </span>
              )}
            </section>

            <section className="stat-grid">
              <StatCard
                label="Équipements suivis"
                value={data.devices.total}
                to="/technique/equipements"
              />
              <StatCard
                label="En panne"
                value={data.devices.down}
                tone={data.devices.down > 0 ? 'critical' : 'good'}
                to="/technique/equipements?reachability=down"
              />
              <StatCard
                label="Injoignables"
                value={data.devices.unreachable}
                hint="Coupées du réseau par une passerelle en panne"
                tone={data.devices.unreachable > 0 ? 'warning' : 'good'}
                to="/technique/equipements?reachability=unreachable"
              />
              <StatCard
                label="Disponibilité (7 jours)"
                value={formatPercent(data.availability7d)}
                hint="Temps pendant lequel les machines ont répondu"
                tone={data.availability7d > 0.99 ? 'good' : 'warning'}
              />
              <StatCard
                label="Débit moyen (24 h)"
                value={formatMbps(data.averageThroughputMbps)}
                hint="Vitesse de transfert entre machines"
              />
              <StatCard
                label="Points de sécurité"
                value={data.openEvents.signalement}
                tone={data.openEvents.signalement > 0 ? 'warning' : 'good'}
                to="/technique/evenements?category=signalement"
              />
              <StatCard
                label="Machines à identifier"
                value={data.devices.pendingClassification}
                tone={data.devices.pendingClassification > 0 ? 'warning' : 'good'}
                to="/technique/a-identifier"
              />
            </section>
          </>
        )}
      </AsyncState>

      <section className="panel">
        <div className="panel-header">
          <h2>Pannes en cours</h2>
          <Link to="/technique/evenements">Tout l’historique</Link>
        </div>
        <AsyncState {...incidents} onRetry={incidents.refresh}>
          {(events) => <EventList events={events} />}
        </AsyncState>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Évolution de la vitesse du réseau</h2>
          <Link to="/rapport">Rapport hebdomadaire</Link>
        </div>
        <AsyncState {...throughput} onRetry={throughput.refresh}>
          {(points) => <ThroughputChart points={points} />}
        </AsyncState>
      </section>
    </>
  );
}
