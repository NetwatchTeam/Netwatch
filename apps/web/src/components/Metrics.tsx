import type { CertificateStatus, OpenPortDto } from '@netwatch/contracts';
import {
  CERTIFICATE_STATUS_LABELS,
  formatPercentValue,
  formatServices,
  usageTone,
  type Tone,
} from '../utils/format';

/** Valeur chiffrée colorée ; le texte porte toujours l'information, la couleur ne fait que la souligner. */
export function MetricValue({ text, tone, title }: { text: string; tone: Tone; title?: string }) {
  return (
    <span className={`metric metric-${tone}`} title={title}>
      {text}
    </span>
  );
}

/** Jauge d'occupation (CPU, mémoire, disque) avec sa valeur en clair. */
export function UsageBar({ percent, label }: { percent: number | null; label: string }) {
  if (percent === null) return <span className="muted">Non mesuré</span>;

  const tone = usageTone(percent);
  return (
    <div className="usage">
      <div
        className="usage-track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className={`usage-fill fill-${tone}`} style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
      <MetricValue text={formatPercentValue(percent)} tone={tone} />
    </div>
  );
}

const CERTIFICATE_TONES: Record<CertificateStatus, Tone> = {
  valid: 'good',
  invalid: 'critical',
  expired: 'critical',
  unverified: 'neutral',
};

export function CertificateStatusBadge({ status }: { status: CertificateStatus }) {
  return <span className={`badge cert-${CERTIFICATE_TONES[status]}`}>{CERTIFICATE_STATUS_LABELS[status]}</span>;
}

/** Ports ouverts sous forme de pastilles, avec le service en info-bulle. */
export function PortChips({ ports }: { ports: OpenPortDto[] }) {
  if (ports.length === 0) return <>—</>;
  return (
    <>
      {ports.map((entry) => (
        <span key={`${entry.protocol}-${entry.port}`} className="port" title={formatServices(entry)}>
          {entry.port}
          {entry.protocol === 'udp' ? '/udp' : ''}
          {entry.services[0] ? ` · ${entry.services[0].name}` : ''}
        </span>
      ))}
    </>
  );
}
