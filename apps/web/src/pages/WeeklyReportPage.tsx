import { useState } from 'react';
import { api } from '../api/netwatch';
import { AsyncState } from '../components/AsyncState';
import { PageHeader } from '../components/PageHeader';
import { SeverityBadge } from '../components/Badges';
import { usePolling } from '../hooks/usePolling';
import { CATEGORY_LABELS, formatDate, formatMinutes, formatPercent } from '../utils/format';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Rapport destiné au gestionnaire : les pannes qui ont le plus coûté, en durée et en ampleur. */
export function WeeklyReportPage() {
  const [offset, setOffset] = useState(0);
  const week = new Date(Date.now() - offset * WEEK_MS).toISOString();
  const report = usePolling(() => api.getWeeklyReport(week), [week], 0);

  return (
    <>
      <PageHeader
        title="Rapport hebdomadaire"
        subtitle={
          report.data
            ? `Du ${formatDate(report.data.weekStart)} au ${formatDate(report.data.weekEnd)}`
            : undefined
        }
        actions={
          <div className="page-actions">
            <a
              className="btn btn-primary"
              href={api.weeklyReportPdfUrl(week)}
              download
              title="Rapport de la semaine affichée, avec les incidents les plus conséquents en tête"
            >
              Exporter en PDF
            </a>
            <button type="button" className="btn" onClick={() => setOffset((value) => value + 1)}>
              Semaine précédente
            </button>
            <button
              type="button"
              className="btn"
              disabled={offset === 0}
              onClick={() => setOffset((value) => Math.max(0, value - 1))}
            >
              Semaine suivante
            </button>
          </div>
        }
      />

      <AsyncState {...report} onRetry={report.refresh}>
        {(data) => (
          <>
            <section className="panel headline">
              <p>{data.headline}</p>
            </section>

            <section className="stat-grid">
              <div className="stat-card tone-neutral">
                <span className="stat-value">{formatPercent(data.availability)}</span>
                <span className="stat-label">Disponibilité du parc</span>
                {data.previousWeekAvailability !== null && (
                  <span className="stat-hint">
                    Semaine précédente : {formatPercent(data.previousWeekAvailability)}
                  </span>
                )}
              </div>
              <div className="stat-card tone-neutral">
                <span className="stat-value">{formatMinutes(data.totalDowntimeMinutes)}</span>
                <span className="stat-label">Indisponibilité cumulée</span>
              </div>
              <div className="stat-card tone-neutral">
                <span className="stat-value">
                  {data.devicesImpacted} / {data.devicesMonitored}
                </span>
                <span className="stat-label">Machines touchées</span>
              </div>
              <div className="stat-card tone-neutral">
                <span className="stat-value">{data.newDevices}</span>
                <span className="stat-label">Nouvelles machines détectées</span>
              </div>
            </section>

            <section className="panel">
              <h2>Pannes les plus longues</h2>
              {data.topOutagesByDowntime.length === 0 ? (
                <p className="muted">Aucune panne cette semaine.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Équipement</th>
                        <th>Indisponibilité</th>
                        <th>Nombre de pannes</th>
                        <th>Panne la plus longue</th>
                        <th>Disponibilité</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topOutagesByDowntime.map((outage) => (
                        <tr key={outage.deviceId}>
                          <td>
                            {outage.deviceName}
                            {outage.critical && <span className="tag">Critique</span>}
                          </td>
                          <td>{formatMinutes(outage.downtimeMinutes)}</td>
                          <td>{outage.outageCount}</td>
                          <td>{formatMinutes(outage.longestOutageMinutes)}</td>
                          <td>{formatPercent(outage.availability)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="panel">
              <h2>Coupures les plus étendues</h2>
              <p className="muted">
                Pannes survenues en même temps sur plusieurs machines : souvent le signe d’une cause
                commune (switch, alimentation, lien opérateur).
              </p>
              {data.topOutagesByImpact.length === 0 ? (
                <p className="muted">Aucune coupure simultanée.</p>
              ) : (
                <ul className="episode-list">
                  {data.topOutagesByImpact.map((episode) => (
                    <li key={episode.startedAt}>
                      <strong>{episode.devicesImpacted} machine(s)</strong> pendant{' '}
                      {formatMinutes(episode.durationMinutes)} — {formatDate(episode.startedAt)}
                      <span className="muted"> ({episode.deviceNames.join(', ')})</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className="two-columns">
              <section className="panel">
                <h2>Événements de la semaine</h2>
                <dl className="details">
                  {Object.entries(data.eventsByCategory).map(([category, count]) => (
                    <div key={category}>
                      <dt>{CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS]}</dt>
                      <dd>{count}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section className="panel">
                <h2>Points de sécurité à traiter</h2>
                {data.openSecurityFindings.length === 0 ? (
                  <p className="muted">Aucun point en attente.</p>
                ) : (
                  <ul className="finding-list">
                    {data.openSecurityFindings.map((finding) => (
                      <li key={`${finding.deviceName}-${finding.summary}`}>
                        <SeverityBadge severity={finding.severity} />
                        <span>{finding.summary}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
      </AsyncState>
    </>
  );
}
