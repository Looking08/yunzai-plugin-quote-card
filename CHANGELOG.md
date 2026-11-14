# 更新日志

## v1.1.6

### 修复

- **彻底解决「别人装完插件用不了」**：不再要求本机预装浏览器。
  v1.1.5 只是把写死的路径换成自动探测 —— 探测得再准，机器上没装 Chrome / Chromium / Edge
  一样出不了图（容器里没装 chromium、Windows 精简版、某些 VPS 全都属于这一类）。

  现在出图链路换成**内置引擎优先**（新增 `src/quote-card/renderer.ts`）：

  | 顺序 | 引擎 | 说明 |
  | --- | --- | --- |
  | 1 | `@pixel.js/shotium` | 随 npm 包安装的 Blink + Skia 内核，8 个平台预编译（含 Alpine musl）。不执行 JS、不需要 root、不需要系统装浏览器 |
  | 2 | 本机 Chromium | 内置引擎装不上或运行时崩了自动回退，保持原有能力 |

  渲染层被抽成统一入口 `renderImage()`：卡片（`selector: 'body'`）、帮助图 / 列表图
  （`fullPage`）、缩略图（`selector: 'img'`）三条链路共用，两个后端都实现了同样的语义。

- **缩略图不再依赖 JS**：原来靠 `page.evaluate` 量原图尺寸算缩放，内置引擎没有 V8 用不了；
  改成 CSS 的 `max-width` / `max-height`（保持比例）+ 按元素盒子截图，效果一致且更快。

- **卡片背景改用 `file://` 直读**：以前把原图转成 base64 内嵌进 HTML（12MB 的图 ≈ 16MB 字符串），
  编译、落盘、解析都要为这几十 MB 买单。实测同一张图：
  `file://` 直读 1201ms，内嵌 base64 2832ms + 编译 330ms，**输出字节完全一致**。
  背景与 Expose 的 `background` 槽位都走这条路，`allowFileAccess` 只在用到本地图片时打开。

- **长图高度还原**：内置引擎的 `fullPage` 取 `max(文档高度, 视口高度)`，视口给 900 时
  内容只有 530 的列表页会带一大片空白。改为用小视口（200）探测，拿到真正的内容高度。

- **头像下载加 5 秒超时**：`q1.qlogo.cn` 慢的时候会把整张卡片拖到十几秒；现在超时就当没有头像，
  卡片照常出。`data:` / `file:` 开头的地址直接跳过下载。

- **管理台地址前缀写错**：文档一直写 `/app/api/quote-card/admin`，那是「插件被注册进主应用」
  时的路径。插件按推荐方式作为独立应用加载（`alemonc add apps alemonjs-quote-card`）时，
  ALemonJS 会加应用名前缀，实际是 `/apps/alemonjs-quote-card/api/quote-card/admin`；
  照旧地址访问只会得到 `{"code":403,"message":"非法路径"}`。README 与源码注释已按加载方式
  分别说明，管理页内请求都是相对路径，两种挂载下都能直接用。

- **出图失败提示不再指向 chromium**：`帮助图生成失败，请检查 chromium 是否正常` 在默认走内置
  引擎后已经误导人，改为指向日志里的 `[名言卡片]` 提示。另外把 `QUOTE_CARD_RENDER_ENGINE=chromium`
  但机器上没有浏览器的情况单独拆出来——原来会报「内置引擎装不上」（其实装好了，是被自己关掉的），
  现在直接告诉你去掉这个设置即可。

- **渲染快了一个数量级**：同一张 1280×640 卡片（含 585KB 背景图）实测
  Chromium 冷启 10.3s / 内置引擎 1.2s；热渲染 11~460ms。
  两者输出经像素比对：平均通道差 1.4/255，差异 >32 的像素占比 0.00%。

- **不再往用户家目录写缓存**：引擎以 `cacheDir: null` 启动（只渲染本地文件与 data URL，
  用不上 HTTP 缓存），空闲 5 分钟 `releaseMemory({ releaseWorkingSet: true })` 归还工作集。

### 变更

- 出图引擎可用环境变量 / 配置强制指定：`QUOTE_CARD_RENDER_ENGINE=shotium|chromium`，
  或 `alemon.config.yaml` 的 `quote-card.render_engine`。
