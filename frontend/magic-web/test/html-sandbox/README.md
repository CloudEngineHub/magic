# HTML iframe sandbox contract tests

## 本地运行 / Run locally

在 `frontend/magic-web` 执行，使用当前 Worktree 的独立依赖：

```sh
pnpm install --frozen-lockfile
pnpm test:html-sandbox
```

- `pnpm test:html-sandbox:types`：仅检查已提取 iframe runtime 模块的严格类型。
- `pnpm test:html-sandbox:unit`：API、hooks/services、Renderer、代理和注入脚本定向测试。
- `pnpm test:html-sandbox:unit -t readFile`：单独运行匹配名称的方法测试。
- `pnpm test:html-sandbox:unit --coverage`：生成该范围的覆盖报告；不把行覆盖率当作浏览器验证。
- `pnpm test:html-sandbox:browser`：构建真实 runtime/prelude，启动临时静态 fixture 服务，用独立无头 Chrome 跑同源及跨源实例，返回非零状态表示失败，结束自动关闭服务和浏览器。
- `pnpm test:html-sandbox:examples`：打印本地地址，浏览器打开后选择实例并点击运行。修改 HTML 后重启此命令重新构建。结束按 Ctrl+C。

The default command checks the typed iframe installers, then runs focused unit/integration tests and real-browser examples.
The examples command leaves a loopback-only static server open for manual inspection.
It does not start the Magic application, require login, or call production APIs.

自动运行优先使用 Puppeteer 已安装的浏览器，没有时使用系统 Chrome；也可指定：

```sh
HTML_SANDBOX_CHROME="/absolute/path/to/chrome" pnpm test:html-sandbox:browser
```

CI 需预装 Chrome 或 Puppeteer 对应浏览器。未安装时命令明确失败，不跳过浏览器层。
生成的 shell、bundle 和 `browser-results.json`（本轮 ID/状态、逐项结果、浏览器错误、消息 trace）位于
`node_modules/.cache/html-sandbox-fixtures/`，不提交。报告在运行前重置，构建、启动、超时或清理失败也会写入本轮失败状态。

## 可运行 HTML / Executable examples

| HTML                      | 真实执行内容                                                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `fixtures/api.html`       | SDK 安装与别名、FS 文本/Blob/ArrayBuffer、列表与路径限制、Agent 消息、用户权限、DB CRUD、LLM HTTP/SSE、上传/附加/下载、并发、语言订阅、输入消息 |
| `fixtures/resources.html` | fetch、XHR、动态 script/link/img、嵌套 HTML、链接/window.open/location.href、hash 导航                                                          |
| `fixtures/storage.html`   | localStorage/sessionStorage/cookie、IndexedDB 升级/事务/读写、父端持久化及宿主隔离                                                              |
| `fixtures/devtools.html`  | 真正启用全部 DevTools 代理后执行网络和 API，transfer-list 二进制传输，关闭恢复，再次启用与防循环                                                |
| `fixtures/nested.html`    | 经真实 nested handler、HTML processor 和 srcdoc 执行的子文档                                                                                    |

这些文件是放进 Magic 沙箱的业务 HTML，不是独立 SDK 宿主页；直接双击 `api.html`
不会产生 `window.Magic`。通过本地实例页运行，才能验证真实的安装顺序与父子窗口通信。
Each example contains executable application code. The fixture host supplies the real
sandbox and bridge; do not open a child HTML file alone and interpret missing Magic as a failure.

资源只存在于 `/resolved-assets/`；原始相对路径强制返回 404。
因此移除任意 fetch/XHR/DOM 资源代理都不能靠浏览器原生加载蒙混通过。
同源用 `127.0.0.1`，跨源 shell 用 `localhost`；这是真正不同的 origin，
不是构造假的 MessageEvent。自动浏览器拒绝一切非当前端口的外部网络请求。

## 测试边界 / What is real and what is replaced

