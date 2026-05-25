---
name: html-api-sdk
description: "Guide for using window.Magic.* APIs in SuperMagic HTML micro-apps, covering file system (fs), LLM calls (llm), and Agent interaction. Use when user wants to create an HTML micro-app that reads/writes workspace files, calls LLM models, streams AI responses, listens for file changes, or communicates with the Agent. Also use when user says 'create an HTML app', 'read workspace files in HTML', 'call LLM from HTML', 'stream AI output in HTML', 'notify Agent from HTML', 'build a dashboard micro-app', or needs general HTML runtime APIs."
description-cn: "SuperMagic HTML 微应用 window.Magic API 使用指南，涵盖文件系统读写、大模型调用（单次/流式）、Agent 交互等能力。当用户需要在 HTML 中读写工作区文件、调用 LLM、与 Agent 通信时加载本 skill。"
---

# window.Magic API — HTML 微应用开发指南

本 skill 指导在 SuperMagic workspace 中开发 HTML 微应用时，正确使用 `window.Magic.*` 系列 API。

---

## 重要约束（必须遵守）

1. 这些 API **仅在 SuperMagic workspace 中打开的 HTML 文件里有效**，无需引入任何外部脚本。
2. 所有文件路径以**应用根目录**（`index.html` 所在目录）为基准，**禁止使用 `../` 穿越到上级目录**。
3. `window.Magic.llm` 的 token 由宿主托管，HTML 内无法直接获取 `api_key`；直接调用方法即可。
4. 文件写入后，若需要让 Agent 感知到数据变化，调用 `window.Magic.setInputMessage()` 通知 Agent。
5. **禁止使用内联事件**（`onclick` 等属性），所有事件绑定必须在 JS 中用 `addEventListener` 完成。

## Micro-app runtime conventions

- HTML micro-apps may use Tailwind CDN (`https://cdn.tailwindcss.com`) for layout, spacing, colors, responsiveness, and basic visual polish.
- Do not introduce Tailwind build steps, npm dependencies, frontend frameworks, or third-party component libraries from this skill.
- Keep business logic in native JavaScript. Tailwind classes should improve presentation, not hide state, data access, or event logic.
- Simple pages may keep CSS and JavaScript in the page. Multi-page apps or apps with shared logic may use shared CSS/JS files.
- One real page should map to one `.html` file. Reusable component `.html` files are appropriate only when they are truly reused by multiple pages.
- A micro-app should be lightweight, but it should still feel like a complete small product. For short requests, use the approved plan's product expansion instead of building a minimal demo. Only build the smallest possible version when the user explicitly asks for a minimal or simplest app.

## Project memory: `HTML-APP.md`

- A workspace contains one HTML micro-app. The workspace-root `HTML-APP.md` is the project memory document for future iterations.
- Before creating or modifying a micro-app, read `HTML-APP.md` if it exists. If it does not exist, treat the task as a new micro-app.
- HTML pages must not read `HTML-APP.md`; it is for the agent's development workflow only.
- Ordinary project-memory sections such as App Overview, Entry and Files, Features, Runtime Notes, 铁律, and Iteration History should be updated once before the development task ends by calling `update_html_app_memory`, based only on what was truly completed.
- Do not use file-editing tools to modify `HTML-APP.md` directly. Use the dedicated memory tool so project memory is updated consistently.

---

## 一、文件系统 API（`window.Magic.fs`）

### 读取文件 `readFile(path)`

```javascript
const raw = await window.Magic.fs.readFile("data/users.json");
const users = JSON.parse(raw);

const markdown = await window.Magic.fs.readFile("README.md");
```

- **参数**：`path: string` — 相对于应用根目录的路径
- **返回**：`Promise<string>` — 文件文本内容
- **限制**：单文件最大 5 MB；文件不存在则 reject

### 写入文件 `writeFile(path, content)`

```javascript
await window.Magic.fs.writeFile(
  "data/users.json",
  JSON.stringify(data, null, 2),
);
await window.Magic.fs.writeFile("output/report.md", markdownContent);
```

- **参数**：`path: string`, `content: string`
- **返回**：`Promise<void>`
- **说明**：文件已存在时覆盖；路径中的目录无需提前创建

