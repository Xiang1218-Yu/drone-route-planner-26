import { test } from 'node:test';
import assert from 'node:assert/strict';
import { savePlan, getPlan, deletePlan } from '../src/store.js';
import { DuplicateZoneIdError, prepareNoFlyZones } from '../src/zones.js';

const basePlan = {
  name: '单元测试方案',
  canvas: { width: 100, height: 70 },
  start: { x: 10, y: 55 },
  end: { x: 90, y: 15 },
  waypoints: [] as { x: number; y: number }[]
};

const rect = (id?: string) => ({
  ...(id ? { id } : {}),
  name: '矩形',
  kind: 'rectangle' as const,
  points: [
    { x: 40, y: 20 },
    { x: 60, y: 20 },
    { x: 60, y: 35 },
    { x: 40, y: 35 }
  ]
});

const triangle = (id?: string) => ({
  ...(id ? { id } : {}),
  name: '三角形',
  kind: 'polygon' as const,
  points: [
    { x: 10, y: 10 },
    { x: 25, y: 10 },
    { x: 18, y: 22 }
  ]
});

test('savePlan 对同一方案内的重复禁飞区 id 抛出 DuplicateZoneIdError，且不写入存储', () => {
  assert.throws(
    () => savePlan({ ...basePlan, noFlyZones: [rect('zone-dup'), triangle('zone-dup')] }),
    (error: unknown) => error instanceof DuplicateZoneIdError && (error as DuplicateZoneIdError).zoneId === 'zone-dup'
  );
});

test('prepareNoFlyZones 为缺失/空白 id 生成唯一 id，保留几何与名称', () => {
  const zones = prepareNoFlyZones([rect(), triangle(''), rect('zone-fixed')]);
  assert.equal(zones.length, 3);
  const ids = zones.map((zone) => zone.id);
  assert.equal(new Set(ids).size, 3, 'id 必须全部唯一');
  assert.ok(ids.every((id) => id.length > 0));
  assert.equal(zones[2].id, 'zone-fixed');
  assert.equal(zones[0].kind, 'rectangle');
  assert.equal(zones[1].kind, 'polygon');
  assert.equal(zones[1].points.length, 3);
});

test('prepareNoFlyZones 对重复 id 抛出明确错误', () => {
  assert.throws(() => prepareNoFlyZones([rect('a'), triangle('a')]), DuplicateZoneIdError);
});

test('更新已有方案：id 与 createdAt 稳定，内容被替换', () => {
  const created = savePlan({ ...basePlan, noFlyZones: [rect('zone-1')] });
  const updated = savePlan({ ...basePlan, id: created.id, name: '改名后', noFlyZones: [triangle('zone-2')] });

  assert.equal(updated.id, created.id);
  assert.equal(updated.createdAt, created.createdAt);
  assert.equal(updated.name, '改名后');
  assert.deepEqual(
    getPlan(created.id)?.noFlyZones.map((zone) => zone.id),
    ['zone-2']
  );

  assert.ok(deletePlan(created.id));
});
