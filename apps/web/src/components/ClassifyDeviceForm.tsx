import { DEVICE_KINDS, type ClassifyDeviceInput, type DeviceDto } from '@netwatch/contracts';
import { useState, type FormEvent } from 'react';
import { KIND_LABELS } from '../utils/format';

interface ClassifyDeviceFormProps {
  device: DeviceDto;
  onSubmit: (input: ClassifyDeviceInput) => Promise<void>;
}

const SELECTABLE_KINDS = DEVICE_KINDS.filter((kind) => kind !== 'unknown');

/**
 * Déclarer ce qu'est une machine détectée : c'est la seule action qui la fait
 * sortir de la file d'attente et entrer dans la supervision.
 */
export function ClassifyDeviceForm({ device, onSubmit }: ClassifyDeviceFormProps) {
  const [kind, setKind] = useState(device.kind === 'unknown' ? 'workstation' : device.kind);
  const [label, setLabel] = useState(device.label ?? device.hostname ?? '');
  const [critical, setCritical] = useState(device.critical);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent, lifecycle: 'active' | 'ignored') => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ kind, label: label.trim() || null, critical, lifecycle });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="classify-form" onSubmit={(event) => void submit(event, 'active')}>
      <label>
        Type d’équipement
        <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
          {SELECTABLE_KINDS.map((value) => (
            <option key={value} value={value}>
              {KIND_LABELS[value]}
            </option>
          ))}
        </select>
      </label>

      <label>
        Nom métier
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Serveur comptabilité"
          maxLength={120}
        />
      </label>

      <label className="checkbox">
        <input type="checkbox" checked={critical} onChange={(event) => setCritical(event.target.checked)} />
        Équipement critique pour l’activité
      </label>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button
          type="button"
          className="btn"
          disabled={submitting}
          onClick={(event) => void submit(event, 'ignored')}
        >
          Ignorer cette machine
        </button>
      </div>

      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
