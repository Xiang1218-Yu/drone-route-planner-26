import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { validateRoute } from './geometry.js';
import { deletePlan, getPlan, listPlans, savePlan } from './store.js';
import { DuplicateZoneIdError, InvalidZoneError } from './zones.js';
import type { RoutePlan } from './types.js';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'drone-route-planner-api' });
  });

  app.get('/api/plans', (_req, res) => {
    res.json({ plans: listPlans() });
  });

  app.get('/api/plans/:id', (req, res) => {
    const plan = getPlan(req.params.id);
    if (!plan) return res.status(404).json({ message: '找不到该航线方案' });
    return res.json({ plan });
  });

  app.post('/api/plans', (req: Request<unknown, unknown, Partial<RoutePlan>>, res: Response) => {
    const body = req.body;
    if (!body || !body.name || !body.canvas || !body.start || !body.end) {
      return res.status(400).json({ message: 'name、canvas、start、end 为必填字段' });
    }

    try {
      const plan = savePlan({
        id: body.id,
        createdAt: body.createdAt,
        name: String(body.name),
        canvas: body.canvas,
        start: body.start,
        end: body.end,
        waypoints: Array.isArray(body.waypoints) ? body.waypoints : [],
        noFlyZones: Array.isArray(body.noFlyZones) ? body.noFlyZones : []
      });

      return res.status(body.id ? 200 : 201).json({ plan, validation: validateRoute(plan) });
    } catch (error) {
      if (error instanceof DuplicateZoneIdError) {
        // 重复标识：明确拒绝，绝不静默合并
        return res.status(409).json({ message: error.message });
      }
      if (error instanceof InvalidZoneError) {
        return res.status(400).json({ message: error.message });
      }
      throw error;
    }
  });

  app.delete('/api/plans/:id', (req, res) => {
    if (!deletePlan(req.params.id)) return res.status(404).json({ message: '找不到该航线方案' });
    return res.status(204).send();
  });

  return app;
}
