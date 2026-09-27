import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureUniqueZoneIds, newZoneId, removeZoneAt } from '../src/zones.js';
import type { NoFlyZone } from '../src/types.js';

const rect = (id: string, name = '矩形禁飞区A'): NoFlyZone => ({
  id,
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

const triangle = (id: string, name = '多边形禁飞区B'): NoFlyZone => ({
  id,
  name,
  kind: 'polygon',
  points: [
    { x: 10, y: 10 },
    { x: 25, y: 10 },
    { x: 18, y: 22 }
  ],
  color: '#a78bfa'
});

test('ensureUniqueZoneIds 改写重复 id（保留首个），几何与名称不变', () => {
  // 复现场景：几何形状不同但 id 相同的两个禁飞区
  const zones = ensureUniqueZoneIds([rect('zone-dup'), triangle('zone-dup')]);

  assert.equal(zones.length, 2);
  assert.equal(zones[0].id, 'zone-dup', '第一个区域保留原 id');
  assert.notEqual(zones[1].id, 'zone-dup', '重复 id 被安全改写');
  assert.ok(zones[1].id.length > 0);
  assert.deepEqual(zones[1].points, triangle('zone-dup').points);
  assert.equal(zones[1].name, '多边形禁飞区B');
  assert.equal(zones[1].kind, 'polygon');
});

test('ensureUniqueZoneIds 对已唯一的列表保持幂等', () => {
  const input = [rect('zone-1'), triangle('zone-2')];
  const zones = ensureUniqueZoneIds(input);
  assert.deepEqual(
    zones.map((zone) => zone.id),
    ['zone-1', 'zone-2']
  );
});

test('removeZoneAt 在存在重复 id 时也只删除被点击的那一条', () => {
  const zones = [rect('zone-dup'), triangle('zone-dup'), rect('zone-other', '矩形禁飞区C')];

  const afterFirst = removeZoneAt(zones, 0);
  assert.equal(afterFirst.length, 2);
  assert.equal(afterFirst[0].name, '多边形禁飞区B', '同 id 的三角形必须保留');
  assert.equal(afterFirst[1].name, '矩形禁飞区C');

  const afterSecond = removeZoneAt(zones, 1);
  assert.equal(afterSecond.length, 2);
  assert.equal(afterSecond[0].name, '矩形禁飞区A', '同 id 的矩形必须保留');
  assert.equal(afterSecond[1].name, '矩形禁飞区C');
});

test('newZoneId 连续生成不重复', () => {
  const ids = new Set(Array.from({ length: 500 }, () => newZoneId()));
  assert.equal(ids.size, 500);
});
