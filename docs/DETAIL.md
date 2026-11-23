# 今日待办（dsh-todo-bar）

在每个会话的输入框上方常驻一条窄栏：今天的日期、星期、还剩几项，以及按天分组的待办清单。

## 它解决什么

会话是按话题分开的，待办写在某个会话里，切到别的就看不见了。这条栏挂在 `shell.overlay` 浮层上，**位置可以拖**，默认在右下角。

这是它和同类插件的唯一差别：别人是「点侧栏图标 → 打开面板」，它是「抬头就在」。

## 数据在哪

`$DSH_HOME/daily-brief/state.json`，默认 `~/.dsh/daily-brief/state.json`。

```json
{
  "day": "2026-11-24",
  "items": [
    { "id": "m3k9x", "text": "提交 GSC 10 条", "done": false },
    { "id": "m3k9y", "text": "写 skills 页", "done": true }
  ],
  "archive": [
    { "day": "2026-11-23", "items": [{ "text": "发 dev.to", "done": true }] }
  ]
}
```

写入走临时文件 + rename，中途断电不会留下半个 JSON。文件坏了会被改名成 `state.json.corrupt-<时间戳>.bak` 再重建空清单——损坏不会挡住界面。

## 跨天怎么处理

以本机时区零点为界。新的一天：

1. 昨天整份清单进 `archive`，只读保留最近 30 天
2. **没做完的带进今天**，行尾标「承接 11-23」
3. 做完的留在归档里，不进新的一天

## 路由

Host 半挂两条：

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/dsh-daily-brief/state` | 返回当天状态，顺带触发跨天归档 |
| POST | `/dsh-daily-brief/mutate` | `{ op: add / toggle / edit / remove / clearDone, ... }` |

只绑在本机监听地址上。DSH 默认只监听 `127.0.0.1`，不对外暴露。

## 适用范围

**能用**：

- DSH Web 界面，浏览器打开 `http://127.0.0.1:2081` 这类地址
- 任何现代浏览器：Chrome、Edge、Firefox、Safari
- Windows、macOS、Linux——只要 DSH 本身能跑，这条栏就能跑，它没有平台相关代码
- 所有 profile 共用一份数据，因为文件在 `$DSH_HOME` 下

**需要**：

- DSH `>= 0.2.0-rc.1`，因为要用客户端插槽 `conversation.input.dock`
- Host 侧要用 `ctx.webServer`，这是 Web profile 自带的服务。纯 CLI 的 profile 没有这个服务，装上也只会白装

**不能**：

- DSH 的 Desktop 客户端没有验证过。它和 Web 版共用 slot 树的可能性很大，但没有实测就不写「支持」
- 不跨设备。数据在本机文件里，换一台机器要自己拷 `state.json`
- 不给模型用。模型看不到这份清单，也没有对应工具——这是刻意的，待办是给人的，不是给 agent 做任务分解用的

## 和同类插件的区别

| | dsh-todo | dsh-daily-todo | 本插件 |
|---|---|---|---|
| 打开方式 | 侧栏图标 → 面板 | 侧栏图标 → 整页 | 不点，常驻输入框上方 |
| 提醒 | 四种模式 | 无 | 无 |
| 分类 | 无 | 工作 / 生活 | 无 |
| 归档承接 | 无 | 有 | 有 |
| 模型可读写 | 有工具 | 有路由 | 无 |
| 数据位置 | `~/.dsh/dsh-todo/` | `~/.dsh/daily-todo/` | `~/.dsh/daily-brief/` |

功能上它比前两个少。它的取舍是：**把人从「记得打开面板」这件事里省掉**。要看的东西越多，越不会主动去点开。
