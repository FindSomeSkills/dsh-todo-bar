// Host-half regression: exercises the real route handler against a throwaway DSH_HOME.
// Run: node scripts/smoke.mjs
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'daily-brief-'));
process.env.DSH_HOME = tmp;

const { apply } = await import('../index.js');

const routes = [];
const tools = [];
apply({
  webServer: { register: (r) => (routes.push(r), () => {}) },
  tools: { register: (def) => (tools.push(def), () => {}) },
});

assert.equal(routes.length, 1, '应当只注册一条路由');
const route = routes[0];
assert.equal(route.kind, 'prefix');
assert.equal(route.path, '/dsh-todo-bar');

// 把一次调用包成 node 形态：假 req 是异步可迭代的 body，假 res 收集结果
const call = async (pathname, init = {}) => {
  const bodyText = init.body ? String(init.body) : '';
  async function* gen() {
    if (bodyText) yield Buffer.from(bodyText);
  }
  const req = gen();
  req.method = init.method || 'GET';
  req.url = pathname;
  const out = { status: 0, body: '', headers: {} };
  const res = {
    writeHead(status, headers) {
      out.status = status;
      out.headers = headers || {};
    },
    end(chunk) {
      out.body = chunk ? String(chunk) : '';
    },
  };
  await route.handler(req, res);
  return {
    status: out.status,
    json: async () => JSON.parse(out.body),
    text: async () => out.body,
  };
};

