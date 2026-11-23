# dsh-todo-bar

一条浮在 DeepSeek Harness 界面上的待办便签：今天几号、还剩几项、清单本身。**可以拖到任何位置**，位置记住，双击标题栏归位。

不用打开任何面板。它一直在。

## 长什么样

```
⠿ 2026-11-24  周一  ·  2 项没做完                    ▾
──────────────────────────────────────────────
☐ 提交 GSC 10 条                                  ×
☑ 写 skills 页                                    ×
☐ 承接 11-23 发 dev.to                            ×
[+ 一条]                          [清掉已完成]
```

**拖动**：按住标题栏拖到任意位置，松手即记住。**双击标题栏**回到右下角默认位置。**点 ▾** 收起来只剩一条标题。

点文字直接改，Enter 保存、Esc 取消。

## 装

```bash
dsh plugin --profile web add dsh-todo-bar
```

装完重启一次宿主，路由和浮层都会注册上。

## 数据在哪

`$DSH_HOME/dsh-todo-bar/state.json`，默认 `~/.dsh/dsh-todo-bar/state.json`。

一个文件，所有 profile、所有浏览器共用。写入走临时文件 + rename，断电不会留半个 JSON；文件坏了改名成 `state.json.corrupt-<时间戳>.bak` 再重建空清单。

跨零点：昨天整份进 `archive`（留 30 天），**没做完的带进今天**，行尾标「承接 11-23」。

## 宿主没起来时也能用

浮层先请求 `GET /dsh-todo-bar/state`。拿不到（404、宿主未重启、纯前端环境）就自动退到浏览器 `localStorage`，卡片底部会写一行提示。宿主下次启动后自动改用文件。

这个兜底是为了让它在装完到重启之间不至于是一片红字错误。

## 模型也能读写

注册了 `daily_brief` 工具，和界面共用同一份数据：

| op | 作用 |
|---|---|
| `list` | 读今天的清单 |
| `add` | 加一条（`text`） |
| `toggle` | 勾选 / 取消（`id`） |
| `edit` | 改文字（`id`、`text`） |
| `remove` | 删一条（`id`） |
| `clearDone` | 清掉已完成的 |

跟 agent 说「把『提交 sitemap』加到今天待办」，它落到你眼前这条便签上。

## HTTP 路由

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/dsh-todo-bar/state` | 读今天状态，顺带触发跨天归档 |
| POST | `/dsh-todo-bar/mutate` | `{ op, text?, id? }` |

只绑宿主自己的监听地址。

## 要求

- DeepSeek Harness `>= 0.2.0-rc.1`（要 `shell.overlay` 插槽与 `ctx.webServer`）
- Web profile。纯 CLI 的 profile 没有 web server，浮层无处可挂

## 它不是什么

- 没有提醒。DSH 自己会排任务，这是给人看的清单。
- 没有分类、没有 Markdown 视图、没有项目拆解。
- 不是给模型的任务图，模型只在被要求时读写。
- Desktop 客户端**没实测**。插槽树大概率一样，但"大概率"不等于测过，所以不写支持。

## 和同类插件的区别

| | dsh-todo | dsh-daily-todo | @mappedinfo/dsh-todo | 本插件 |
|---|---|---|---|---|
| 打开方式 | 侧栏图标 → 面板 | 侧栏图标 → 整页 | 侧栏图标 → 面板 | **不用打开，常驻浮层** |
| 能挪位置 | 否 | 否 | 否 | **能拖，位置记住** |
| 提醒 | 无 | 无 | 四种模式 | 无 |
| 分类 | 无 | 工作/生活 | 无 | 无 |
| 归档承接 | 无 | 有 | 无 | 有 |
| 模型可读写 | 无 | 有路由 | 有工具 | 有工具 |

功能上比它们少。它只做一件事：**让你不用记得去点开**。

## 测试

```bash
node scripts/smoke.mjs          # 19 项：存储、跨天、归档、损坏恢复、路由、模型工具
node scripts/client-smoke.mjs   # 6 项：bundle 形状、浮层注册、拖拽绑定、渲染不崩
```

宿主测试跑在临时 `DSH_HOME` 里，不碰真实清单。

## License

MIT
