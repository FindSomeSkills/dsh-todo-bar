window.__ModuleLoader__.load({
  id: 'dsh-todo-bar',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const EP = '/dsh-todo-bar';
    const POS = 'dsh-todo-bar.pos';
    const LOCAL = 'dsh-todo-bar.local';
    const NS = 'plugin.dsh-todo-bar';

    const zh = {
      'title.empty': '今日待办',
      'sum.left': '{n} 项没做完',
      'sum.done': '全做完',
      'sched.head': '计划任务 · 只读',
      'add.open': '+ 一条',
      'add.cancel': '取消',
      'add.submit': '加上',
      'add.placeholder': '09:30 提交 GSC 10 条（时间可省）',
      'add.empty': '写一条今天必须做完的事',
      'clear.done': '清掉已完成',
      'item.remove': '删掉',
      'item.editHint': '点一下改文字',
      'item.carried': '承接',
      'collapse': '收起来',
      'expand': '展开',
      'dragHint': '拖动移动，双击回到默认位置',
      'local.warn': '当前只存在这个浏览器里，宿主重启后改用文件',
      'readFail': '读不到清单',
      'sched.total': '共 {n} 个自动化任务',
      'sched.next': '下一个 {t}',
      'week.0': '周日',
      'week.1': '周一',
      'week.2': '周二',
      'week.3': '周三',
      'week.4': '周四',
      'week.5': '周五',
      'week.6': '周六',
    };

    const en = {
      'title.empty': 'Today',
      'sum.left': '{n} left',
      'sum.done': 'All done',
      'sched.head': 'Scheduled · read-only',
      'add.open': '+ Add',
      'add.cancel': 'Cancel',
      'add.submit': 'Add',
      'add.placeholder': '09:30 submit the sitemap (time optional)',
      'add.empty': 'Write one thing that must get done today',
      'clear.done': 'Clear done',
      'item.remove': 'Delete',
      'item.editHint': 'Click to edit',
      'item.carried': 'carried',
      'collapse': 'Collapse',
      'expand': 'Expand',
      'dragHint': 'Drag to move, double-click to reset',
      'local.warn': 'Saved in this browser only until the host restarts',
      'readFail': 'Cannot read the list',
      'sched.total': '{n} scheduled tasks in total',
      'sched.next': 'next {t}',
      'week.0': 'Sun',
      'week.1': 'Mon',
      'week.2': 'Tue',
      'week.3': 'Wed',
      'week.4': 'Thu',
      'week.5': 'Fri',
      'week.6': 'Sat',
    };

    function dayKey(d) {
      const x = d || new Date();
      const p = (n) => String(n).padStart(2, '0');
      return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate());
    }

    function weekdayOf(key, t) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || '');
      if (!m) return '';
      const i = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay();
      const k = 'week.' + i;
      const label = t(k);
      return label === k ? '' : label;
    }

    function dayMonth(iso) {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      const p = (n) => String(n).padStart(2, '0');
      return p(d.getMonth() + 1) + '-' + p(d.getDate());
    }

    function clockOf(iso) {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '--:--';
      const p = (n) => String(n).padStart(2, '0');
      return p(d.getHours()) + ':' + p(d.getMinutes());
    }

    function newId() {
      return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    function localRead() {
      try {
        const raw = JSON.parse(localStorage.getItem(LOCAL) || 'null');
        if (!raw || raw.day !== dayKey()) return { day: dayKey(), items: [], archive: [] };
        return {
          day: raw.day,
          items: Array.isArray(raw.items) ? raw.items : [],
          archive: Array.isArray(raw.archive) ? raw.archive : [],
        };
      } catch {
        return { day: dayKey(), items: [], archive: [] };
      }
    }

    function localWrite(state) {
      try {
        localStorage.setItem(LOCAL, JSON.stringify(state));
      } catch {
        /* ignore */
      }
    }

    function localMutate(state, body) {
      const items = state.items.slice();
      const at = (id) => items.findIndex((x) => x.id === id);
      if (body.op === 'add') {
        const text = String(body.text || '').trim();
        if (!text) return state;
        items.push({
          id: newId(),
          text: text.slice(0, 500),
          done: false,
          ...(body.due ? { due: String(body.due).slice(0, 10) } : {}),
          ...(body.session ? { session: String(body.session).slice(0, 60) } : {}),
        });
      } else if (body.op === 'toggle') {
        const i = at(body.id);
        if (i >= 0) items[i] = { ...items[i], done: !items[i].done };
      } else if (body.op === 'edit') {
        const i = at(body.id);
        const text = String(body.text || '').trim();
        if (i >= 0 && text) items[i] = { ...items[i], text: text.slice(0, 500) };
      } else if (body.op === 'remove') {
        const i = at(body.id);
        if (i >= 0) items.splice(i, 1);
      } else if (body.op === 'clearDone') {
        return { ...state, items: items.filter((x) => !x.done) };
      }
      return { ...state, items };
    }

    async function remote(path, init) {
      const res = await fetch(EP + path, { credentials: 'same-origin', ...init });
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    }

    function readPos() {
      try {
        const p = JSON.parse(localStorage.getItem(POS) || 'null');
        if (p && typeof p.x === 'number' && typeof p.y === 'number') return p;
      } catch {
        /* ignore */
      }
      return null;
    }

    function writePos(p) {
      try {
        localStorage.setItem(POS, JSON.stringify(p));
      } catch {
        /* ignore */
      }
    }

    const S = {
      card: {
        position: 'fixed',
        zIndex: 40,
        width: 360,
        boxSizing: 'border-box',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 10,
        background: 'var(--dsw-alias-bg-overlay)',
        color: 'var(--dsw-alias-label-primary)',
        fontSize: 13,
        lineHeight: 1.55,
        boxShadow: '0 6px 24px rgba(0,0,0,.18)',
        overflow: 'hidden',
      },
      bar: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 10px',
        cursor: 'grab',
        userSelect: 'none',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
      },
      grip: {
        width: 10,
        height: 14,
        flex: '0 0 auto',
        opacity: 0.45,
        backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
        backgroundSize: '4px 4px',
      },
      title: { fontWeight: 600, fontSize: 13 },
      sub: { color: 'var(--dsw-alias-label-secondary)', fontSize: 11 },
      grow: { flex: 1 },
      icon: {
        background: 'transparent',
        border: 0,
        color: 'var(--dsw-alias-label-secondary)',
        cursor: 'pointer',
        fontSize: 14,
        lineHeight: 1,
        padding: '2px 5px',
        font: 'inherit',
      },
      body: { padding: '8px 10px 10px', maxHeight: 320, overflowY: 'auto' },
      empty: { color: 'var(--dsw-alias-label-secondary)', fontSize: 12, margin: '2px 0 0' },
      list: { margin: 0, padding: 0, listStyle: 'none' },
      row: { display: 'flex', alignItems: 'flex-start', gap: 7, padding: '2px 0' },
      box: { margin: '3px 0 0', flex: '0 0 auto', accentColor: 'var(--dsw-alias-brand-primary)' },
      dueCol: {
        flex: '0 0 auto',
        width: 44,
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: 11,
        fontVariantNumeric: 'tabular-nums',
        paddingTop: 1,
      },
      text: { flex: 1, wordBreak: 'break-word', cursor: 'text' },
      textDone: {
        flex: 1,
        wordBreak: 'break-word',
        color: 'var(--dsw-alias-label-secondary)',
        textDecoration: 'line-through',
      },
      carried: {
        marginLeft: 5,
        padding: '0 4px',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 4,
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: 10,
      },
      del: {
        background: 'transparent',
        border: 0,
        padding: '0 3px',
        color: 'var(--dsw-alias-label-secondary)',
        cursor: 'pointer',
        fontSize: 14,
        lineHeight: 1,
        font: 'inherit',
      },
      form: { display: 'flex', gap: 6, marginTop: 7 },
      input: {
        flex: 1,
        minWidth: 0,
        padding: '4px 8px',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 6,
        background: 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-primary)',
        font: 'inherit',
        fontSize: 12,
      },
      ghost: {
        background: 'transparent',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 6,
        padding: '2px 8px',
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: 11,
        cursor: 'pointer',
        font: 'inherit',
      },
      warn: { color: 'var(--dsw-alias-state-warn-primary)', fontSize: 11, margin: '4px 0 0' },
      schedBox: {
        margin: '0 0 8px',
        padding: '6px 8px',
        borderRadius: 6,
        background: 'var(--dsw-alias-bg-layer-2)',
        border: '1px solid var(--dsw-alias-border-l1)',
      },
      schedHead: {
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: 10,
        letterSpacing: '0.04em',
        marginBottom: 3,
      },
      schedRow: { display: 'flex', gap: 7, alignItems: 'baseline', padding: '1px 0' },
      schedTime: {
        flex: '0 0 auto',
        color: 'var(--dsw-alias-brand-primary)',
        fontSize: 11,
        fontVariantNumeric: 'tabular-nums',
      },
      schedTitle: { flex: 1, fontSize: 12, wordBreak: 'break-word' },
      schedFoot: {
        marginTop: 4,
        paddingTop: 4,
        borderTop: '1px solid var(--dsw-alias-border-l1)',
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: 10,
      },
    };

    function defaultPos() {
      const w = typeof window !== 'undefined' ? window.innerWidth : 1200;
      const hh = typeof window !== 'undefined' ? window.innerHeight : 800;
      return { x: Math.max(16, Math.round(w - 396)), y: Math.max(16, Math.round(hh - 320)) };
    }

    function TodoBar(props) {
      const t = props.t;


      const [state, setState] = React.useState(null);
      const [native, setNative] = React.useState(true);
      const [broken, setBroken] = React.useState('');
      const [collapsed, setCollapsed] = React.useState(false);
      const [pos, setPos] = React.useState(() => readPos() || defaultPos());
      const [adding, setAdding] = React.useState(false);
      const [draft, setDraft] = React.useState('');
      const [editId, setEditId] = React.useState('');
      const [editText, setEditText] = React.useState('');
      const drag = React.useRef(null);

      React.useEffect(() => {
        let live = true;
        remote('/state')
          .then((s) => {
            if (!live) return;
            setNative(true);
            setState(s);
          })
          .catch(() => {
            if (!live) return;
            setNative(false);
            setState(localRead());
          });
        return () => {
          live = false;
        };
      }, []);

      React.useEffect(() => {
        const move = (e) => {
          const d = drag.current;
          if (!d) return;
          const x = Math.min(Math.max(0, e.clientX - d.dx), window.innerWidth - 60);
          const y = Math.min(Math.max(0, e.clientY - d.dy), window.innerHeight - 40);
          setPos({ x, y });
        };
        const up = () => {
          if (!drag.current) return;
          drag.current = null;
          document.body.style.userSelect = '';
          setPos((p) => {
            writePos(p);
            return p;
          });
        };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
        return () => {
          window.removeEventListener('mousemove', move);
          window.removeEventListener('mouseup', up);
        };
      }, []);

      const startDrag = (e) => {
        if (e.button !== 0) return;
        drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
        document.body.style.userSelect = 'none';
      };

      const resetPos = () => {
        const p = defaultPos();
        setPos(p);
        writePos(p);
      };

      const send = (body) => {
        if (!native) {
          const next = localMutate(state || localRead(), body);
          localWrite(next);
          setState(next);
          return;
        }
        remote('/mutate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
          .then((s) => {
            setState(s);
            setBroken('');
          })
          .catch((e) => {
            setBroken(String(e.message || e));
          });
      };

      const add = () => {
        const raw = draft.trim();
        if (!raw) {
          setAdding(false);
          setDraft('');
          return;
        }
        // 行首的 9:30 / 09:30 / 9：30 提出来当排序列，剩下的才是事项。
        // 小时过 23 或分钟过 59 的不算时间，整条留在正文里。
        const hit = /^(\d{1,2})[:：](\d{2})\s*(.+)$/.exec(raw);
        const hh = hit ? Number(hit[1]) : -1;
        const mm = hit ? Number(hit[2]) : -1;
        const valid = hit && hh <= 23 && mm <= 59;
        const body = valid
          ? { text: hit[3], due: String(hh).padStart(2, '0') + ':' + hit[2] }
          : { text: raw };
        send({ op: 'add', ...body });
        setDraft('');
        setAdding(false);
      };

      const commitEdit = (id) => {
        const text = editText.trim();
        if (text) {
          // 改完还带着时间前缀，同样拆到时间列，别让它留在正文里
          const hit = /^(\d{1,2})[:：](\d{2})\s*(.+)$/.exec(text);
          const hh = hit ? Number(hit[1]) : -1;
          const mm = hit ? Number(hit[2]) : -1;
          const valid = hit && hh <= 23 && mm <= 59;
          send(
            valid
              ? { op: 'edit', id, text: hit[3], due: String(hh).padStart(2, '0') + ':' + hit[2] }
              : { op: 'edit', id, text }
          );
        }
        setEditId('');
        setEditText('');
      };

      const rawItems = (state && state.items) || [];
      const items = rawItems.slice().sort((a, b) => {
        const ta = a.due || '99:99';
        const tb = b.due || '99:99';
        return ta.localeCompare(tb);
      });
      const scheduled = (state && state.scheduled) || [];
      const totalSched = (state && state.total) || 0;
      const nextSched = (state && state.next) || null;
      const left = items.filter((x) => !x.done).length;
      const total = items.length;
      const sum = left === 0 ? t('sum.done') : t('sum.left').replace('{n}', String(left));

      return h(
        'div',
        { style: { ...S.card, left: pos.x, top: pos.y }, 'data-dsh-todo-bar': '' },
        h(
          'div',
          { style: S.bar, onMouseDown: startDrag, onDoubleClick: resetPos, title: t('dragHint') },
          h('span', { style: S.grip }),
          h('span', { style: S.title }, state ? state.day : t('title.empty')),
          state && h('span', { style: S.sub }, weekdayOf(state.day, t)),
          total > 0 && h('span', { style: S.sub }, '· ' + sum),
          h('span', { style: S.grow }),
          h(
            'button',
            {
              type: 'button',
              style: S.icon,
              onMouseDown: (e) => e.stopPropagation(),
              onClick: () => setCollapsed(!collapsed),
              title: collapsed ? t('expand') : t('collapse'),
            },
            collapsed ? '▸' : '▾'
          )
        ),
        !collapsed &&
          h(
            'div',
            { style: S.body },
            broken
              ? h('p', { style: S.warn }, t('readFail') + '：' + broken)
              : null,
            (scheduled.length > 0 || totalSched > 0) &&
              h(
                'div',
                { style: S.schedBox },
                h('div', { style: S.schedHead }, t('sched.head')),
                scheduled.map((s) =>
                  h(
                    'div',
                    { key: s.id, style: S.schedRow },
                    h('span', { style: S.schedTime }, clockOf(s.at)),
                    h('span', { style: S.schedTitle }, s.title)
                  )
                ),
                h(
                  'div',
                  { style: S.schedFoot },
                  t('sched.total').replace('{n}', String(totalSched || scheduled.length)) +
                    (nextSched
                      ? ' · ' +
                        t('sched.next').replace('{t}', dayMonth(nextSched.at) + ' ' + clockOf(nextSched.at))
                      : '')
                )
              ),
            total > 0 &&
              h(
                'ul',
                { style: S.list },
                items.map((it) =>
                  h(
                    'li',
                    { key: it.id, style: S.row },
                    h('input', {
                      type: 'checkbox',
                      checked: it.done,
                      onChange: () => {
                        send({ op: 'toggle', id: it.id });
                        setTimeout(() => send({ op: 'remove', id: it.id }), 900);
                      },
                      style: S.box,
                      'aria-label': it.text,
                    }),
                    h('span', { style: S.dueCol }, it.due || ''),
                    editId === it.id
                      ? h('input', {
                          style: S.input,
                          value: editText,
                          autoFocus: true,
                          onChange: (e) => setEditText(e.target.value),
                          onBlur: () => commitEdit(it.id),
                          onKeyDown: (e) => {
                            if (e.key === 'Enter') commitEdit(it.id);
                            if (e.key === 'Escape') {
                              setEditId('');
                              setEditText('');
                            }
                          },
                        })
                      : h(
                          'span',
                          {
                            style: it.done ? S.textDone : S.text,
                            onClick: () => {
                              setEditId(it.id);
                              setEditText(it.text);
                            },
                            title: t('item.editHint'),
                          },
                          it.text,
                          it.carried &&
                            h('span', { style: S.carried }, t('item.carried') + ' ' + it.carried)
                        ),
                    h(
                      'button',
                      {
                        type: 'button',
                        style: S.del,
                        onClick: () => send({ op: 'remove', id: it.id }),
                        title: t('item.remove'),
                      },
                      '×'
                    )
                  )
                )
              ),
            total === 0 && !adding && h('p', { style: S.empty }, t('add.empty')),
            adding &&
              h(
                'div',
                { style: S.form },
                h('input', {
                  style: S.input,
                  value: draft,
                  maxLength: 200,
                  autoFocus: true,
                  placeholder: t('add.placeholder'),
                  onChange: (e) => setDraft(e.target.value),
                  onKeyDown: (e) => {
                    if (e.key === 'Enter') add();
                    if (e.key === 'Escape') {
                      setAdding(false);
                      setDraft('');
                    }
                  },
                }),
                h('button', { type: 'button', style: S.ghost, onClick: add }, t('add.submit'))
              ),
            !adding &&
              h(
                'div',
                { style: S.form },
                h(
                  'button',
                  { type: 'button', style: S.ghost, onClick: () => setAdding(true) },
                  t('add.open')
                ),
                total > 0 &&
                  h(
                    'button',
                    { type: 'button', style: S.ghost, onClick: () => send({ op: 'clearDone' }) },
                    t('clear.done')
                  ),
                h('span', { style: S.grow }),
                h('span', { style: S.sub }, 'dsh-todo-bar')
              ),
            !native && h('p', { style: S.warn }, t('local.warn'))
          )
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-todo-bar locale');
        const t = ctx.locale.bind(NS);
        const Bound = () => h(TodoBar, { t });
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register({ name: 'shell.overlay', id: 'dsh-todo-bar', order: 50 }, Bound)
        );
      },
    };
  },
});