> **⚠️ 路径对照说明（常见踩坑）**
>
> `writeFile` 的路径是**相对于 `index.html` 所在目录**，而不是工作区根目录。
>
> | HTML 文件位置          | 写入路径           | 实际保存位置（工作区）    |
> | ---------------------- | ------------------ | ------------------------- |
> | `my-app/index.html`    | `report.md`        | `my-app/report.md`        |
> | `my-app/index.html`    | `output/report.md` | `my-app/output/report.md` |
> | `index.html`（根目录） | `report.md`        | `report.md`               |
>
> **禁止使用 `../` 穿越到上级目录**（会被拦截）。若希望文件出现在工作区根目录，需将 `index.html` 也放在根目录，或在提示中注明实际保存位置（如 `已保存至 my-app/report.md`）。

### 列出目录文件 `listFiles(dir?)`

```javascript
const rootFiles = await window.Magic.fs.listFiles(); // 根目录
const dataFiles = await window.Magic.fs.listFiles("data/"); // 子目录
```

- **参数**：`dir?: string` — 默认 `"./"`
- **返回**：`Promise<string[]>` — 文件名列表（不含路径前缀）

### 监听文件变更 `watchFile(path, callback)`

```javascript
const unwatch = window.Magic.fs.watchFile("data/orders.json", async (event) => {
  console.log("文件已更新：", event.path, event.timestamp);
  const fresh = JSON.parse(await window.Magic.fs.readFile("data/orders.json"));
  renderTable(fresh);
});
// 停止监听：unwatch()
```

- **参数**：`path: string`, `callback: (e: { path: string; timestamp: number }) => void`
- **返回**：`() => void` — 调用即停止监听
- **说明**：主站约 3 秒轮询一次；每个应用最多同时监听 **10 个路径**

### 并发读取（推荐）

```javascript
const [users, orders, settings] = await Promise.all([
  window.Magic.fs.readFile("data/users.json").then(JSON.parse),
  window.Magic.fs.readFile("data/orders.json").then(JSON.parse),
  window.Magic.fs.readFile("config/settings.json").then(JSON.parse),
]);
```

---

## 二、大模型 API（`window.Magic.llm`）

### 获取可用模型列表 `getModels()`

```javascript
const models = await window.Magic.llm.getModels();
// → [{ id: "gpt-4o", object: "model", owned_by: "openai" }, ...]
const modelIds = models.map((m) => m.id);
```

- **返回**：`Promise<Array<{ id: string; object?: string; owned_by?: string }>>`

> **⚠️ model 字段必须传值，默认使用 `"auto"`**
>
> `model` 参数**不能省略、不能为空字符串**。若用户未指定模型，必须显式传入 `"auto"`，系统将自动选择合适的模型：
>
> ```javascript
> // ✅ 正确：用户未选择时显式传入 "auto"
> const modelId = selectedModel || "auto"; // 绝不能是空字符串或 undefined
> window.Magic.llm.stream(messages, onChunk, { model: modelId });
> window.Magic.llm.chat(messages, { model: modelId });
>
> // ❌ 错误：省略 model 字段或传空值
> window.Magic.llm.stream(messages, onChunk, { maxTokens: 1500 }); // 禁止
> window.Magic.llm.chat(messages, { model: "" }); // 禁止
> ```
>
> 在模型选择 UI 中，**必须**将「自动选择（Auto）」作为列表第一项且默认选中：
>
> ```javascript
> // 加载模型列表后，在顶部插入默认选项
> const autoItem = { id: "auto", label: "自动选择（推荐）" };
> [autoItem, ...models].forEach((m) => renderModelItem(m.id, m.label || m.id));
> // 确保 select 初始值为 "auto"
> document.getElementById("model-select").value = "auto";
> ```

### 单次对话 `chat(messages, options?)`

```javascript
// 基础用法
const reply = await window.Magic.llm.chat([
  { role: "user", content: "用一句话总结：太阳系有几颗行星？" },
]);

// 携带系统提示和历史上下文
const reply2 = await window.Magic.llm.chat([
  { role: "system", content: "你是一位数据分析专家，请用简洁的中文回答。" },
  { role: "user", content: "上个月销售额同比增长了 15%，这意味着什么？" },
]);

// 指定模型和参数
const reply3 = await window.Magic.llm.chat(
  [{ role: "user", content: "写一首关于秋天的五言绝句。" }],
  { model: "gpt-4o", temperature: 0.9, maxTokens: 200 },
);
```

**options 参数说明：**

