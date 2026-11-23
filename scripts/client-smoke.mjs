// Client-half regression: loads the real bundle, checks the slot registration,
// then calls the component with a minimal React stand-in.
// Run: node scripts/client-smoke.mjs
import assert from 'node:assert/strict';

const ok = [];
const pass = (n) => ok.push(n);

function useState(init) {
  return [typeof init === 'function' ? init() : init, () => {}];
}
function useEffect() {}
function useRef(v) {
  return { current: v === undefined ? null : v };
}
function createElement(type, props, ...children) {
  return { type, props: props || {}, children: children.flat() };
}
const React = { createElement, useState, useEffect, useRef };

let loaded = null;
globalThis.window = { innerWidth: 1200, innerHeight: 800, __ModuleLoader__: { load: (c) => (loaded = c) } };
globalThis.document = { body: { style: {} } };
const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => {
    store[k] = String(v);
  },
  removeItem: (k) => {
    delete store[k];
  },
};

await import('../client.js');

assert.ok(loaded, 'bundle 应调用 __ModuleLoader__.load');
assert.equal(loaded.id, 'dsh-todo-bar');
pass('bundle 以正确 id 注册');

const mod = loaded.factory((name) => {
  if (name === 'react') return React;
  throw new Error('unexpected import: ' + name);
});
assert.equal(typeof mod.apply, 'function');
assert.deepEqual(mod.inject, ['slots', 'locale']);
pass('factory 返回 apply 与 slots 注入声明');

const seen = [];
const dicts = [];
mod.apply({
  effect(fn) {
    return fn();
  },
  locale: {
    register(ns, d) {
      dicts.push({ ns, d });
      return () => {};
    },
    bind() {
      return (k) => k;
    },
    getLocale() {
      return { id: 'zh' };
    },
  },
  slots: {
    inject(name, fn) {
      assert.equal(name, 'shell.overlay', '应挂到浮层，不是固定 dock');
      return fn();
    },
    register(meta, component) {
      seen.push({ meta, component });
      return () => {};
    },
  },
});
assert.equal(dicts.length, 1, '要注册一份语言字典');
assert.ok(dicts[0].d.zh && dicts[0].d.en, '中英两套都要有');
assert.equal(Object.keys(dicts[0].d.zh).length, Object.keys(dicts[0].d.en).length, '中英条目数要一致');
pass('注册了中英双语字典且条目对齐');

assert.equal(seen.length, 1);
assert.equal(seen[0].meta.name, 'shell.overlay');
assert.equal(seen[0].meta.id, 'dsh-todo-bar');
pass('注册到 shell.overlay，可自由定位');

const BoundComp = seen[0].component;
// Bound 只转发 props，真正渲染要再调一层
const el = BoundComp();
const tree = el.type(el.props);
const flat = JSON.stringify(tree);
assert.ok(flat.includes('title.empty'), '标题 key 缺失：' + flat.slice(0, 200));
assert.ok(flat.includes('"position":"fixed"'), '浮层要用 fixed 定位');
assert.ok(flat.includes('data-dsh-todo-bar'), '缺少标记属性');
pass('渲染出可定位的浮层卡片，带拖拽手柄');

const bar = tree.children[0];
assert.equal(typeof bar.props.onMouseDown, 'function', '标题栏要有按下拖动');
assert.equal(typeof bar.props.onDoubleClick, 'function', '双击要能归位');
pass('标题栏绑定了拖动与双击归位');

let fetchCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (...a) => {
  fetchCalls += 1;
  return Promise.reject(new Error('no network in test'));
};
seen[0].component();
assert.equal(fetchCalls, 0, '渲染期不该发请求');
globalThis.fetch = realFetch;
pass('渲染期不发网络请求');

console.log('通过 ' + ok.length + ' 项：');
ok.forEach((n, i) => console.log('  ' + (i + 1) + '. ' + n));
