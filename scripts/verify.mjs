// 全功能验证：单测 + 真实运行链路 + 跨天模拟 + 计划任务聚合。
// 用法：node scripts/verify.mjs
import { promises as fs } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const ok = [];
const bad = [];
const pass = (n) => ok.push(n);
const fail = (n, d) => bad.push(n + (d ? ' — ' + d : ''));

function check(name, fn) {
  try {
    fn();
    pass(name);
  } catch (e) {
    fail(name, e.message);
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    pass(name);
  } catch (e) {
    fail(name, e.message);
  }
}

// ---------- 1. 单元测试 ----------
console.log('[1/5] 跑单元测试…');
for (const [label, script] of [
  ['宿主 19 项', 'scripts/smoke.mjs'],
  ['客户端 7 项', 'scripts/client-smoke.mjs'],
]) {
  try {
    const out = execFileSync(process.execPath, [script], { encoding: 'utf8' });
    const m = /通过 (\d+) 项/.exec(out);
    check(label, () => {
      if (!m) throw new Error('没有通过计数');
    });
  } catch (e) {
    fail(label, String(e.message).slice(0, 80));
  }
}

// ---------- 2. 真实运行：HTTP ----------
console.log('[2/5] 真实运行：HTTP 路由…');
const BASE = 'http://127.0.0.1:2081';

async function http(pathname, init) {
  const r = await fetch(BASE + pathname, init);
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* 非 JSON */
  }
  return { status: r.status, json, text };
}

await checkAsync('GET /state 返回 200 且结构完整', async () => {
  const r = await http('/dsh-todo-bar/state');
  if (r.status !== 200) throw new Error('status=' + r.status);
  if (!r.json) throw new Error('不是 JSON');
  if (typeof r.json.day !== 'string') throw new Error('缺 day');
  if (!Array.isArray(r.json.items)) throw new Error('缺 items');
  if (!Array.isArray(r.json.scheduled)) throw new Error('缺 scheduled');
  if (typeof r.json.total !== 'number') throw new Error('缺 total');
});

// ---------- 3. 真实运行：写入链路 ----------
console.log('[3/5] 真实运行：写入、改、勾选、删除…');
let probeId = null;

await checkAsync('POST /mutate add 能写入', async () => {
  const r = await http('/dsh-todo-bar/mutate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ op: 'add', text: '『验证探针』这条会自动删除', due: '23:58' }),
  });
  if (r.status !== 200) throw new Error('status=' + r.status);
  const it = r.json.items.find((x) => x.text.startsWith('『验证探针』'));
  if (!it) throw new Error('没写进去');
  if (it.due !== '23:58') throw new Error('due 没存对: ' + it.due);
  probeId = it.id;
});

await checkAsync('POST /mutate edit 能改文字', async () => {
  const r = await http('/dsh-todo-bar/mutate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ op: 'edit', id: probeId, text: '『验证探针』改名' }),
  });
  const it = r.json.items.find((x) => x.id === probeId);
  if (!it || !it.text.includes('改名')) throw new Error('没改成');
});

await checkAsync('POST /mutate toggle 能勾选', async () => {
  const r = await http('/dsh-todo-bar/mutate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ op: 'toggle', id: probeId }),
  });
  const it = r.json.items.find((x) => x.id === probeId);
  if (!it || it.done !== true) throw new Error('没勾上');
});

await checkAsync('非法时间被拒（不写 due）', async () => {
  const r = await http('/dsh-todo-bar/mutate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ op: 'add', text: '『验证探针』非法时间', due: '10:99' }),
  });
  const it = r.json.items.find((x) => x.text === '『验证探针』非法时间');
  if (!it) throw new Error('条目没建');
  if (it.due) throw new Error('非法时间被存进去了: ' + it.due);
  probeId = probeId; // 留着，等下统一清
});

await checkAsync('POST /mutate remove 能删除', async () => {
  const r = await http('/dsh-todo-bar/mutate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ op: 'remove', id: probeId }),
  });
  if (r.json.items.some((x) => x.id === probeId)) throw new Error('还在');
});

