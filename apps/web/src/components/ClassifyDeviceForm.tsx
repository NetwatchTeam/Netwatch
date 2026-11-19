import {
  DEVICE_KINDS,
  type ClassifyDeviceInput,
  type DeviceDecisionLifecycle,
  type DeviceDto,
} from '@netwatch/contracts';
import { useState, type FormEvent } from 'react';
import { useAuthor } from '../hooks/useAuthor';
import { KIND_LABELS } from '../utils/format';
import { AuthorField } from './AuthorField';

interface ClassifyDeviceFormProps {
  device: DeviceDto;
  onSubmit: (input: ClassifyDeviceInput) => Promise<void>;
}

const SELECTABLE_KINDS = DEVICE_KINDS.filter((kind) => kind !== 'unknown');

/** Ce que chaque décision change : expliqué une fois en tête de la page « À valider ». */
export const DECISION_HELP: Record<DeviceDecisionLifecycle, string> = {
  active: 'Valider : l’équipement entre au référentiel et il est supervisé (pannes, alertes, rapports).',
  ignored: 'Ignorer : il reste visible dans le parc, sans supervision ni alerte. Il ne sera plus proposé.',
  excluded: 'Exclure : il ne fait pas partie du parc (appareil de passage, autre réseau). Masqué, il ne sera plus proposé.',
};

/**
 * Décider du sort d'un équipement : le valider, l'ignorer ou l'exclure. Sur une machine à valider,
 * c'est la seule action qui la fait sortir de la file d'attente ; ailleurs, elle corrige la fiche
 * ou change d'avis. Chaque décision est enregistrée avec son auteur.
 */
export function ClassifyDeviceForm({ device, onSubmit }: ClassifyDeviceFormProps) {
  const [kind, setKind] = useState(device.kind === 'unknown' ? 'workstation' : device.kind);
  const [label, setLabel] = useState(device.label ?? device.hostname ?? '');
  const [critical, setCritical] = useState(device.critical);
  const [author, setAuthor] = useAuthor();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pending = device.lifecycle === 'pending_classification';
  // Sur une fiche déjà décidée, le bouton principal enregistre sans changer d'état.
  const current: DeviceDecisionLifecycle = pending ? 'active' : (device.lifecycle as DeviceDecisionLifecycle);

  const submit = async (event: FormEvent, lifecycle: DeviceDecisionLifecycle) => {
    event.preventDefault();
    if (!author.trim()) {
      setError('Indiquez votre nom : chaque décision est tracée avec son auteur.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ kind, label: label.trim() || null, critical, lifecycle, author: author.trim() });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const otherDecisions = (['active', 'ignored', 'excluded'] as const).filter((value) => value !== current);
  const BUTTON_LABELS: Record<DeviceDecisionLifecycle, string> = {
    active: pending ? 'Valider' : 'Réintégrer au référentiel',
    ignored: 'Ignorer',
    excluded: 'Exclure du parc',
  };

  return (
    <form className="classify-form" onSubmit={(event) => void submit(event, current)}>
      <label>
        Rôle de l’équipement
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

      <AuthorField value={author} onChange={setAuthor} />

      <label className="checkbox">
        <input type="checkbox" checked={critical} onChange={(event) => setCritical(event.target.checked)} />
        Équipement critique pour l’activité
      </label>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Enregistrement…' : pending ? 'Valider' : 'Enregistrer'}
        </button>
        {otherDecisions.map((value) => (
          <button
            key={value}
            type="button"
            className="btn"
            disabled={submitting}
            onClick={(event) => void submit(event, value)}
          >
            {BUTTON_LABELS[value]}
          </button>
        ))}
      </div>

      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
