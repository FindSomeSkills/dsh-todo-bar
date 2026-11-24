// dsh-todo-bar — Host half.
// Owns the file behind the card: one JSON document under $DSH_HOME/dsh-todo-bar,
// atomic writes, a day rollover that archives yesterday and carries unfinished
// items forward, one tool and two HTTP routes that read and write the same file.

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const KEEP_DAYS = 30;
// DSH_HOME wins when set so a test (or a relocated install) can point the file elsewhere.
const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const DIR = path.join(HOME, 'dsh-todo-bar');
const FILE = path.join(DIR, 'state.json');

// 23:59 之后的时间不是时间，存进去只会把排序搅乱
function clockOk(v) {
  if (typeof v !== 'string') return false;
  const m = /^(\d{2}):(\d{2})$/.exec(v);
  return !!m && Number(m[1]) <= 23 && Number(m[2]) <= 59;
}

function dayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

const empty = () => ({ day: dayKey(), items: [], archive: [] });

function normalize(raw) {
  if (!raw || typeof raw !== 'object') return empty();
  const items = Array.isArray(raw.items) ? raw.items : [];
  const archive = Array.isArray(raw.archive) ? raw.archive : [];
  return {
    day: typeof raw.day === 'string' ? raw.day : dayKey(),
    items: items
      .filter((x) => x && typeof x.text === 'string' && x.text.trim())
      .map((x) => ({
        id: typeof x.id === 'string' ? x.id : newId(),
        text: String(x.text).slice(0, 500),
        done: !!x.done,
        ...(typeof x.carried === 'string' ? { carried: x.carried } : {}),
        ...(typeof x.session === 'string' && x.session ? { session: x.session.slice(0, 60) } : {}),
        ...(clockOk(x.due) ? { due: x.due } : {}),
      })),
    archive: archive
      .filter((x) => x && typeof x.day === 'string' && Array.isArray(x.items))
      .slice(-KEEP_DAYS),
  };
}

async function readState() {
  try {
    return normalize(JSON.parse(await fs.readFile(FILE, 'utf8')));
  } catch (e) {
    if (e && e.code === 'ENOENT') return empty();
    // A damaged file must not block the bar: keep the bytes, start clean.
    try {
      await fs.rename(FILE, FILE + '.corrupt-' + Date.now() + '.bak');
    } catch {
      /* nothing else to do */
    }
    return empty();
  }
}

async function writeState(state) {
  await fs.mkdir(DIR, { recursive: true });
  const tmp = FILE + '.' + process.pid + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmp, FILE);
}

// A new day archives yesterday whole and carries only what was not finished.
function rollover(state) {
  const today = dayKey();
  if (state.day === today) return { state, changed: false };
  const carried = state.items
    .filter((x) => !x.done)
    .map((x) => ({ ...x, done: false, carried: state.day.slice(5) }));
  const archive = state.archive
    .concat([{ day: state.day, items: state.items }])
    .slice(-KEEP_DAYS);
  return { state: { day: today, items: carried, archive }, changed: true };
}