| 参数           | 类型      | 说明                                       |
| -------------- | --------- | ------------------------------------------ |
| `model`        | `string`  | **必填**，指定模型 ID；未选择时传 `"auto"` |
| `temperature`  | `number?` | 温度（0~2，越高越随机）                    |
| `maxTokens`    | `number?` | 最大输出 token 数                          |
| `systemPrompt` | `string?` | 等价于在消息列表首部插入 `system` 消息     |

- **返回**：`Promise<string>` — 模型回复内容（纯文本）
- **超时**：120 秒无响应自动 reject

### 流式对话 `stream(messages, onChunk, options?)`

逐 token 接收响应，适合长文本生成，用户能看到实时输出。

```javascript
let fullText = "";
const outputEl = document.getElementById("output");

const cancel = window.Magic.llm.stream(
  [{ role: "user", content: "请写一篇关于人工智能发展的 500 字文章。" }],
  (delta, done) => {
    fullText += delta;
    outputEl.textContent = fullText;
    if (done) console.log("生成完成，共", fullText.length, "字");
  },
  { model: "gpt-4o", maxTokens: 1000 },
);

// 取消流式输出
document.getElementById("cancel-btn").addEventListener("click", () => cancel());
```

- **`onChunk`**：`(delta: string, done: boolean) => void`，`done=true` 表示结束
- **返回**：`() => void` — 取消函数，调用后立即停止接收

---

## 三、Agent 交互 API

### 向 Agent 发消息 `setInputMessage(msg)`

将消息填入输入框并自动发送，触发 Agent 继续执行。

```javascript
await window.Magic.fs.writeFile("output/analysis.json", JSON.stringify(result));
window.Magic.setInputMessage(
  "数据分析已完成，请根据 output/analysis.json 生成可视化图表",
);
```

### 触发刷新 `reload()`

通知 Agent 刷新或重新执行当前任务。

```javascript
window.Magic.reload();
```

### 上传文件到工作区 `uploadFiles(files)`

```javascript
const input = document.createElement("input");
input.type = "file";
input.addEventListener("change", async () => {
  await window.Magic.uploadFiles(Array.from(input.files));
});
input.click();
```

### 下载 workspace 文件 `downloadFiles(paths)`

```javascript
await window.Magic.downloadFiles(["output/report.pdf", "data/export.csv"]);
```

### 将文件附加到输入框 `addFilesToMessage(files)`

```javascript
window.Magic.addFilesToMessage(files); // 返回 void
```

---

## 四、错误处理最佳实践

```javascript
// fs 错误处理
try {
  const content = await window.Magic.fs.readFile("data/config.json");
  return JSON.parse(content);
} catch (err) {
  if (err.message.includes("not found")) {
    return { theme: "light", lang: "zh" }; // 文件不存在，使用默认值
  }
  console.error("读取配置失败：", err);
  throw err;
}

// llm 超时/失败处理
try {
  const reply = await window.Magic.llm.chat(messages, { maxTokens: 500 });
  return reply;
} catch (err) {
  if (err.message.includes("timed out")) return "请求超时，请重试。";
  return "调用失败：" + err.message;
}

// stream 错误：onChunk 以 done=true 通知结束（含出错情况）
window.Magic.llm.stream(messages, (delta, done) => {
  buffer += delta;
  if (done) finalize(buffer);
});
```

---

## 五、完整示例模板

### 示例 A：读数据 → LLM 分析 → 写回结果 → 通知 Agent

```html
<!DOCTYPE html>
<html lang="zh">
  <head>
    <meta charset="UTF-8" />
    <title>数据分析助手</title>
  </head>
  <body>
    <button id="analyze">开始分析</button>
    <pre id="output">等待分析...</pre>

    <script>
      document.getElementById("analyze").addEventListener("click", async () => {
        const output = document.getElementById("output");
        output.textContent = "读取数据中...";

        // 1. 并发读取数据
        const [users, orders] = await Promise.all([
          window.Magic.fs.readFile("data/users.json").then(JSON.parse),
          window.Magic.fs.readFile("data/orders.json").then(JSON.parse),
        ]);

        output.textContent = "调用 LLM 分析中...";

        // 2. 流式调用 LLM
        let analysis = "";
        await new Promise((resolve) => {
          window.Magic.llm.stream(
            [
              {
                role: "user",
                content: `请分析以下数据并给出业务建议：\n用户数：${users.length}\n订单总额：${orders.reduce((s, o) => s + o.amount, 0)}`,
              },
            ],
            (delta, done) => {
              analysis += delta;
              output.textContent = analysis;
              if (done) resolve(null);
            },
            { maxTokens: 500 },
          );
        });

        // 3. 写回分析结果
        await window.Magic.fs.writeFile("output/analysis.md", analysis);

        // 4. 通知 Agent
        window.Magic.setInputMessage(
          "分析完成，结果已写入 output/analysis.md，请生成图表",
        );
      });
    </script>
  </body>
</html>
```