// ---------- 4. 计划任务聚合 ----------
console.log('[4/5] 计划任务聚合…');
await checkAsync('今天到期的任务数与 schedule.json 一致', async () => {
  const raw = JSON.parse(
    await fs.readFile(path.join(process.env.USERPROFILE || os.homedir(), '.dsh', 'storages', 'schedule.json'), 'utf8')
  );
  const tasks = (raw.tables && raw.tables.tasks) || {};
  const today = new Date();
  const key = (d) =>
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0');
  let expectTotal = 0;
  let expectToday = 0;
  for (const v of Object.values(tasks)) {
    if (!v || v.status !== 'active') continue;
    const at = v.record && v.record.scheduledAt;
    if (!at) continue;
    const d = new Date(at);
    if (Number.isNaN(d.getTime())) continue;
    expectTotal += 1;
    if (key(d) === key(today)) expectToday += 1;
  }
  const r = await http('/dsh-todo-bar/state');
  if (r.json.total !== expectTotal) throw new Error(`total 期望 ${expectTotal}，实际 ${r.json.total}`);
  if (r.json.scheduled.length !== expectToday)
    throw new Error(`今天期望 ${expectToday}，实际 ${r.json.scheduled.length}`);
});

// ---------- 5. 临时环境：跨天与损坏 ----------
console.log('[5/5] 临时环境：跨天归档、损坏恢复…');
{
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'tb-verify-'));
  const savedHome = process.env.DSH_HOME;
  process.env.DSH_HOME = tmp;

  const mod = await import('../index.js?verify=' + Date.now());
  const routes = [];
  mod.apply({
    webServer: { register: (r) => (routes.push(r), () => {}) },
    tools: { register: () => () => {} },
  });
  const route = routes[0];

  const call = async (p, body) => {
    const txt = body ? JSON.stringify(body) : '';
    async function* gen() {
      if (txt) yield Buffer.from(txt);
    }
    const req = gen();
    req.method = body ? 'POST' : 'GET';
    req.url = p;
    const out = { status: 0, body: '' };
    const res = {
      writeHead(s) {
        out.status = s;
      },
      end(c) {
        out.body = String(c || '');
      },
    };
    await route.handler(req, res);
    return JSON.parse(out.body || '{}');
  };

  const file = path.join(tmp, 'dsh-todo-bar', 'state.json');
  await fs.mkdir(path.dirname(file), { recursive: true });

  await checkAsync('跨天：归档昨天并承接未完成', async () => {
    await fs.writeFile(
      file,
      JSON.stringify({
        day: '2026-11-20',
        items: [
          { id: 'a', text: '没做完的', done: false },
          { id: 'b', text: '做完了的', done: true },
        ],
        archive: [],
      }),
      'utf8'
    );
    const s = await call('/dsh-todo-bar/state');
    if (s.day === '2026-11-20') throw new Error('日期没换');
    if (s.items.length !== 1) throw new Error('承接数量不对: ' + s.items.length);
    if (s.items[0].carried !== '11-20') throw new Error('没标承接日期');
    if (s.archive.length !== 1) throw new Error('没归档');
  });

  await checkAsync('损坏文件：留底并重建', async () => {
    await fs.writeFile(file, '{ 坏掉的 json', 'utf8');
    const s = await call('/dsh-todo-bar/state');
    if (!Array.isArray(s.items)) throw new Error('没重建');
    const files = await fs.readdir(path.dirname(file));
    if (!files.some((f) => f.includes('.corrupt-'))) throw new Error('没留底: ' + files.join(','));
  });

  await checkAsync('原子写入：不残留 .tmp', async () => {
    await call('/dsh-todo-bar/mutate', { op: 'add', text: '写一次' });
    const files = await fs.readdir(path.dirname(file));
    if (files.some((f) => f.endsWith('.tmp'))) throw new Error('残留 tmp');
  });

  await fs.rm(tmp, { recursive: true, force: true });
  if (savedHome === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = savedHome;
}

// ---------- 结果 ----------
console.log('');
console.log('通过 ' + ok.length + ' 项：');
ok.forEach((n, i) => console.log('  ' + String(i + 1).padStart(2) + '. ' + n));
if (bad.length) {
  console.log('');
  console.log('失败 ' + bad.length + ' 项：');
  bad.forEach((n) => console.log('  ✗ ' + n));
  process.exit(1);
} else {
  console.log('');
  console.log('全部通过。');
}
