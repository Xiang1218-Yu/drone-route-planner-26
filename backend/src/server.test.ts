import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { app } from '../src/server.js';
import type { NoFlyZone, RoutePlan } from '../src/types.js';

const canvas = { width: 100, height: 70 };
const rect = (id: string, x = 20, y = 40): NoFlyZone => ({
  id,
  name: '矩形区',
  kind: 'rectangle',
  points: [{ x, y }, { x: x + 18, y }, { x: x + 18, y: y + 18 }, { x, y: y + 18 }],
  color: '#fb7185'
});
const triangle = (id: string): NoFlyZone => ({
  id,
  name: '三角多边形',
  kind: 'polygon',
  points: [{ x: 60, y: 10 }, { x: 80, y: 10 }, { x: 70, y: 30 }],
  color: '#38bdf8'
});

let server: Server;
let base: string;

before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

async function postPlan(body: unknown): Promise<{ status: number; json: any }> {
  const response = await fetch(`${base}/api/plans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const json = await response.json().catch(() => undefined);
  return { status: response.status, json };
}

const validBase = { name: '测试方案', canvas, start: { x: 5, y: 65 }, end: { x: 95, y: 5 }, waypoints: [] };

describe('POST /api/plans 禁飞区标识约束', () => {
  it('健康检查可用', async () => {
    const response = await fetch(`${base}/api/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, service: 'drone-route-planner-api' });
  });

  it('正常矩形方案可创建，风险校验返回 zoneId 与 zoneIndex', async () => {
    // 起终点连线穿过矩形 (20,40)-(38,58)，必然产生风险
    const { status, json } = await postPlan({ ...validBase, name: '矩形正常', noFlyZones: [rect('zone-rect')] });
    assert.equal(status, 201);
    assert.equal(json.plan.noFlyZones[0].id, 'zone-rect');
    const zoneIssues = json.validation.issues.filter((i: any) => i.type === 'no-fly-zone');
    assert.ok(zoneIssues.length > 0);
    assert.equal(zoneIssues[0].zoneId, 'zone-rect');
    assert.equal(zoneIssues[0].zoneIndex, 0);
  });

  it('正常多边形方案可创建', async () => {
    const { status, json } = await postPlan({ ...validBase, name: '多边形正常', noFlyZones: [triangle('zone-poly')] });
    assert.equal(status, 201);
    assert.equal(json.plan.noFlyZones[0].kind, 'polygon');
  });

  it('同一方案内两个几何不同但 id 相同的禁飞区被明确拒绝（不静默合并）', async () => {
    const { status, json } = await postPlan({
      ...validBase,
      name: '重复 id',
      noFlyZones: [rect('zone-x'), triangle('zone-x')]
    });
    assert.equal(status, 400);
    assert.match(json.message, /zone-x/);
    assert.match(json.message, /重复/);
  });

  it('被拒绝的方案不会出现在列表中', async () => {
    const response = await fetch(`${base}/api/plans`);
    const { plans } = await response.json();
    assert.ok(!plans.some((plan: RoutePlan) => plan.name === '重复 id'));
  });

  it('缺失 id 的禁飞区会被安全补全为唯一 UUID，而不是报错或合并', async () => {
    const { status, json } = await postPlan({
      ...validBase,
      name: '缺失 id',
      noFlyZones: [rect('' as string), triangle('missing-id')]
    });
    assert.equal(status, 201);
    const [first, second] = json.plan.noFlyZones;
    assert.ok(typeof first.id === 'string' && first.id.length > 0);
    assert.notEqual(first.id, '');
    assert.equal(second.id, 'missing-id');
    assert.notEqual(first.id, second.id);
    // 形状不同的两个区域都被保留
    assert.deepEqual(first.points.length, 4);
    assert.deepEqual(second.points.length, 3);
  });

  it('不同方案可以复用同一个禁飞区 id，二者独立保存、互不合并', async () => {
    const a = await postPlan({ ...validBase, name: '跨方案 A', noFlyZones: [rect('shared-zone')] });
    const b = await postPlan({ ...validBase, name: '跨方案 B', noFlyZones: [triangle('shared-zone')] });
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    assert.notEqual(a.json.plan.id, b.json.plan.id);
    assert.equal(a.json.plan.noFlyZones[0].id, 'shared-zone');
    assert.equal(b.json.plan.noFlyZones[0].id, 'shared-zone');
    assert.equal(a.json.plan.noFlyZones[0].kind, 'rectangle');
    assert.equal(b.json.plan.noFlyZones[0].kind, 'polygon');
  });

  it('带 id 更新已有方案成功（200），且更新时同样拒绝重复禁飞区 id', async () => {
    const created = await postPlan({ ...validBase, name: '待更新', noFlyZones: [rect('zone-u')] });
    const planId = created.json.plan.id;

    const updated = await postPlan({
      id: planId,
      ...validBase,
      name: '已更新',
      noFlyZones: [rect('zone-u'), triangle('zone-u-2')]
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.json.plan.id, planId);
    assert.equal(updated.json.plan.name, '已更新');
    assert.equal(updated.json.plan.createdAt, created.json.plan.createdAt);
    assert.equal(updated.json.plan.noFlyZones.length, 2);

    const rejected = await postPlan({
      id: planId,
      ...validBase,
      name: '重复更新',
      noFlyZones: [rect('dup'), triangle('dup')]
    });
    assert.equal(rejected.status, 400);

    // 更新被拒绝后，原方案保持上一次的合法状态
    const fetched = await fetch(`${base}/api/plans/${planId}`);
    const fresh = await fetched.json();
    assert.equal(fresh.plan.name, '已更新');
    assert.equal(fresh.plan.noFlyZones.length, 2);
  });

  it('形状不合法的禁飞区（少于 3 点）返回 400', async () => {
    const bad = { id: 'bad', name: '坏', kind: 'polygon', points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] };
    const { status } = await postPlan({ ...validBase, noFlyZones: [bad] });
    assert.equal(status, 400);
  });

  it('重新加载：GET 列表与详情返回一致的数据', async () => {
    const created = await postPlan({ ...validBase, name: '重载校验', noFlyZones: [rect('reload-id'), triangle('tri-2')] });
    const planId = created.json.plan.id;
    const list = await (await fetch(`${base}/api/plans`)).json();
    const listed = list.plans.find((plan: RoutePlan) => plan.id === planId);
    const detail = await (await fetch(`${base}/api/plans/${planId}`)).json();
    assert.deepEqual(listed, detail.plan);
    assert.equal(detail.plan.noFlyZones.length, 2);
  });
});
