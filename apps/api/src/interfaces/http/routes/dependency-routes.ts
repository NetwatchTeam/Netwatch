import { DEPENDENCY_STATUSES } from '@netwatch/contracts';
import { Router } from 'express';
import { z } from 'zod';
import type { AppContainer } from '../../../container.js';
import { toDependencyDto, toDependencyGraphDto } from '../presenters.js';

const listSchema = z.object({
  status: z.enum(DEPENDENCY_STATUSES).optional(),
  deviceId: z.string().min(1).optional(),
});

const createSchema = z.object({
  deviceId: z.string().min(1),
  dependsOnId: z.string().min(1),
});

const updateSchema = z
  .object({
    status: z.enum(DEPENDENCY_STATUSES).optional(),
    dependsOnId: z.string().min(1).optional(),
  })
  .refine((body) => body.status !== undefined || body.dependsOnId !== undefined, {
    message: 'Indiquer `status` ou `dependsOnId`',
  });

/** Contrôle humain du graphe utilisé par la corrélation des pannes. */
export function dependencyRoutes(container: AppContainer): Router {
  const router = Router();

  const devicesById = async () => new Map((await container.listDevices.execute()).map((d) => [d.id, d]));

  router.get('/dependencies', async (req, res) => {
    const { status, deviceId } = listSchema.parse(req.query);
    const { dependencies, issues, devices } = await container.listDependencies.execute();
    const graph = toDependencyGraphDto(dependencies, issues, devices);
    // Les compteurs et les incohérences portent toujours sur tout le graphe ; le filtre ne réduit que la liste.
    graph.dependencies = graph.dependencies.filter(
      (d) =>
        (!status || d.status === status) &&
        (!deviceId || d.device.id === deviceId || d.dependsOn.id === deviceId),
    );
    res.json(graph);
  });

  router.post('/dependencies', async (req, res) => {
    const dependency = await container.createDependency.execute(createSchema.parse(req.body));
    res.status(201).json(toDependencyDto(dependency, await devicesById()));
  });

  // Déclarée avant `/:id` pour ne pas être prise pour un identifiant.
  router.post('/dependencies/validate-suggestions', async (_req, res) => {
    res.json(await container.validateAllSuggestions.execute());
  });

  router.patch('/dependencies/:id', async (req, res) => {
    const dependency = await container.updateDependency.execute(req.params.id, updateSchema.parse(req.body));
    res.json(toDependencyDto(dependency, await devicesById()));
  });

  router.delete('/dependencies/:id', async (req, res) => {
    const { outcome, dependency } = await container.deleteDependency.execute(req.params.id);
    res.json({ outcome, dependency: toDependencyDto(dependency, await devicesById()) });
  });

  return router;
}
