import { Router } from 'express';
import { z } from 'zod';
import type { AppContainer } from '../../../container.js';
import { toScanRunDto, toSettingsDto } from '../presenters.js';

const settingsSchema = z
  .object({
    scanIntervalMinutes: z.number().int().min(1).max(1440),
    missedScansBeforeIncident: z.number().int().min(1).max(10),
    tlsWarningDays: z.number().int().min(1).max(365),
    watchedPorts: z.array(z.number().int().min(0).max(65_535)).max(100),
    throughputDropPercent: z.number().min(1).max(99),
    throughputFloorMbps: z.number().min(0).max(100_000),
    packetLossWarningPercent: z.number().min(0.1).max(100),
    cpuWarningPercent: z.number().min(1).max(100),
    memoryWarningPercent: z.number().min(1).max(100),
    diskWarningPercent: z.number().min(1).max(100),
    retentionDays: z.number().int().min(7).max(3650),
  })
  .partial();

export function operationsRoutes(container: AppContainer): Router {
  const router = Router();

  router.get('/scans', async (_req, res) => {
    const runs = await container.listScanRuns.execute(20);
    res.json(runs.map(toScanRunDto));
  });

  // Interrogation immédiate, en plus du rythme automatique.
  router.post('/scans/run', async (_req, res) => {
    const run = await container.runScan.execute();
    res.status(202).json(toScanRunDto(run));
  });

  router.get('/settings', async (_req, res) => {
    res.json(toSettingsDto(await container.getSettings.execute()));
  });

  router.put('/settings', async (req, res) => {
    const patch = settingsSchema.parse(req.body);
    res.json(toSettingsDto(await container.updateSettings.execute(patch)));
  });

  return router;
}