### 示例 B：实时监听 Agent 写入数据并自动刷新界面

```html
<!DOCTYPE html>
<html lang="zh">
  <head>
    <meta charset="UTF-8" />
    <title>实时数据看板</title>
  </head>
  <body>
    <div id="dashboard">加载中...</div>

    <script>
      async function render() {
        const data = JSON.parse(
          await window.Magic.fs.readFile("data/metrics.json"),
        );
        document.getElementById("dashboard").innerHTML = `
        <h2>实时指标</h2>
        <p>总用户：${data.totalUsers}</p>
        <p>今日活跃：${data.dailyActive}</p>
        <p>更新时间：${new Date(data.updatedAt).toLocaleString()}</p>
      `;
      }

      render().catch(console.error);

      // 监听 Agent 对数据文件的更新
      window.Magic.fs.watchFile("data/metrics.json", () => {
        render().catch(console.error);
      });
    </script>
  </body>
</html>
```

### 示例 C：让用户选择模型并流式对话

```html
<!DOCTYPE html>
<html lang="zh">
  <head>
    <meta charset="UTF-8" />
    <title>模型对话</title>
  </head>
  <body>
    <select id="model-select">
      <option>加载中...</option>
    </select>
    <textarea id="input" placeholder="输入消息..."></textarea>
    <button id="send">发送</button>
    <button id="cancel" disabled>取消</button>
    <div id="output"></div>

    <script>
      let cancelStream = null;

      window.Magic.llm.getModels().then((models) => {
        const sel = document.getElementById("model-select");
        // 顶部插入「自动选择」作为默认选项
        const autoOpt = `<option value="auto" selected>自动选择（推荐）</option>`;
        sel.innerHTML =
          autoOpt +
          models
            .map((m) => `<option value="${m.id}">${m.id}</option>`)
            .join("");
      });

      document.getElementById("send").addEventListener("click", async () => {
        const content = document.getElementById("input").value.trim();
        if (!content) return;

        const output = document.getElementById("output");
        output.textContent = "";
        document.getElementById("cancel").disabled = false;

        const model = document.getElementById("model-select").value || "auto"; // 确保不为空
        cancelStream = window.Magic.llm.stream(
          [{ role: "user", content }],
          (delta, done) => {
            output.textContent += delta;
            if (done) {
              document.getElementById("cancel").disabled = true;
              cancelStream = null;
            }
          },
          { model },
        );
      });

      document.getElementById("cancel").addEventListener("click", () => {
        cancelStream?.();
        cancelStream = null;
        document.getElementById("cancel").disabled = true;
      });
    </script>
  </body>
</html>
```

---

## 六、API 速查表

| API                                             | 说明               | 返回                     |
| ----------------------------------------------- | ------------------ | ------------------------ |
| `window.Magic.fs.readFile(path)`                | 读取文件文本       | `Promise<string>`        |
| `window.Magic.fs.writeFile(path, content)`      | 写入/创建文件      | `Promise<void>`          |
| `window.Magic.fs.listFiles(dir?)`               | 列出目录文件       | `Promise<string[]>`      |
| `window.Magic.fs.watchFile(path, cb)`           | 监听文件变更       | `() => void`（取消函数） |
| `window.Magic.llm.getModels()`                  | 获取可用模型       | `Promise<Model[]>`       |
| `window.Magic.llm.chat(msgs, opts?)`            | 单次对话           | `Promise<string>`        |
| `window.Magic.llm.stream(msgs, onChunk, opts?)` | 流式对话           | `() => void`（取消函数） |
| `window.Magic.setInputMessage(msg)`             | 向 Agent 发消息    | `void`                   |
| `window.Magic.reload()`                         | 触发 Agent 刷新    | `void`                   |
| `window.Magic.uploadFiles(files)`               | 上传文件到工作区   | `Promise<unknown>`       |
| `window.Magic.downloadFiles(paths)`             | 下载工作区文件     | `Promise<unknown>`       |
| `window.Magic.addFilesToMessage(files)`         | 将文件附加到输入框 | `void`                   |