```text
HTML → production Magic prelude → native postMessage
     → React-mounted useIframeFS/LLM/Agent/UserInfo/Database/useMagicFiles
     → real service/path/permission/serialization logic
     → fixture external dependency → real response → HTML assertion
```

- `hook-host.tsx` 挂载真实 hooks 和 service。只替换后端适配器、登录态、上传下载副作用及用户授权界面。真实授权请求的 scope/reason 和顺序仍有断言。
- `host-dependencies.ts` 保存输入，`assert-dependencies.ts` 核对完整参数、真实 File 字节、项目/表/行身份、消息内容、权限时序和刷新归属。
- LLM token、模型、chat、SSE 使用真实 fetch 和解析器。静态 fixture 服务核对 HTTP method、授权、组织、模型及消息内容后才返回成功数据。
- runtime shell 使用包内生产构建脚本；prelude 使用生产 Vite 插件；full-content/fetch/nested/storage 使用源码，不替换成手写复制实现或空 prelude。
- `IsolatedHTMLRenderer*.test.tsx` 另外验证真实组件（内部 Inner 通过公共包装组件调用）的握手、过期响应、来源检查、兄弟隔离、preview/edit/PPT、隐藏、reload、卸载，以及真实 UserInfo/Database 路由。与浏览器 fixture 的 hooks 宿主互补。

The browser host is intentionally small and does not mount the whole application renderer.
Component integration runs in jsdom; native frame isolation, injected code and real hook
round-trips run in Chrome. Neither proves live backend authorization or a deployed application.

## 用例维护 / Adding a contract

1. API 方法的参数、结果、失败、超时、取消等独立契约放在对应 `magic-api/__tests__`；聚合安装和 30 种请求协议矩阵防止方法遗漏。
2. 新浏览器行为写到对应 HTML 的 `Fixture.test(name, async () => ...)`，不要只匹配生成脚本文本。
3. 外部依赖只能在明确边界替换。不能 mock 被测 hook、service、代理或直接在父端伪造业务 API 成功响应。
4. 每个新外部调用补底层参数断言；等待响应/状态而非随意 sleep；不得依赖不同网络请求的偶然完成顺序。
5. 同源/跨源共用同一 HTML；用例失败继续记录，整套命令最终失败。准备失败、超时和完成都清理 iframe、hooks 和虚拟存储登记。

## 本轮修复与后续边界 / Regressions and follow-up

真实用例已暴露并修复：虚拟存储桥被旧 Cookie/IndexedDB mock 覆盖；
StorageInspector 读取受限 getter 时整次快照异常；MessageProxy 对原生 getter 使用错误 receiver。
保持无显式虚拟存储上下文的旧 standalone 行为。

第二阶段已把 telemetry、content metrics、ServiceWorker fallback、navigation bootstrap
及三个 legacy storage fallback 提取为 `HTML/iframe-runtime` 中的 TypeScript installer。
生产与测试共用构建器生成独立 IIFE，通过转义后的 JSON 参数调用，产物不手工维护。
模块类型、行为、参数转义、全局隔离及传递依赖修改后的重编译均有独立测试。
DevTools 分别核对首次启用、关闭、再次启用时的 console/network/API 记录，避免首次记录掩盖再次启用失效。

fetch、DOM 资源代理、嵌套 iframe、完整虚拟存储桥等复杂字符串模块仍待后续逐步迁移；
先补相应失败与恢复测试，再沿用同一编译入口，不能同时改变协议和断言来迁就重构。

仍需单独设计的已知契约问题：通用 API 响应基类当前按 requestId/type 匹配，
未统一校验 source/origin；FS mutation 的声明返回 void 与运行时响应对象不一致；
部分旧文档订阅靠版本抑制而非主动卸载。本轮未改变这些协议。
目前浏览器证据只覆盖 Chrome；真实 WebView、Firefox/Safari、线上后端与实际权限弹窗未验收。
