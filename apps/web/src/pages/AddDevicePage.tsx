import {
  DEVICE_KINDS,
  type CreateDeviceInput,
  type DeviceKind,
  type DuplicateDeviceDetails,
} from '@netwatch/contracts';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiError } from '../api/client';
import { api } from '../api/netwatch';
import { AuthorField } from '../components/AuthorField';
import { LifecycleBadge } from '../components/Badges';
import { PageHeader } from '../components/PageHeader';
import { useAuthor } from '../hooks/useAuthor';
import { KIND_LABELS, LIFECYCLE_LABELS } from '../utils/format';

const SELECTABLE_KINDS = DEVICE_KINDS.filter((kind) => kind !== 'unknown');

/** Erreurs de validation renvoyées par l'API (400), champ par champ. */
function fieldErrors(error: unknown): Array<{ path: string; message: string }> {
  if (!(error instanceof ApiError) || error.code !== 'bad_request' || !Array.isArray(error.details)) return [];
  return error.details as Array<{ path: string; message: string }>;
}

const FIELD_NAMES: Record<string, string> = {
  ip: 'Adresse IP',
  label: 'Nom',
  kind: 'Rôle',
  critical: 'Criticité',
  mac: 'Adresse MAC',
  author: 'Votre nom',
};

/**
 * Ajout manuel d'un équipement que le collecteur ne détecte pas (hors du sous-réseau scanné,
 * ne répondant pas à la découverte…). Il entre directement au référentiel et sera sondé à chaque scan.
 * Un équipement déjà connu à la même IP ou la même MAC n'est pas dédoublé : on propose de fusionner.
 */
export function AddDevicePage() {
  const navigate = useNavigate();
  const [ip, setIp] = useState('');
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<DeviceKind | ''>('');
  const [critical, setCritical] = useState<'' | 'yes' | 'no'>('');
  const [mac, setMac] = useState('');
  const [author, setAuthor] = useAuthor();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [duplicate, setDuplicate] = useState<DuplicateDeviceDetails | null>(null);

  const input = (): CreateDeviceInput => ({
    ip: ip.trim(),
    label: label.trim(),
    kind: kind as DeviceKind,
    critical: critical === 'yes',
    mac: mac.trim() || null,
    author: author.trim(),
  });

  const send = async (payload: CreateDeviceInput) => {
    setSubmitting(true);
    setError(null);
    try {
      const device = await api.createDevice(payload);
      navigate(`/technique/equipements/${device.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'duplicate_device') {
        setDuplicate(err.details as DuplicateDeviceDetails);
      } else {
        setError(err);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setDuplicate(null);
    void send(input());
  };

  const errors = fieldErrors(error);

  return (
    <>
      <Link to="/technique/equipements" className="back-link">
        ← Retour aux équipements
      </Link>

      <PageHeader
        title="Ajouter un équipement"
        subtitle="Pour un équipement que le collecteur ne détecte pas : il sera sondé à chaque scan et supervisé comme les autres"
      />

      <section className="panel">
        <form className="classify-form" onSubmit={submit}>
          <label>
            Adresse IP *
            <input
              value={ip}
              onChange={(event) => setIp(event.target.value)}
              placeholder="192.168.1.20"
              required
              inputMode="decimal"
              className="mono"
            />
          </label>

          <label>
            Nom *
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Automate de production"
              maxLength={120}
              required
            />
          </label>

          <label>
            Rôle *
            <select value={kind} onChange={(event) => setKind(event.target.value as DeviceKind)} required>
              <option value="" disabled>
                Choisir…
              </option>
              {SELECTABLE_KINDS.map((value) => (
                <option key={value} value={value}>
                  {KIND_LABELS[value]}
                </option>
              ))}
            </select>
          </label>

          <label>
            Criticité *
            <select value={critical} onChange={(event) => setCritical(event.target.value as 'yes' | 'no')} required>
              <option value="" disabled>
                Choisir…
              </option>
              <option value="yes">Critique pour l’activité</option>
              <option value="no">Non critique</option>
            </select>
          </label>

          <label>
            Adresse MAC
            <input
              value={mac}
              onChange={(event) => setMac(event.target.value)}
              placeholder="facultative — 3c:52:82:4a:10:10"
              className="mono"
            />
            <span className="field-hint">Si elle est connue, elle évite les doublons quand l’IP change.</span>
          </label>

          <AuthorField value={author} onChange={setAuthor} />

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Enregistrement…' : 'Ajouter au référentiel'}
            </button>
          </div>

          {error !== null && (
            <div className="error-box" role="alert">
              {errors.length > 0 ? (
                <ul>
                  {errors.map((item) => (
                    <li key={`${item.path}-${item.message}`}>
                      {FIELD_NAMES[item.path] ?? item.path} : {item.message}
                    </li>
                  ))}
                </ul>
              ) : (
                (error as Error).message
              )}
            </div>
          )}
        </form>
      </section>

      {duplicate && (
        <section className="panel duplicate-panel" role="alert">
          <h2>Cet équipement est déjà connu</h2>
          <p>
            {duplicate.matchedOn.length === 2
              ? 'Même adresse IP et même adresse MAC'
              : duplicate.matchedOn[0] === 'mac'
                ? 'Même adresse MAC'
                : 'Même adresse IP'}{' '}
            que <strong>{duplicate.existing.name}</strong> ({duplicate.existing.ip}
            {duplicate.existing.mac ? `, ${duplicate.existing.mac}` : ''}),{' '}
            <LifecycleBadge lifecycle={duplicate.existing.lifecycle} />.
          </p>
          <p className="muted">
            Fusionner complète sa fiche avec le nom, le rôle et la criticité saisis, et le passe à l’état «{' '}
            {LIFECYCLE_LABELS.active} ». Ce que le collecteur a observé (MAC, nom réseau, mesures) est conservé.
          </p>
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={submitting || !author.trim()}
              onClick={() => void send({ ...input(), mergeInto: duplicate.existing.id })}
            >
              Fusionner avec cet équipement
            </button>
            <Link className="btn" to={`/technique/equipements/${duplicate.existing.id}`}>
              Voir sa fiche
            </Link>
          </div>
        </section>
      )}
    </>
  );
}