- 启动自检改为 `[名言卡片] 渲染引擎: shotium（内置 Blink，无需另装浏览器）`，
  回退时显示实际使用的浏览器路径；两者都没有时提出可照做的结论。
- `optionalDependencies` 引入 `@pixel.js/shotium`：装不上只会少一个后端，不会让插件安装失败。
- README 新增「出图引擎」一节，补充**中文字体是唯一系统要求**（`font-noto-cjk`）与报错对照表。
- 排查性能问题：`QUOTE_CARD_DEBUG=1`（或 `touch /tmp/quote-card-debug`）会在日志里打出
  编译 / 落盘 / 截图 / 排队各阶段耗时。

## v1.1.5

### 修复

- **别人装完就报 `executable doesn't exist at /usr/bin/chromium-browser`**：
  之前把容器里的路径当默认值写死（`process.env.JSXP_EXECUTABLE_PATH || … || '/usr/bin/chromium-browser'`），
  于是 macOS、Windows、非 Debian 发行版全都在出图时报这个错 —— 只在我这台机器上「能用」。

  现在改为**自动探测**（新增 `src/quote-card/browser.ts`），顺序是：
  环境变量 → `PATH` 里的命令名 → 各平台标准安装路径（macOS 的 `.app`、Windows 的 Program Files、
  Linux 的 `/usr/bin` `/snap/bin` `/opt`）→ playwright / puppeteer 下载缓存。
  探到的路径同时用于两条渲染链路：jsxp 的 `Playwright`（卡片）与直接 `playwright-core`（帮助图/列表图）。

- **环境变量填错不再一错到底**：指向不存在的文件时会被跳过（继续探测），不会把整个出图卡死。

- **报错说人话**：没有浏览器时回复
  `未找到可用的浏览器：装一个 Chrome / Chromium / Edge 即可，或设置 JSXP_EXECUTABLE_PATH 指定路径`，
  完整的多行安装指引（apt / apk / dnf / `npx playwright-core install chromium`）写进日志。

- **启动自检**：插件加载时先打一行 `[名言卡片] 渲染浏览器: <路径>`；
  找不到就打 `⚠️` 开头的指引，不用等用户发第一条指令才发现问题。

## v1.1.4

### 新增

- **Expose 插件间共享能力（类 MCP）**：`defineChildren().register()` 现在会带出
  `expose`，协议名 `quote-card`，共 9 个动作 ——
  `get_help` / `render_card` / `render_help` / `render_gallery` / `list_backgrounds` /
  `get_settings` / `set_settings` / `add_background` / `delete_background`。
  出图类动作返回 JPEG data URL，其余返回 JSON 字符串，统一 `{status, text, image, data}`
  外壳；业务失败落 `status: 'error'` 不抛异常，只有权限失败才抛。
  消费示例与配置见 README「插件间共享：Expose」一节。
- **双版本兼容**：运行期探测 `Expose.action` 是否存在 ——
  有（alemonjs 2.1.12x）就生成带 `inputSchema` / `outputSchema` / `effect` / `authorize`
  的新式动作；没有（2.1.11x）退回 `{ description, params, returns, handler }`，
  入参与权限校验在 handler 内部兜底。框架完全不提供 `Expose` 时自动跳过该字段，不影响插件加载。
- **写操作默认仅主人**：`set_settings` / `add_background` / `delete_background` 会校验
  当前消息事件的 `IsMaster`，可用 `quote-card.expose.require_master_for_write: false` 放开；
  另有 `enabled` 总开关与 `allowed_callers` 白名单。

## v1.1.3

### 修复

- **报错被截断到 50 字符，看不出真正原因**：`❌ 帮助图生成失败: ...` 之前对 `err.message`
  做了 `slice(0, 50)`，于是
  `browserType.launch: Failed to launch chromium because executable doesn't exist at ...`
  只剩半句 `...chromium beca`。现在保留 180 字符，日志里记完整 `stack`。
