# 更新日志

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
