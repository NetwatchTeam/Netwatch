import type { ThroughputPointDto } from '@netwatch/contracts';
import { useMemo, useState } from 'react';
import { formatDateTime, formatMbps } from '../utils/format';

interface ThroughputChartProps {
  points: ThroughputPointDto[];
  /** Hauteur du tracé, hors marges. */
  height?: number;
}

const WIDTH = 720;
const PADDING = { top: 16, right: 16, bottom: 28, left: 52 };

/**
 * Évolution du débit moyen. Une seule série : pas de légende, le titre de la
 * section nomme la mesure. Le survol donne la valeur exacte, et un tableau
 * replié offre la même information sans couleur ni survol.
 */
export function ThroughputChart({ points, height = 180 }: ThroughputChartProps) {
  const [hover, setHover] = useState<number | null>(null);

  const series = useMemo(() => {
    const sorted = [...points].sort(
      (a, b) => new Date(a.measuredAt).getTime() - new Date(b.measuredAt).getTime(),
    );
    // Une mesure par créneau de 15 minutes : la tendance prime sur le détail.
    const buckets = new Map<number, { sum: number; count: number }>();
    for (const point of sorted) {
      const slot = Math.floor(new Date(point.measuredAt).getTime() / 900_000) * 900_000;
      const bucket = buckets.get(slot) ?? { sum: 0, count: 0 };
      bucket.sum += point.mbps;
      bucket.count += 1;
      buckets.set(slot, bucket);
    }
    return [...buckets.entries()].map(([time, bucket]) => ({
      time,
      mbps: bucket.sum / bucket.count,
    }));
  }, [points]);

  if (series.length < 2) {
    return <p className="muted">Pas encore assez de mesures pour tracer une tendance.</p>;
  }

  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = height - PADDING.top - PADDING.bottom;
  const times = series.map((point) => point.time);
  const values = series.map((point) => point.mbps);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const maxValue = Math.max(...values) * 1.1;

  const x = (time: number) =>
    PADDING.left + ((time - minTime) / Math.max(1, maxTime - minTime)) * plotWidth;
  const y = (value: number) => PADDING.top + plotHeight - (value / Math.max(1, maxValue)) * plotHeight;

  const line = series.map((point) => `${x(point.time)},${y(point.mbps)}`).join(' ');
  const area = `${PADDING.left},${PADDING.top + plotHeight} ${line} ${PADDING.left + plotWidth},${PADDING.top + plotHeight}`;
  const ticks = [0, maxValue / 2, maxValue];
  const active = hover === null ? null : series[hover];

  return (
    <figure className="chart">
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="chart-svg"
        role="img"
        aria-label={`Débit moyen mesuré entre le ${formatDateTime(new Date(minTime).toISOString())} et le ${formatDateTime(new Date(maxTime).toISOString())}`}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PADDING.left}
              x2={PADDING.left + plotWidth}
              y1={y(tick)}
              y2={y(tick)}
              className="chart-grid"
            />
            <text x={PADDING.left - 8} y={y(tick) + 4} className="chart-axis" textAnchor="end">
              {Math.round(tick)}
            </text>
          </g>
        ))}

        <polygon points={area} className="chart-area" />
        <polyline points={line} className="chart-line" />

        {active && (
          <g>
            <line
              x1={x(active.time)}
              x2={x(active.time)}
              y1={PADDING.top}
              y2={PADDING.top + plotHeight}
              className="chart-crosshair"
            />
            <circle cx={x(active.time)} cy={y(active.mbps)} r={5} className="chart-point" />
          </g>
        )}

        {/* Zones de survol larges : viser un point d'une courbe est autrement pénible. */}
        {series.map((point, index) => (
          <rect
            key={point.time}
            x={x(point.time) - plotWidth / series.length / 2}
            y={PADDING.top}
            width={plotWidth / series.length}
            height={plotHeight}
            fill="transparent"
            onMouseEnter={() => setHover(index)}
          />
        ))}

        <text x={PADDING.left} y={height - 8} className="chart-axis">
          {formatDateTime(new Date(minTime).toISOString())}
        </text>
        <text x={PADDING.left + plotWidth} y={height - 8} className="chart-axis" textAnchor="end">
          {formatDateTime(new Date(maxTime).toISOString())}
        </text>
      </svg>

      <figcaption className="chart-caption">
        {active
          ? `${formatDateTime(new Date(active.time).toISOString())} — ${formatMbps(active.mbps)}`
          : 'Débit moyen mesuré entre les machines, en Mbit/s. Survolez la courbe pour lire une valeur.'}
      </figcaption>

      <details className="chart-table">
        <summary>Voir les mesures sous forme de tableau</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Horodatage</th>
                <th>Débit moyen</th>
              </tr>
            </thead>
            <tbody>
              {series.map((point) => (
                <tr key={point.time}>
                  <td>{formatDateTime(new Date(point.time).toISOString())}</td>
                  <td>{formatMbps(point.mbps)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
