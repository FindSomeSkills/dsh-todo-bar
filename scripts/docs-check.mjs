// Docs regression: the plugin "detail" pages are shipped inside the package and
// rendered by the plugin manager, so stale text there reaches users the same way
// code bugs do. One release shipped a detail page describing the pre-rewrite
// design: old data path, old routes, and "the model has no tool" while a
// daily_brief tool was registered. These checks exist so that cannot ship twice.
// Run: node scripts/docs-check.mjs
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFile(path.join(ROOT, rel), 'utf8');
const exists = async (rel) => {
  try {
    await fs.access(path.join(ROOT, rel));
    return true;
  } catch {
    return false;
  }
};

const ok = [];
const pass = (n) => ok.push(n);

const pkg = JSON.parse(await read('package.json'));
const locales = {
  en: JSON.parse(await read('locale/en.json')),
  zh: JSON.parse(await read('locale/zh.json')),
};

// 1. Both languages point at their own detail page, and it is really there.
const details = {};
for (const [lang, dict] of Object.entries(locales)) {
  const rel = dict.meta && dict.meta.detail;
  assert.ok(rel, lang + ' 缺少 meta.detail');
  assert.ok(await exists(rel), lang + ' 的 detail 文件不存在：' + rel);
  details[lang] = rel;
}
assert.notEqual(details.en, details.zh, '中英应各自一份，不要共用同一份英文');
pass('中英各有一份 detail，路径存在');

// 2. Every shipped file is whitelisted, or npm silently drops it from the tarball.
for (const rel of [...Object.values(details), 'docs/shot.png', 'docs/DETAIL.md', 'docs/DETAIL.zh.md']) {
  assert.ok(pkg.files.includes(rel), 'package.json files 里缺 ' + rel);
}
pass('files 白名单覆盖 detail 与截图');

// 3. The screenshot sits at the top of the page: nothing but the heading may come first.
for (const [lang, rel] of Object.entries(details)) {
  const text = await read(rel);
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  assert.equal(lines[0].trim(), '# dsh-todo-bar', lang + ' 第一行应是标题');
  assert.match(lines[1], /^!\[[^\]]+\]\(shot\.png\)$/, lang + ' 标题下面紧接着应当是截图，实际：' + lines[1]);
  assert.ok(await exists('docs/shot.png'), '截图文件不存在');
}
pass('截图紧跟标题，文件存在');

// 4. Facts that changed in the rewrite must not survive in the docs.
const dead = ['daily-brief', 'dsh-daily-brief', 'conversation.input.dock', '没有对应工具'];
for (const [lang, rel] of Object.entries(details)) {
  const text = await read(rel);
  for (const s of dead) {
    assert.ok(!text.includes(s), lang + ' 的 detail 里还留着旧说法：' + s);
  }
}
pass('没有旧数据路径、旧路由与「模型不能用」');

// 5. The real ones are stated, in both languages.
for (const [lang, rel] of Object.entries(details)) {
  const text = await read(rel);
  for (const s of ['dsh-todo-bar/state.json', '/dsh-todo-bar/state', 'daily_brief']) {
    assert.ok(text.includes(s), lang + ' 的 detail 里没写 ' + s);
  }
}
pass('数据路径、HTTP 路由、工具名都写对了');

// 6. Every markdown link to a local file resolves.
for (const [lang, rel] of Object.entries(details)) {
  const text = await read(rel);
  const links = [...text.matchAll(/!?\[[^\]]*\]\(([^)#\s]+)\)/g)].map((m) => m[1]);
  for (const link of links) {
    assert.ok(!/^https?:/.test(link), lang + ' 里出现了外链，插件包内应使用相对路径：' + link);
    assert.ok(await exists(path.join(path.dirname(rel), link)), lang + ' 的链接指不到文件：' + link);
  }
}
pass('页面内的本地链接都能打开');

console.log('通过 ' + ok.length + ' 项：');
ok.forEach((n, i) => console.log('  ' + (i + 1) + '. ' + n));
