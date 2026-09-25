import type { MonitoringSettingsDto } from '@netwatch/contracts';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api/netwatch';
import { AsyncState, ErrorBox } from '../components/AsyncState';
import { PageHeader } from '../components/PageHeader';
import { usePolling } from '../hooks/usePolling';

interface NumberFieldProps {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}

function NumberField({ label, hint, value, min, max, step = 1, onChange }: NumberFieldProps) {
  return (
    <label className="setting">
      <span className="setting-label">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="muted">{hint}</span>
    </label>
  );
}

/** Seuils métier : c'est ce qui rend le produit adaptable d'un client à l'autre. */
export function SettingsPage() {
  const settings = usePolling(() => api.getSettings(), [], 0);
  const [draft, setDraft] = useState<MonitoringSettingsDto | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (settings.data) setDraft(settings.data);
  }, [settings.data]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await api.updateSettings(draft);
      setSaved(true);
    } catch (err) {
      setError(err as Error);
    } finally {
      setSaving(false);
    }
  };

  const update = <K extends keyof MonitoringSettingsDto>(key: K, value: MonitoringSettingsDto[K]) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
    setSaved(false);
  };

  return (
    <>
      <PageHeader title="Réglages" subtitle="Seuils de surveillance appliqués par l'API" />

      {error && <ErrorBox error={error} />}

      <AsyncState {...settings} onRetry={settings.refresh}>
        {() =>
          draft === null ? null : (
            <form className="panel settings-form" onSubmit={(event) => void submit(event)}>
              <NumberField
                label="Intervalle entre deux scans"
                hint="En minutes. 5 par défaut."
                value={draft.scanIntervalMinutes}
                min={1}
                max={1440}
                onChange={(value) => update('scanIntervalMinutes', value)}
              />
              <NumberField
                label="Scans sans réponse avant panne"
                hint="Évite de déclarer une panne sur un scan raté isolé."
                value={draft.missedScansBeforeIncident}
                min={1}
                max={10}
                onChange={(value) => update('missedScansBeforeIncident', value)}
              />
              <NumberField
                label="Préavis d’expiration des certificats"
                hint="En jours avant l'échéance. 30 par défaut."
                value={draft.tlsWarningDays}
                min={1}
                max={365}
                onChange={(value) => update('tlsWarningDays', value)}
              />
              <NumberField
                label="Baisse de débit signalée"
                hint="En % sous le débit habituel du trajet."
                value={draft.throughputDropPercent}
                min={1}
                max={99}
                onChange={(value) => update('throughputDropPercent', value)}
              />
              <NumberField
                label="Débit plancher"
                hint="En Mbit/s : toute mesure en dessous est signalée."
                value={draft.throughputFloorMbps}
                min={0}
                max={100_000}
                onChange={(value) => update('throughputFloorMbps', value)}
              />
              <NumberField
                label="Conservation des données"
                hint="En jours. Au-delà, mesures et événements résolus sont supprimés."
                value={draft.retentionDays}
                min={7}
                max={3650}
                onChange={(value) => update('retentionDays', value)}
              />

              <label className="setting setting-wide">
                <span className="setting-label">Ports sensibles surveillés</span>
                <input
                  value={draft.watchedPorts.join(', ')}
                  onChange={(event) =>
                    update(
                      'watchedPorts',
                      event.target.value
                        .split(',')
                        .map((port) => Number(port.trim()))
                        .filter((port) => Number.isInteger(port) && port >= 0 && port <= 65_535),
                    )
                  }
                />
                <span className="muted">
                  Séparés par des virgules. Un signalement est ouvert si l’un d’eux est ouvert sur une
                  machine.
                </span>
              </label>

              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
                {saved && <span className="muted">Réglages enregistrés.</span>}
              </div>
            </form>
          )
        }
      </AsyncState>
    </>
  );
}
