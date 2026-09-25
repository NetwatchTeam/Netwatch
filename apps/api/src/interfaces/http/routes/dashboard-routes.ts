import { Router } from 'express';
import { z } from 'zod';
import type { AppContainer } from '../../../container.js';
import { toSummaryDto, toThroughputDto, toWeeklyReportDto } from '../presenters.js';

const weekSchema = z.object({
  /** N'importe quelle date de la semaine voulue ; par défaut, la semaine en cours. */
  week: z.coerce.date().optional(),
});

const throughputSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  deviceId: z.string().optional(),
});

const DAY_MS = 24 * 60 * 60 * 1000;

export function dashboardRoutes(container: AppContainer): Router {
  const router = Router();

  router.get('/summary', async (_req, res) => {
    res.json(toSummaryDto(await container.getNetworkSummary.execute()));
  });

  router.get('/reports/weekly', async (req, res) => {
    const { week } = weekSchema.parse(req.query);
    res.json(toWeeklyReportDto(await container.generateWeeklyReport.execute(week)));
  });

  router.get('/metrics/throughput', async (req, res) => {
    const { from, to, deviceId } = throughputSchema.parse(req.query);
    const end = to ?? new Date();
    const start = from ?? new Date(end.getTime() - 7 * DAY_MS);
    const samples = await container.getThroughputHistory.execute(start, end, deviceId);
    res.json(samples.map(toThroughputDto));
  });

  return router;
}
