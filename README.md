# alemonjs-quote-card（名言卡片）· ALemonJS 版

[yunzai-plugin-quote-card](https://github.com/Looking08/yunzai-plugin-quote-card) 的 **ALemonJS 移植版**。
引用一条消息发送 `#名言`，生成玻璃质感的名言卡片。

本仓库的 `alemonjs` 分支**只有插件本体**（`package.json` + `tsconfig.json` + `lvy.config.ts` + `src/`），
不含 Docker、pm2、平台凭据、应用入口等部署脚手架 —— 放到任意一个 ALemonJS 2.x 项目的 `packages/` 下即可工作。

| 分支 | 用途 |
| --- | --- |
| `main` | Yunzai 版（另一套实现） |
| `alemonjs` | 本版源码 |
| `release` | 本版的**构建产物**（`package.json` + `lib/` + README），生态市场与 `git clone` 用这个 |
| `alemonjs-release` | 旧产物分支名，内容与 `release` 同步，仅为兼容旧链接保留 |

## 与原版（Yunzai）的差异

| 能力 | Yunzai 原版 | 本版（ALemonJS） |
| --- | --- | --- |
| 运行框架 | Yunzai | ALemonJS 2.x |
| 渲染 | Yunzai 内置 puppeteer | jsxp（Playwright + Chromium），复用单个浏览器实例并串行渲染 |
| 卡片实现 | `resources/template.html` + CSS 伪元素 | React 组件（`card.tsx`），把 `:before/:after` 展开成绝对定位元素，避免截图偏移 |
| 分辨率 | 固定 1280×640 | Web 管理页可调（480×240 ~ 3840×2160）+ 画质，用 `transform: scale()` 等比缩放，改分辨率不破版 |
| 背景管理 | 发图 + 命令 | 命令 **或** Web 管理页（上传本地文件 / 填 URL / 预览 / 删除） |
| 平台 | QQ（OneBot 类） | OneBot（NapCat / Lagrange）+ QQ 官方机器人 |
| 引用消息读取 | `e.source` / `e.getReply()` | 统一解析层：OneBot 走 `ReplyId + get_msg`，QQ 官方走 `MessageContent.msg_elements` |

## 安装

> ⚠️ 只 `git clone` 到 `packages/` **不会生效**。ALemonJS 按 `package.json` 的 `apps` 列表用
> `require.resolve` 加载插件，不会扫描 `packages/` 目录。下载之后还要「链接 + 注册」。

### 方式一：预构建产物（推荐，不用装 devDependencies）

产物在 **`release` 分支**（生态市场的 Git 安装约定就是 `release`，根目录带 `package.json` 与 `lib/`）：

```bash
# 1) 下载到宿主项目的 packages/
git clone -b release --depth=1 https://github.com/Looking08/yunzai-plugin-quote-card.git ./packages/alemonjs-quote-card

# 2) 链接进 node_modules，同时装上运行期依赖 jsxp
npm i ./packages/alemonjs-quote-card

# 3) 注册到 apps（等价于在 alemon.config.yaml 里写 apps: alemonjs-quote-card: true）
alemonc add apps alemonjs-quote-card

# 4) 重启机器人
alemonc start
```

### 方式二：从源码构建

```bash
# 1) 下载源码
git clone -b alemonjs --depth=1 https://github.com/Looking08/yunzai-plugin-quote-card.git ./packages/alemonjs-quote-card

# 2) 先构建出 lib/
cd ./packages/alemonjs-quote-card && npm install && npx lvy build && cd -

# 3) 剩下的和方式一相同
npm i ./packages/alemonjs-quote-card
alemonc add apps alemonjs-quote-card
```

插件自身唯一的运行期依赖是 `jsxp`（自带 react / playwright-core），`alemonjs` 以 peerDependency 声明。
第 2 步若报 `Cannot find package 'jsxp'`，补一条 `npm i jsxp` 即可。

> 用 yarn / pnpm 的话，对应 `yarn add file:./packages/alemonjs-quote-card`，
> 或把 `"workspaces": ["packages/*"]` 写进宿主 package.json 后直接 `install`（会自动建软链）。

### 浏览器（jsxp 截图用）

jsxp 会自己探测本机浏览器，**通常不用配**：macOS 依次找 Google Chrome / Chromium / Edge，
Linux 找 `chromium` / `google-chrome`，Windows 找 Program Files 下的 Chrome / Edge。
探测不到时再用环境变量指定：

```bash
export JSXP_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

### 启动

装好后照常启动宿主项目，路由会自动注册：

```bash
node index.js --platform @alemonjs/onebot --serverPort 17117
```

> `--platform` 必须写完整包名（内部用 `require.resolve`），写 `onebot` 会报模块找不到。

## 指令

前缀 `/ # ＃ ! ！` 均可省略。

| 命令 | 说明 |
| --- | --- |
| `名言` | 引用一条消息后发送，生成名言卡片 |
| `添加名言照片` | 一次可发多张图 + 指令，按发送顺序自动排号（仅主人） |
| `添加名言照片N` | 从槽位 N 开始依次排（N 上限 100，仅主人） |
| `删除名言照片N` | 删除槽位 N 的背景（仅主人） |
| `名言照片列表` | 查看已有背景，**直接发一张缩略图总览**（默认所有人，可在管理页关闭） |
| `名言帮助` | 图片版功能说明 |

### 批量添加

```
[图1][图2][图3]  添加名言照片
→ ✅ 已保存 3 张：#1 ~ #3
[图4][图5]       添加名言照片
→ ✅ 已保存 2 张：#4 ~ #5
[图6][图7]       添加名言照片10
→ ✅ 已保存 2 张：#10 ~ #11
```

不带数字时**接在现有最大槽位后面**，所以删掉中间槽位不会让新图去填坑。
超过 100 的部分会丢弃并在回复里提示；单张失败不影响其它张。

### 列表与帮助

`名言照片列表` 生成的是一张完整的图（含总数、槽位编号、删除提示），**直接作为图片消息发出**，
不包合并转发；槽位编号固定在缩略图上层，不会被图片盖住。

`名言帮助` 用 `src/quote-card/assets/help-bg.jpg` 作背景（缺失时回退到一张用户背景图，
再没有就用深色渐变），叠加深色蒙版保证文字可读。

背景图存在 `<宿主项目 cwd>/data/quote-card/backgrounds/custom-<N>.<ext>`；
生成卡片时从已有槽位随机挑一张，一张都没有就用随机纯色玻璃卡片。

## Web 管理页

`GET /app/api/quote-card/admin`（拼在宿主项目的 HTTP 端口下）：

- 分辨率预设（1280×640 / 1920×960 / 1080×540 / 2560×1280）或手填宽高 + 画质
- 「照片列表允许所有人查看」开关（默认开启，关闭后只有主人能用 `名言照片列表`）
- 实时预览
- 背景图上传（本地文件或 URL）、缩略图列表、删除
- 设置持久化在 `data/quote-card/settings.json`

> ⚠️ 管理页**没有鉴权**。宿主项目若对公网开放，请自行在反向代理上加 Basic Auth / token，
> 或把监听端口绑到 `127.0.0.1`。

HTTP API（统一返回 `{code, message, data}`）：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/quote-card/settings` | 读取设置（含 `listPublic`） |
| POST | `/api/quote-card/settings` | 写入 `{width, height, quality, listPublic}` |
| GET | `/api/quote-card/backgrounds` | 已用槽位列表 |
| POST | `/api/quote-card/backgrounds` | 上传（`{slot, dataUrl}`） |
| POST | `/api/quote-card/backgrounds/url` | 按 URL 抓取保存 |
| GET | `/api/quote-card/backgrounds/:slot` | 取该槽位图片 |
| DELETE | `/api/quote-card/backgrounds/:slot` | 删除该槽位 |
| POST | `/api/quote-card/preview` | 用给定文本/背景生成预览图 |

## 平台差异与已知限制

**OneBot（NapCat / Lagrange）** —— 推荐用于署名准确的场景。
`get_msg` 能拿到被引用消息的 QQ 号、群名片、昵称、正文、图片；头像走 `q1.qlogo.cn` 的 QQ 号头像，全部真实。

**QQ 官方机器人** —— 能用，但受官方协议限制：

1. **拿不到被引用消息的作者**。平台只在 `msg_elements` 里下发正文和附件，不带 `author`。
   代码会回退到「发命令的人」的头像和昵称，再取不到就显示「匿名」。
2. **openid 不是 QQ 号**，头像是 `https://q.qlogo.cn/qqapp/{AppID}/{openid}/640` 拼出来的
   （代码按「是否纯数字」在两种头像接口间自动切换，AppID 优先取事件里的 `BotId`，
   取不到时读宿主配置里的 `qq-bot.app_id`）。
3. **主人要在宿主配置的 `qq-bot.master_id` 里写 openid**，写 QQ 号对官方机器人无效；
   而且群聊里每个群的 `member_openid` 各不相同，要按场景逐个追加。
4. 引用 id 常是 `TMP_xxx` 这类临时值，匹配不上时会退回到「最后一个带内容的元素」。

## 目录结构

```
.
├── package.json              # name/main/exports；运行期依赖仅 jsxp
├── tsconfig.json
├── lvy.config.ts             # 构建配置（无 CSS/Tailwind 处理，纯 TS/TSX）
├── LICENSE
└── src/
    ├── index.ts              # 注册消息路由 + koaRouter（HTTP 管理页）
    ├── env.d.ts              # 类型引用
    └── quote-card/
        ├── index.ts          # 正则路由（名言 / 添加 / 删除 / 照片列表 / 帮助）
        ├── run.ts            # 名言主流程
        ├── add-bg.ts         # 批量添加背景（仅主人）
        ├── del-bg.ts         # 删除背景（仅主人）
        ├── list-bg.ts        # 照片列表：渲染缩略图总览并直接发图
        ├── list-page.tsx     # 列表页 React 组件（由 Yunzai 的 list.html 迁移）
        ├── help.ts           # 图片版帮助
        ├── help-page.tsx     # 帮助页 React 组件（由 Yunzai 的 help.html 迁移）
        ├── assets/           # 帮助页背景图
        ├── quoted.ts         # 跨平台引用消息解析（OneBot / QQ 官方）
        ├── card.tsx          # React 卡片组件
        ├── service.ts        # 渲染引擎、背景存取、头像地址
        ├── settings.ts       # 分辨率 / 列表公开开关的读写与钳制
        ├── admin.ts          # 管理页 HTML（零构建，原生 JS）
        └── http.ts           # /api/quote-card/* 接口
```

## License

与原仓库一致，见 [LICENSE](LICENSE)。