function mutate(state, body) {
  const items = state.items.slice();
  const at = (id) => items.findIndex((x) => x.id === id);
  const op = body && body.op;

  if (op === 'add') {
    const text = String(body.text || '').trim();
    if (!text) return state;
    items.push({
      id: newId(),
      text: text.slice(0, 500),
      done: false,
      ...(body.session ? { session: String(body.session).slice(0, 60) } : {}),
      ...(clockOk(body.due) ? { due: String(body.due) } : {}),
    });
    return { ...state, items };
  }

  if (op === 'toggle') {
    const i = at(body.id);
    if (i >= 0) items[i] = { ...items[i], done: !items[i].done };
    return { ...state, items };
  }

  if (op === 'edit') {
    const i = at(body.id);
    const text = String(body.text || '').trim();
    if (i >= 0 && text) {
      const next = { ...items[i], text: text.slice(0, 500) };
      if (clockOk(body.due)) next.due = body.due;
      else if (body.due === '') delete next.due;
      items[i] = next;
    }
    return { ...state, items };
  }

  if (op === 'remove') {
    const i = at(body.id);
    if (i >= 0) items.splice(i, 1);
    return { ...state, items };
  }

  if (op === 'clearDone') {
    return { ...state, items: items.filter((x) => !x.done) };
  }

  return state;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function sendNode(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

// One path for both carriers: the browser route and the model tool read and
// write the same document through here, so they can never disagree.
async function stateOf() {
  const rolled = rollover(await readState());
  if (rolled.changed) await writeState(rolled.state);
  return rolled.state;
}

// Scheduled work lives in the host's own store. It is read-only here: the bar
// shows what today is already committed to, the scheduler stays the owner.
async function scheduledInfo() {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(HOME, 'storages', 'schedule.json'), 'utf8'));
    const tasks = (raw && raw.tables && raw.tables.tasks) || {};
    const today = dayKey();
    const now = Date.now();
    const all = [];
    for (const [key, v] of Object.entries(tasks)) {
      if (!v || v.status !== 'active') continue;
      const r = v.record || {};
      const at = r.scheduledAt;
      if (!at) continue;
      const d = new Date(at);
      if (Number.isNaN(d.getTime())) continue;
      all.push({
        id: String(r.id || key),
        title: String(r.title || '未命名任务').slice(0, 90),
        at,
        ms: d.getTime(),
      });
    }
    all.sort((a, b) => a.ms - b.ms);
    const todayList = all
      .filter((x) => dayKey(new Date(x.ms)) === today)
      .map(({ ms, ...rest }) => rest);
    const upcoming = all.find((x) => x.ms > now && dayKey(new Date(x.ms)) !== today);
    return {
      scheduled: todayList,
      total: all.length,
      next: upcoming ? { at: upcoming.at, title: upcoming.title } : null,
    };
  } catch {
    return { scheduled: [], total: 0, next: null };
  }
}

async function snapshot() {
  const state = await stateOf();
  return { ...state, ...(await scheduledInfo()) };
}

async function applyMutation(body) {
  const next = mutate(await stateOf(), body);
  await writeState(next);
  return { ...next, ...(await scheduledInfo()) };
}

const TOOL_DESCRIPTION = [
  'Read or change the todo list that the user sees above the composer in every session.',
  'Use op=list to read it. Use op=add to append an item, op=toggle to flip done,',
  'op=edit to rewrite the text, op=remove to delete one, op=clearDone to drop finished items.',
  'Call it when the user mentions something they must do today, or asks what is left.',
].join(' ');

const TOOL_PARAMETERS = {
  type: 'object',
  properties: {
    op: {
      type: 'string',
      enum: ['list', 'add', 'toggle', 'edit', 'remove', 'clearDone'],
      description: 'Which operation to run.',
    },
    text: { type: 'string', description: 'Item text, for add and edit.' },
    id: { type: 'string', description: 'Item id, for toggle, edit and remove.' },
    due: { type: 'string', description: 'Clock time such as 09:30, for add.' },
    session: { type: 'string', description: 'Which session this belongs to, for add.' },
  },
  required: ['op'],
  additionalProperties: false,
};

// Cordis resolves these before apply runs; without the declaration ctx.webServer
// and ctx.tools are undefined and the whole plugin loads as absent.
export const inject = ['webServer', 'tools'];

export function apply(ctx) {
  // A resource route answers GET/HEAD only, so a mutation needs the node-form
  // handler to see POST at all.
  ctx.webServer.register({
    kind: 'prefix',
    path: '/dsh-todo-bar',
    handler: async (req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');

      if (url.pathname === '/dsh-todo-bar/state') {
        if (req.method !== 'GET') return sendNode(res, 405, { error: 'method not allowed' });
        return sendNode(res, 200, await snapshot());
      }

      if (url.pathname === '/dsh-todo-bar/mutate') {
        if (req.method !== 'POST') return sendNode(res, 405, { error: 'method not allowed' });
        let body;
        try {
          body = JSON.parse(await readBody(req));
        } catch {
          return sendNode(res, 400, { error: 'malformed body' });
        }
        return sendNode(res, 200, await applyMutation(body));
      }

      return sendNode(res, 404, { error: 'not found' });
    },
  });

  ctx.tools.register({
    name: 'daily_brief',
    description: TOOL_DESCRIPTION,
    parameters: TOOL_PARAMETERS,
    output: {
      schema: { type: 'object' },
      render(args, value) {
        return [{ type: 'text', text: JSON.stringify(value, null, 2) }];
      },
    },
    async execute(args) {
      const a = args && typeof args === 'object' ? args : {};
      if (a.op === 'list' || !a.op) return snapshot();
      return applyMutation({ op: a.op, text: a.text, id: a.id, due: a.due, session: a.session });
    },
  });
}
