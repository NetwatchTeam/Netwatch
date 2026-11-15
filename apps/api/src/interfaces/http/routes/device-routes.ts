import {
  DEVICE_DECISION_LIFECYCLES,
  DEVICE_KINDS,
  DEVICE_LIFECYCLES,
  DEVICE_REACHABILITIES,
} from '@netwatch/contracts';
import { Router } from 'express';
import { z } from 'zod';
import type { AppContainer } from '../../../container.js';
import { deviceNameIndex, toDeviceDecisionDto, toDeviceDto, toDeviceLinkDto, toEventDto } from '../presenters.js';

const querySchema = z.object({
  q: z.string().trim().min(1).optional(),
  kind: z.enum(DEVICE_KINDS).optional(),
  lifecycle: z.enum(DEVICE_LIFECYCLES).optional(),
  reachability: z.enum(DEVICE_REACHABILITIES).optional(),
});

/** Sans authentification, l'auteur est déclaré : il est obligatoire pour que chaque décision soit tracée. */
const author = z
  .string({ required_error: 'L’auteur de l’action est obligatoire' })
  .trim()
  .min(1, 'L’auteur de l’action est obligatoire')
  .max(80);

const classifySchema = z.object({
  kind: z.enum(DEVICE_KINDS),
  label: z.string().trim().max(120).nullish(),
  critical: z.boolean().optional(),
  lifecycle: z.enum(DEVICE_DECISION_LIFECYCLES).optional(),
  author,
});

const MAC_PATTERN = /^[0-9a-f]{2}([:-][0-9a-f]{2}){5}$/i;

const createSchema = z.object({
  ip: z
    .string({ required_error: 'L’adresse IP est obligatoire' })
    .trim()
    .ip({ version: 'v4', message: 'Adresse IPv4 invalide (ex. 192.168.1.20)' }),
  label: z
    .string({ required_error: 'Le nom est obligatoire' })
    .trim()
    .min(1, 'Le nom est obligatoire')
    .max(120),
  kind: z
    .enum(DEVICE_KINDS, { required_error: 'Le rôle est obligatoire' })
    .refine((kind) => kind !== 'unknown', 'Le rôle est obligatoire : choisir un type d’équipement'),
  critical: z.boolean({
    required_error: 'La criticité est obligatoire',
    invalid_type_error: 'La criticité est un booléen (true ou false)',
  }),
  // Champ vide du formulaire = pas de MAC.
  mac: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().regex(MAC_PATTERN, 'Adresse MAC invalide (ex. 3c:52:82:4a:10:10)').nullish(),
  ),
  author,
  mergeInto: z.string().trim().min(1).optional(),
});

export function deviceRoutes(container: AppContainer): Router {
  const router = Router();

  // Topologie validée, calculée sur tout le parc : la passerelle d'une machine peut être exclue par un filtre.
  const loadTopology = () => container.getTopology.execute();

  router.get('/devices', async (req, res) => {
    const query = querySchema.parse(req.query);
    const now = new Date();
    const [devices, openEvents, topology] = await Promise.all([
      container.listDevices.execute(query),
      container.listOpenEvents.execute(),
      loadTopology(),
    ]);

    const openCount = new Map<string, number>();
    for (const event of openEvents) {
      openCount.set(event.deviceId, (openCount.get(event.deviceId) ?? 0) + 1);
    }

    res.json(
      devices.map((device) =>
        toDeviceDto(device, openCount.get(device.id) ?? 0, now, topology.gatewayOf(device)),
      ),
    );
  });

  router.get('/devices/:id', async (req, res) => {
    const now = new Date();
    const [device, topology] = await Promise.all([container.getDevice.execute(req.params.id), loadTopology()]);
    const [events, decisions] = await Promise.all([
      container.listEvents.execute({ deviceId: device.id, limit: 100 }),
      container.listDeviceDecisions.execute(device.id),
    ]);
    const gateway = topology.gatewayOf(device);
    const names = deviceNameIndex(gateway ? [device, gateway] : [device]);

    res.json({
      device: toDeviceDto(
        device,
        events.filter((event) => event.status !== 'resolved').length,
        now,
        gateway,
      ),
      // Pour une passerelle : les machines qui en dépendent.
      dependents: topology.dependentsOf(device).map(toDeviceLinkDto),
      events: events.map((event) => toEventDto(event, names, now)),
      // Qui a ajouté, validé, ignoré ou exclu l'équipement, et quand.
      decisions: decisions.map(toDeviceDecisionDto),
    });
  });

  // Ajout manuel d'un équipement non détectable par scan ; 409 `duplicate_device` si l'IP ou la MAC est déjà connue.
  router.post('/devices', async (req, res) => {
    const input = createSchema.parse(req.body);
    const { device, created } = await container.createDevice.execute({
      ip: input.ip,
      label: input.label,
      kind: input.kind,
      critical: input.critical,
      mac: input.mac ?? null,
      author: input.author,
      ...(input.mergeInto ? { mergeInto: input.mergeInto } : {}),
    });
    res.status(created ? 201 : 200).json(toDeviceDto(device, 0, new Date()));
  });

  // « Tout valider » : chaque machine à valider entre au référentiel, une décision tracée par machine.
  router.post('/devices/validate-pending', async (req, res) => {
    const { author: decidedBy } = z.object({ author }).parse(req.body ?? {});
    const validated = await container.validateAllPending.execute(decidedBy);
    res.json({ validated: validated.length, devices: validated.map(toDeviceLinkDto) });
  });

  // Valider, ignorer ou exclure une machine détectée (ou corriger une fiche) : la décision est tracée.
  router.patch('/devices/:id', async (req, res) => {
    const { author: decidedBy, ...decision } = classifySchema.parse(req.body);
    const device = await container.classifyDevice.execute(req.params.id, decision, decidedBy);
    res.json(toDeviceDto(device, 0, new Date()));
  });

  return router;
}
