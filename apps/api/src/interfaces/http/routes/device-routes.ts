import { DEVICE_KINDS, DEVICE_LIFECYCLES, DEVICE_REACHABILITIES } from '@netwatch/contracts';
import { Router } from 'express';
import { z } from 'zod';
import type { AppContainer } from '../../../container.js';
import { deviceNameIndex, toDeviceDto, toEventDto } from '../presenters.js';

const querySchema = z.object({
  q: z.string().trim().min(1).optional(),
  kind: z.enum(DEVICE_KINDS).optional(),
  lifecycle: z.enum(DEVICE_LIFECYCLES).optional(),
  reachability: z.enum(DEVICE_REACHABILITIES).optional(),
});

const classifySchema = z.object({
  kind: z.enum(DEVICE_KINDS),
  label: z.string().trim().max(120).nullish(),
  critical: z.boolean().optional(),
  lifecycle: z.enum(['active', 'ignored']).optional(),
});

export function deviceRoutes(container: AppContainer): Router {
  const router = Router();

  router.get('/devices', async (req, res) => {
    const query = querySchema.parse(req.query);
    const now = new Date();
    const [devices, openEvents] = await Promise.all([
      container.listDevices.execute(query),
      container.listOpenEvents.execute(),
    ]);

    const openCount = new Map<string, number>();
    for (const event of openEvents) {
      openCount.set(event.deviceId, (openCount.get(event.deviceId) ?? 0) + 1);
    }

    res.json(devices.map((device) => toDeviceDto(device, openCount.get(device.id) ?? 0, now)));
  });

  router.get('/devices/:id', async (req, res) => {
    const now = new Date();
    const device = await container.getDevice.execute(req.params.id);
    const events = await container.listEvents.execute({ deviceId: device.id, limit: 100 });
    const names = deviceNameIndex([device]);

    res.json({
      device: toDeviceDto(device, events.filter((event) => event.status !== 'resolved').length, now),
      events: events.map((event) => toEventDto(event, names, now)),
    });
  });

  // Classer une machine détectée : c'est l'action qui la sort de la file d'attente.
  router.patch('/devices/:id', async (req, res) => {
    const decision = classifySchema.parse(req.body);
    const device = await container.classifyDevice.execute(req.params.id, decision);
    res.json(toDeviceDto(device, 0, new Date()));
  });

  return router;
}
