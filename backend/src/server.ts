import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { pathToFileURL } from 'node:url';
import { validateRoute } from './geometry.js';
import { PlanValidationError, normalizeZones } from './identity.js';
import { deletePlan, getPlan, listPlans, savePlan } from './store.js';
import type { RoutePlan } from './types.js';

const app = express();
const port = Number(process.env.PORT ?? 4000);

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

  let noFlyZones;
  try {
    // 拒绝同一方案内重复的禁飞区 id，并为缺失 id 的区域补全标识。
    noFlyZones = normalizeZones(body.noFlyZones);
  } catch (error) {
    if (error instanceof PlanValidationError) {
      return res.status(400).json({ message: error.message });
    }
    throw error;
  }

  const plan = savePlan({
    id: body.id,
    createdAt: body.createdAt,
    name: String(body.name),
    canvas: body.canvas,
    start: body.start,
    end: body.end,
    waypoints: Array.isArray(body.waypoints) ? body.waypoints : [],
    noFlyZones
  });

  return res.status(body.id ? 200 : 201).json({ plan, validation: validateRoute(plan) });
});

app.delete('/api/plans/:id', (req, res) => {
  if (!deletePlan(req.params.id)) return res.status(404).json({ message: '找不到该航线方案' });
  return res.status(204).send();
});

// 仅在直接运行本文件时监听端口，便于测试用例 import 复用 app 而不占端口。
const isDirectRun = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isDirectRun) {
  app.listen(port, () => {
    console.log(`Drone Route Planner API listening on http://localhost:${port}`);
  });
}

export { app };