- **Chromium 启动失败直接放弃**：改为失败后 800ms 重试一次（Docker 刚重启、资源临时紧张时能自救）；
  两次都失败时，把原因翻译成中文建议一起返回 ——
  可执行文件缺失 / 依赖缺失 / 磁盘写满 / 内存不足 / 启动超时 / 进程崩溃。
- **浏览器半死会持续失败**：检测到 `Target closed` / `has been closed` / `crash` /
  `Protocol error` 之类错误时主动丢弃浏览器实例，下次渲染自动重建
  （之前要等 5 分钟空闲回收才会重建）。

## v1.1.2

### 修复

- **`名言照片列表` 渲染超时**：`page.setContent: Timeout 60000ms exceeded`。
  列表页把每张背景都转成 base64 内嵌进 HTML，背景一多 HTML 就涨到几十 MB
  （5 张原图共 43MB ≈ 57MB 字符串），`setContent` 传不动，60 秒必超时。

  改法两条：
  1. HTML 里只放 `file://` 路径，HTML 落到临时文件后用 `page.goto` 打开，
     浏览器自己去读本地文件，传输量从几十 MB 降到几 KB；
  2. 给每张背景生成 480px 缩略图缓存（`backgrounds/.thumbs/`，用 Chromium 自己解码缩放，
     不额外依赖 sharp / ffmpeg），列表页只渲染小图，添加背景时顺手预热。

  实测 5 张（43MB）从「>60s 超时」降到 2~4 秒。

## v1.1.1

### 修复

- **QQ 官方机器人「带图 + 命令」无法触发**：qq-bot 会把附件拼成标签放在正文前面，
  形如 `<attachmentType="image/jpeg",attachmentIndex=0,description="...">添加名言照片`。
  alemon 的路由是按整段原文（`MessageText`）整句匹配的，且不会剥掉这些标签，
  于是 `添加名言照片` 一发图就匹配失败（`Reason:filtered`），表现就是「发指令没反应」。
  现在 5 条命令的正则都允许首尾出现若干 `<...>` 标签：

  ```ts
  const TAG = '<[^>]*>';
  const LEAD = `(?:\\s*${TAG})*\\s*`;
  const TAIL = `(?:\\s*${TAG})*`;
  const route = (body: string) => new RegExp(`^${LEAD}${PREFIX}${body}${TAIL}$`);
  ```

  纯文字命令（`名言`、`名言帮助`、`名言照片列表`）行为不变；
  `添加名言照片N` 的槽位号仍然只认末尾数字，不会被 `attachmentIndex=0` 干扰。

## v1.1.0

与 Yunzai 版 v1.2.0 功能对齐。

### 新增指令

- **`名言照片列表`** —— 缩略图总览页（React 组件 `list-page.tsx`），
  **直接以图片消息发出**，不包合并转发；槽位编号浮在图片上层。
  默认所有人可看，设置里可关。
- **`名言帮助`** —— 图片版功能说明（`help-page.tsx`），
  背景优先用 `assets/help-bg.jpg`（构建时随包复制），缺失时回退到一张用户背景图，再没有就用深色渐变。

### 批量添加背景

`添加名言照片` 支持一次多图，不写数字按顺序接在末尾；写数字则从该槽位起连续占用。
上限 100，超出提示，单张失败不中断。

### 设置项

`data/quote-card/settings.json` 新增 `listPublic`（默认 `true`），
Web 管理页「输出分辨率」下方多了一个开关；关闭后非主人发 `照片列表` 静默无响应。

### 修复

- **页面被裁右侧**：React 内联样式没有继承原 HTML 的 `* { box-sizing: border-box }`，
  `padding` 会把固定宽度的容器撑宽导致截图裁边，已在列表页/帮助页显式声明。
- **渲染视口过窄**：`renderPage` 显式传 `playwright.context.viewport`，
  否则窄页面（如 1000px 帮助页）会被默认视口裁掉右边。
- `assets/help-bg.jpg` 权限修正为 644（原先 600，非 root 运行读不到）。

## v1.0.1

- 产物分支改为 `release`，匹配生态 Git 安装约定
- 修正安装步骤说明

## v1.0.0

- 首个版本：`名言` 生成卡片、`添加名言照片N` / `删除名言照片N` 管理背景
- Web 管理页：分辨率、画质、背景上传/预览/删除
