import { EVENT_CATEGORIES, EVENT_STATUSES } from '@netwatch/contracts';
import { Router } from 'express';
import { z } from 'zod';
import type { AppContainer } from '../../../container.js';
import { deviceNameIndex, toEventDto } from '../presenters.js';

const querySchema = z.object({
  category: z.enum(EVENT_CATEGORIES).optional(),
  status: z.enum(EVENT_STATUSES).optional(),
  deviceId: z.string().optional(),
  since: z.coerce.date().optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});

export function eventRoutes(container: AppContainer): Router {
  const router = Router();

  router.get('/events', async (req, res) => {
    const query = querySchema.parse(req.query);
    const now = new Date();
    const [events, devices] = await Promise.all([
      container.listEvents.execute(query),
      container.listDevices.execute(),
    ]);
    const names = deviceNameIndex(devices);
    res.json(events.map((event) => toEventDto(event, names, now)));
  });

  router.post('/events/:id/acknowledge', async (req, res) => {
    const event = await container.acknowledgeEvent.execute(req.params.id);
    const devices = await container.listDevices.execute();
    res.json(toEventDto(event, deviceNameIndex(devices), new Date()));
  });

  // Retirer la prise en charge : supprimer l'acquittement.
  router.delete('/events/:id/acknowledge', async (req, res) => {
    const event = await container.releaseEvent.execute(req.params.id);
    const devices = await container.listDevices.execute();
    res.json(toEventDto(event, deviceNameIndex(devices), new Date()));
  });

  return router;
}
