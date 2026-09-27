import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import type { RoutePlan } from '../src/types.js';

let server: Server;
let base: string;

before(async () => {
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => server.close());

const rectangleZone = (id: string | undefined, name = '矩形禁飞区A') => ({
  ...(id === undefined ? {} : { id }),
  name,
  kind: 'rectangle',
  points: [
    { x: 40, y: 20 },
    { x: 60, y: 20 },
    { x: 60, y: 35 },
    { x: 40, y: 35 }
  ],
  color: '#fb7185'
});

const triangleZone = (id: string | undefined, name = '多边形禁飞区B') => ({
  ...(id === undefined ? {} : { id }),
  name,
  kind: 'polygon',
  points: [
    { x: 10, y: 10 },
    { x: 25, y: 10 },
    { x: 18, y: 22 }
  ],
  color: '#a78bfa'
});

const planBody = (noFlyZones: unknown[], extra: Record<string, unknown> = {}) => ({
  name: '测试方案',
  canvas: { width: 100, height: 70 },
  start: { x: 10, y: 55 },
  end: { x: 90, y: 15 },
  waypoints: [{ x: 32, y: 40 }],
  noFlyZones,
  ...extra
});

async function postPlan(body: unknown) {
  const response = await fetch(`${base}/api/plans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

async function listPlans(): Promise<RoutePlan[]> {
  const response = await fetch(`${base}/api/plans`);
  const { plans } = (await response.json()) as { plans: RoutePlan[] };
  return plans;
}

test('同一方案内两个几何不同但 id 相同的禁飞区被明确拒绝（409），且不会静默入库', async () => {
  const beforePlans = await listPlans();

  // 复现场景：一个矩形 + 一个三角形，共用 id "zone-dup"
  const { status, body } = await postPlan(planBody([rectangleZone('zone-dup'), triangleZone('zone-dup')], { name: '复现：重复禁飞区 id' }));

  assert.equal(status, 409);
  assert.match(body.message, /zone-dup/);
  assert.match(body.message, /重复/);

  const afterPlans = await listPlans();
  assert.equal(afterPlans.length, beforePlans.length, '被拒绝的方案不应写入存储');
  assert.ok(!afterPlans.some((plan) => plan.name === '复现：重复禁飞区 id'));
});

test('同一方案内三个区域共用同一 id 同样被拒绝', async () => {
  const { status, body } = await postPlan(
    planBody([rectangleZone('zone-x'), triangleZone('zone-x'), rectangleZone('zone-x', '又一个矩形')])
  );
  assert.equal(status, 409);
  assert.match(body.message, /zone-x/);
});

test('缺失 id 的禁飞区被安全改写为互不重复的新 id，几何保持不变', async () => {
  const { status, body } = await postPlan(planBody([rectangleZone(undefined), triangleZone(undefined)], { name: '缺失 id 方案' }));

  assert.equal(status, 201);
  const zones = body.plan.noFlyZones;
  assert.equal(zones.length, 2);
  assert.ok(zones[0].id && zones[1].id, '每个区域都应获得 id');
  assert.notEqual(zones[0].id, zones[1].id, '自动补齐的 id 必须唯一');
  assert.deepEqual(zones[0].points, rectangleZone(undefined).points);
  assert.deepEqual(zones[1].points, triangleZone(undefined).points);
  assert.equal(zones[0].kind, 'rectangle');
  assert.equal(zones[1].kind, 'polygon');
});

test('不同方案允许使用相同的禁飞区 id，互不影响', async () => {
  const first = await postPlan(planBody([rectangleZone('zone-shared')], { name: '方案甲' }));
  const second = await postPlan(planBody([triangleZone('zone-shared')], { name: '方案乙' }));
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);

  const planA = first.body.plan;
  const planB = second.body.plan;
  assert.notEqual(planA.id, planB.id);
  assert.equal(planA.noFlyZones[0].id, 'zone-shared');
  assert.equal(planB.noFlyZones[0].id, 'zone-shared');
  assert.equal(planA.noFlyZones[0].kind, 'rectangle');
  assert.equal(planB.noFlyZones[0].kind, 'polygon');

  // 删除方案甲后，方案乙的区域数据保持完整
  const remove = await fetch(`${base}/api/plans/${planA.id}`, { method: 'DELETE' });
  assert.equal(remove.status, 204);

  const reload = await fetch(`${base}/api/plans/${planB.id}`);
  assert.equal(reload.status, 200);
  const { plan: reloaded } = (await reload.json()) as { plan: RoutePlan };
  assert.equal(reloaded.noFlyZones.length, 1);
  assert.equal(reloaded.noFlyZones[0].id, 'zone-shared');
  assert.equal(reloaded.noFlyZones[0].kind, 'polygon');
  assert.equal(reloaded.noFlyZones[0].points.length, 3);
});

test('矩形与多边形方案正常保存，更新已有方案后可重新加载', async () => {
  const created = await postPlan(planBody([rectangleZone('zone-rect'), triangleZone('zone-poly')], { name: '正常方案' }));
  assert.equal(created.status, 201);
  const saved = created.body.plan as RoutePlan;
  assert.ok(saved.id);
  assert.equal(saved.noFlyZones.length, 2);

  // 更新已有方案：保留 id 与 createdAt，替换内容
  const updated = await postPlan(
    planBody([rectangleZone('zone-rect')], { id: saved.id, name: '正常方案（已更新）' })
  );
  assert.equal(updated.status, 200);
  assert.equal(updated.body.plan.id, saved.id);
  assert.equal(updated.body.plan.name, '正常方案（已更新）');
  assert.equal(updated.body.plan.createdAt, saved.createdAt);
  assert.equal(updated.body.plan.noFlyZones.length, 1);

  // 重新加载
  const reload = await fetch(`${base}/api/plans/${saved.id}`);
  assert.equal(reload.status, 200);
  const { plan: reloaded } = (await reload.json()) as { plan: RoutePlan };
  assert.equal(reloaded.name, '正常方案（已更新）');
  assert.deepEqual(
    reloaded.noFlyZones.map((zone) => zone.id),
    ['zone-rect']
  );
});

test('风险定位：validation.issues 的 zoneId 稳定指向实际被穿越的区域', async () => {
  // 航线 (10,55) → (32,40) → (90,15) 会穿过矩形 zone-rect，但碰不到远处的三角形
  const { status, body } = await postPlan(planBody([rectangleZone('zone-rect'), triangleZone('zone-poly')], { name: '风险定位方案' }));
  assert.equal(status, 201);

  const issues = body.validation.issues;
  assert.ok(issues.length > 0, '应存在风险项');
  const zoneIssues = issues.filter((issue: { type: string }) => issue.type === 'no-fly-zone');
  assert.ok(zoneIssues.length > 0);
  for (const issue of zoneIssues) {
    assert.equal(issue.zoneId, 'zone-rect', '风险项必须关联到真正被穿越的矩形区域');
    assert.match(issue.message, /矩形禁飞区A/);
    assert.equal(typeof issue.segmentIndex, 'number');
  }
  assert.ok(!zoneIssues.some((issue: { zoneId?: string }) => issue.zoneId === 'zone-poly'));
});

test('更新已有方案时携带重复禁飞区 id 同样被拒绝，且原方案不被破坏', async () => {
  const created = await postPlan(planBody([rectangleZone('zone-keep')], { name: '待更新方案' }));
  assert.equal(created.status, 201);
  const saved = created.body.plan as RoutePlan;

  const rejected = await postPlan(
    planBody([rectangleZone('zone-dup'), triangleZone('zone-dup')], { id: saved.id, name: '待更新方案' })
  );
  assert.equal(rejected.status, 409);

  const reload = await fetch(`${base}/api/plans/${saved.id}`);
  const { plan: reloaded } = (await reload.json()) as { plan: RoutePlan };
  assert.deepEqual(
    reloaded.noFlyZones.map((zone) => zone.id),
    ['zone-keep'],
    '更新被拒绝后，存储中的原方案应保持不变'
  );
});

test('非法禁飞区数据返回 400', async () => {
  const badKind = await postPlan(planBody([{ id: 'z1', name: 'x', kind: 'circle', points: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }] }]));
  assert.equal(badKind.status, 400);

  const tooFewPoints = await postPlan(planBody([{ id: 'z2', name: 'x', kind: 'polygon', points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }]));
  assert.equal(tooFewPoints.status, 400);
});