const state = async () => (await call('/dsh-todo-bar/state')).json();
const mutate = async (body) =>
  (await call('/dsh-todo-bar/mutate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })).json();

const file = () => fs.readFile(path.join(tmp, 'dsh-todo-bar', 'state.json'), 'utf8');

const ok = [];
const pass = (name) => ok.push(name);

// 1. Fresh install answers with an empty day, not an error.
{
  const s = await state();
  assert.match(s.day, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(s.items, []);
  assert.deepEqual(s.archive, []);
  pass('空目录返回空白的一天');
}

// 2. add
let id;
{
  const s = await mutate({ op: 'add', text: '  提交 GSC 10 条  ' });
  assert.equal(s.items.length, 1);
  assert.equal(s.items[0].text, '提交 GSC 10 条', '首尾空格要剪掉');
  assert.equal(s.items[0].done, false);
  id = s.items[0].id;
  pass('add 加一条并剪掉空格');
}

// 3. 空文本不写入
{
  const before = (await state()).items.length;
  const s = await mutate({ op: 'add', text: '   ' });
  assert.equal(s.items.length, before);
  pass('add 空文本被忽略');
}

// 4. toggle
{
  const s = await mutate({ op: 'toggle', id });
  assert.equal(s.items[0].done, true);
  const back = await mutate({ op: 'toggle', id });
  assert.equal(back.items[0].done, false, '再点一次要能撤销');
  pass('toggle 可来回切');
}

// 5. edit
{
  const s = await mutate({ op: 'edit', id, text: '提交 14 条' });
  assert.equal(s.items[0].text, '提交 14 条');
  pass('edit 改文字');
}

// 6. 未知 id 不炸
{
  const s = await mutate({ op: 'toggle', id: 'nope' });
  assert.equal(s.items.length, 1);
  pass('未知 id 被忽略');
}

// 7. clearDone
{
  await mutate({ op: 'add', text: '第二条' });
  const all = await state();
  await mutate({ op: 'toggle', id: all.items[0].id });
  const s = await mutate({ op: 'clearDone' });
  assert.equal(s.items.length, 1);
  assert.equal(s.items[0].text, '第二条');
  pass('clearDone 只留未完成');
}

// 8. remove
{
  const all = await state();
  const s = await mutate({ op: 'remove', id: all.items[0].id });
  assert.equal(s.items.length, 0);
  pass('remove 删掉一条');
}

// 9. 跨天：归档 + 承接，已完成不进新的一天
{
  const yesterday = '2026-11-23';
  const seeded = {
    day: yesterday,
    items: [
      { id: 'a', text: '没做完的', done: false },
      { id: 'b', text: '做完了的', done: true },
    ],
    archive: [],
  };
  await fs.writeFile(path.join(tmp, 'dsh-todo-bar', 'state.json'), JSON.stringify(seeded), 'utf8');

  const s = await state();
  assert.notEqual(s.day, yesterday, '跨天后日期要换');
  assert.equal(s.items.length, 1, '只承接未完成');
  assert.equal(s.items[0].text, '没做完的');
  assert.equal(s.items[0].carried, '11-23', '要标出承接自哪天');
  assert.equal(s.archive.length, 1);
  assert.equal(s.archive[0].day, yesterday);
  assert.equal(s.archive[0].items.length, 2, '归档保留完整的一天');
  pass('跨天归档并承接未完成');

  const onDisk = JSON.parse(await file());
  assert.equal(onDisk.archive.length, 1, '读一次就要把归档落盘，不能只在内存里');
  pass('跨天结果写回文件');
}

// 10. 归档上限
{
  const many = {
    day: '2026-11-01',
    items: [],
    archive: Array.from({ length: 40 }, (_, i) => ({ day: '2026-10-' + String(i + 1).padStart(2, '0'), items: [] })),
  };
  await fs.writeFile(path.join(tmp, 'dsh-todo-bar', 'state.json'), JSON.stringify(many), 'utf8');
  const s = await state();
  assert.ok(s.archive.length <= 30, '归档最多留 30 天，现在是 ' + s.archive.length);
  pass('归档上限 30 天');
}

// 11. 文件损坏：改名留底 + 重建
{
  await fs.writeFile(path.join(tmp, 'dsh-todo-bar', 'state.json'), '{ not json', 'utf8');
  const s = await state();
  assert.deepEqual(s.items, []);
  const files = await fs.readdir(path.join(tmp, 'dsh-todo-bar'));
  assert.ok(files.some((f) => f.includes('.corrupt-')), '坏文件要留底：' + files.join(','));
  pass('损坏文件改名留底并重建');
}

// 12. 不残留临时文件
{
  await mutate({ op: 'add', text: '写一次' });
  const files = await fs.readdir(path.join(tmp, 'dsh-todo-bar'));
  assert.ok(!files.some((f) => f.endsWith('.tmp')), '不应残留 .tmp：' + files.join(','));
  pass('原子写入不残留临时文件');
}

// 13. 长文本截断
{
  const s = await mutate({ op: 'add', text: 'x'.repeat(900) });
  const last = s.items[s.items.length - 1];
  assert.equal(last.text.length, 500);
  pass('超长文本截到 500 字');
}

// 14. 方法不对返回 405，未知路径 404
{
  const r1 = await call('/dsh-todo-bar/state', { method: 'POST' });
  assert.equal(r1.status, 405);
  const r2 = await call('/dsh-todo-bar/nope');
  assert.equal(r2.status, 404);
  const r3 = await call('/dsh-todo-bar/mutate', { method: 'POST', body: 'not json' });
  assert.equal(r3.status, 400);
  pass('405 / 404 / 400 都对');
}

// 15. 模型工具与 HTTP 走同一份数据
{
  assert.equal(tools.length, 1, '应当注册一个模型工具');
  const tool = tools[0];
  assert.equal(tool.name, 'daily_brief');
  assert.equal(tool.parameters.required[0], 'op');
  pass('注册了 daily_brief 工具，参数必填 op');

  const before = (await state()).items.length;
  const added = await tool.execute({ op: 'add', text: '模型加的' }, {});
  assert.equal(added.items.length, before + 1);
  assert.equal(added.items[added.items.length - 1].text, '模型加的');
  pass('工具 add 写进同一份文件');

  const viaHttp = await state();
  assert.equal(viaHttp.items[viaHttp.items.length - 1].text, '模型加的', 'HTTP 侧要能读到工具写的内容');
  pass('工具写入后 HTTP 立刻可见');

  const listed = await tool.execute({ op: 'list' }, {});
  assert.equal(listed.items.length, viaHttp.items.length);
  pass('工具 list 返回当前清单');
}

await fs.rm(tmp, { recursive: true, force: true });

console.log('通过 ' + ok.length + ' 项：');
ok.forEach((n, i) => console.log('  ' + String(i + 1).padStart(2) + '. ' + n));
