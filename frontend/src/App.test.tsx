import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import App from './App';
import { dedupeZoneIds, removeZoneAt } from './identity';
import { validateRoute } from './geometry';
import type { NoFlyZone, RoutePlan } from './types';

const rect: NoFlyZone = {
  id: 'zone-x',
  name: '矩形区',
  kind: 'rectangle',
  points: [{ x: 20, y: 40 }, { x: 40, y: 40 }, { x: 40, y: 60 }, { x: 20, y: 60 }],
  color: '#fb7185'
};
const tri: NoFlyZone = {
  id: 'zone-x',
  name: '三角多边形',
  kind: 'polygon',
  points: [{ x: 60, y: 10 }, { x: 80, y: 10 }, { x: 70, y: 30 }],
  color: '#38bdf8'
};

// App 挂载时会 fetch /api/plans；SSR 冒烟中直接让它失败，走“仅本地编辑”分支
mock.method(globalThis, 'fetch', () => Promise.reject(new Error('no api in ssr test')));

afterEach(() => mock.restoreAll());

function captureKeyWarnings(render: () => string): { html: string; warnings: string[] } {
  const warnings: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => { warnings.push(args.map(String).join(' ')); };
  try {
    return { html: render(), warnings };
  } finally {
    console.error = originalError;
  }
}

// 与 App.tsx 中相同的区域行渲染结构，用于把任意规范化后的数据灌进 React key 检查
function ZoneList({ zones }: { zones: NoFlyZone[] }) {
  return React.createElement('div', null, zones.map((zone) =>
    React.createElement('div', { key: zone.id, 'data-name': zone.name }, zone.name)));
}

describe('App 渲染冒烟', () => {
  it('默认初始方案正常渲染且无 React key 警告', () => {
    const { html, warnings } = captureKeyWarnings(() => renderToString(React.createElement(App)));
    assert.match(html, /高压线保护区/);
    assert.ok(!warnings.some((message) => message.includes('same key')), warnings.join('\n'));
  });

  it('两个几何不同但同 id 的区域：规范化后渲染无 key 警告且两个区域都保留', () => {
    const { zones } = dedupeZoneIds([rect, tri]);
    assert.equal(new Set(zones.map((zone) => zone.id)).size, 2, '规范化后 id 必须唯一');

    const after = captureKeyWarnings(() => renderToString(React.createElement(ZoneList, { zones })));
    assert.ok(!after.warnings.some((message) => message.includes('same key')), after.warnings.join('\n'));
    assert.equal(after.html.match(/data-name="(矩形区|三角多边形)"/g)?.length, 2);
  });

  it('规范化后按下标删除：删三角形只删一个，不会按相同 id 连带删除矩形', () => {
    const { zones } = dedupeZoneIds([rect, tri]);
    const onlyRect = removeZoneAt(zones, 1);
    assert.equal(onlyRect.length, 1);
    assert.equal(onlyRect[0].name, '矩形区');
    const onlyTri = removeZoneAt(zones, 0);
    assert.equal(onlyTri[0].name, '三角多边形');
  });

  it('风险项携带 zoneIndex：两个同 id 区域也能稳定区分对应对象', () => {
    const result = validateRoute({
      name: '风险',
      canvas: { width: 100, height: 70 },
      start: { x: 5, y: 65 },
      end: { x: 95, y: 5 },
      waypoints: [],
      noFlyZones: [rect, tri]
    } as RoutePlan);
    const zoneIssues = result.issues.filter((issue) => issue.type === 'no-fly-zone');
    assert.ok(zoneIssues.length > 0);
    for (const issue of zoneIssues) {
      assert.equal(typeof issue.zoneIndex, 'number');
      assert.equal(issue.zoneId, 'zone-x'); // id 相同
    }
    assert.deepEqual([...new Set(zoneIssues.map((issue) => issue.zoneIndex))].sort(), [0, 1]);
  });
});
