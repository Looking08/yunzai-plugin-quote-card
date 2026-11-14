/**
 * 出图引擎（可切换的两套后端）
 *
 * 为什么要做这一层：
 *   卡片、帮助图、列表图这三条链路，之前都直接依赖本机装好的 Chromium。
 *   于是「我自己机器能跑」并不等于「别人装完插件能用」——没装浏览器、装了但不在
 *   `/usr/bin/chromium-browser`、容器里根本没 chromium，都会直接报
 *     Failed to launch chromium because executable doesn't exist
 *   v1.1.5 靠四级路径探测缓解了一部分，但「本机压根没浏览器」仍然无解。
 *
 * 现在的策略是**优先用内置引擎**：
 *   1. shotium（`@pixel.js/shotium`）：随 npm 包一起装下来的 Blink + Skia 内核，
 *      不需要 V8、不需要系统装浏览器、不需要 root、不挑 glibc/musl（8 个平台预编译包）。
 *      冷启约 1s、单张 10~500ms，比 Chromium 快一个数量级，常驻内存也小得多。
 *      它不执行 JS —— 本插件的卡片与页面都是纯静态 HTML/CSS，用不上 JS，
 *      唯一的例外是缩略图缩放，已改成纯 CSS（max-width/max-height + 元素截图）。
 *   2. Chromium（playwright-core）：shotium 装不上、加载不了（平台没有预编译包）或
 *      运行时崩了，就自动退回原来的链路，装了 Chrome/Chromium/Edge 的机器照常可用。
 *
 * 选择顺序可用环境变量 / 配置强制指定：
 *   QUOTE_CARD_RENDER_ENGINE=shotium  只认内置引擎（不装浏览器也能跑）
 *   QUOTE_CARD_RENDER_ENGINE=chromium 只用本机浏览器（想用系统 Chrome 的新特性时）
 *   默认 auto：能内置就内置，不行再找浏览器。
 */
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getConfigValue } from 'alemonjs';
import { cleanError, executableEnvKeys, launchErrorHint, resolveBrowserPath } from './browser';

/** 后端名 */
export type RenderEngine = 'shotium' | 'chromium';

/** 一次渲染请求：给 HTML 字符串（临时落盘）或给现成的 HTML 文件 */
export type RenderRequest = {
  /** 已编译好的 HTML，与 file 二选一 */
  html?: string;
  /** 已存在的 HTML 文件路径，与 html 二选一 */
  file?: string;
  /** 只截第一个匹配元素的盒子（卡片取 body，缩略图取 img） */
  selector?: string;
  /** 截整篇文档（帮助图、列表图这类长图） */
  fullPage?: boolean;
  /** 排版视口宽高 */
  viewport: { width: number; height: number };
  /** JPEG 质量 1~100 */
  quality: number;
  /** 允许页面读本地文件（页面里用 file:// 引图片时才需要） */
  allowFileAccess?: boolean;
};

const CONFIG_KEY = 'quote-card';
const ENV_KEY = 'QUOTE_CARD_RENDER_ENGINE';

/** 读插件配置里的同名开关 */
const configEngine = (): string => {
  try {
    const cfg = (getConfigValue() as any) ?? {};
    const value = cfg?.[CONFIG_KEY]?.render_engine ?? cfg?.[CONFIG_KEY]?.renderEngine ?? '';
    return String(value).trim().toLowerCase();
  } catch {
    return '';
  }
};

/** 用户希望用哪个后端 */
export const enginePreference = (): 'auto' | 'shotium' | 'chromium' => {
  const raw = (process.env[ENV_KEY] ?? '').trim().toLowerCase() || configEngine();
  if (!raw || raw === 'auto') return 'auto';
  if (raw === 'chromium' || raw === 'playwright' || raw === 'browser' || raw === 'chrome') return 'chromium';
  if (raw === 'shotium' || raw === 'builtin' || raw === 'internal') return 'shotium';
  return 'auto';
};

const clampQuality = (q: number) => Math.min(100, Math.max(1, Math.round(Number(q) || 90)));

/** 串行化渲染：两套后端都不太喜欢并发开一堆文档，且顺序输出对用户更可预期 */
let queue: Promise<unknown> = Promise.resolve();

const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
};

/* ------------------------------------------------------------------ *
 * shotium（内置引擎）
 * ------------------------------------------------------------------ */

/** 用拼接绕开打包器的静态分析：没装这个包时构建照常通过，运行期才发现 */
const SHOTIUM_SPECIFIER = ['@pixel.js', 'shotium'].join('/');

let shotium: any = null;
/** unknown = 还没试过；ready = 可用；absent = 装不上/加载不了/崩过，别再试 */
let shotiumState: 'unknown' | 'ready' | 'absent' = 'unknown';
let shotiumReason = '';
let shotiumStarted = false;

/** 引擎级失败的特征（缺动态库、ABI 不匹配、原生模块加载失败）；用这些判断要不要永久放弃 shotium */
const ENGINE_BROKEN = /cannot open shared object|dlopen|\.node['"\s]|NAPI|invalid ELF|not a valid Win32|undefined symbol|libstdc|GLIBC|GLIBCXX|Missing dependencies|Module did not self-register/i;

const shotiumModule = async (): Promise<any | null> => {
  if (shotiumState === 'ready') return shotium;
  if (shotiumState === 'absent') return null;
  try {
    const mod: any = await import(SHOTIUM_SPECIFIER);
    const shot = mod?.screenshot ?? mod?.default?.screenshot;
    if (typeof shot !== 'function') throw new Error('导出里没有 screenshot 函数');
    shotium = mod;
    shotiumState = 'ready';
    return mod;
  } catch (err: any) {
    shotiumState = 'absent';
    shotiumReason = cleanError(err?.message ?? err, 100);
    logger.warn(`[名言卡片] 内置渲染引擎不可用，改用本机浏览器: ${shotiumReason}`);
    return null;
  }
};

/** 启动引擎（单进程只能初始化一次，成功后就别再来） */
const ensureShotium = async (): Promise<any | null> => {
  const mod = await shotiumModule();
  if (!mod) return null;
  if (!shotiumStarted) {
    try {
      // cacheDir: null —— 我们只渲染本地文件与 data URL，用不上 HTTP 缓存；
      // 默认值会往用户家目录写 ~/.shotium/cache（最多 256MB），没必要留这摊东西。
      mod.start?.({ cacheDir: null });
    } catch (err: any) {
      const detail = String(err?.message ?? err);
      // 「已经启动过」不算失败，其余当一个警告放过（真的不能用会在截图时暴露）
      if (!/already|started|running/i.test(detail)) {
        logger.warn(`[名言卡片] 内置引擎初始化异常: ${cleanError(detail, 80)}`);
      }
    }
    shotiumStarted = true;
  }
  return mod;
};

/** 空闲一段时间把工作集还回去，别长期占着几十 MB */
let idleTimer: any = null;

const touchIdle = () => {
  const mod = shotium;
  if (!mod) return;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    try {
      mod.releaseMemory?.({ releaseWorkingSet: true });
    } catch {
      // 释放失败无所谓
    }
    idleTimer = null;
  }, 5 * 60 * 1000);
  idleTimer?.unref?.();
};

/** 本次进程内临时 HTML 文件，渲染完即删 */
let tmpSeq = 0;

const writeTempHtml = async (html: string): Promise<string> => {
  const dir = path.join(os.tmpdir(), 'quote-card-render');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${process.pid}-${++tmpSeq}.html`);
  await fs.writeFile(file, html, 'utf8');
  return file;
};

const renderByShotium = async (req: RenderRequest): Promise<Buffer> => {
  const mod = await ensureShotium();
  if (!mod) throw new Error('内置渲染引擎不可用');

  const ownTmp = typeof req.html === 'string';
  const t0 = Date.now();
  const file = ownTmp ? await writeTempHtml(req.html as string) : (req.file as string);
  if (ownTmp) debugTiming('writeTemp', Date.now() - t0, `${(req.html!.length / 1024).toFixed(0)}KB`);
  try {
    // undefined 字段一律不传：那边对未知/空字段会做参数校验
    const options: Record<string, unknown> = {
      file,
      type: 'jpeg',
      quality: clampQuality(req.quality),
      viewport: req.viewport,
      pageGotoParams: { timeout: 30_000 }
    };
    if (req.selector) options.selector = req.selector;
    if (req.fullPage) options.fullPage = true;
    if (req.allowFileAccess) options.allowFileAccess = true;

    const t1 = Date.now();
    const result = await mod.screenshot(options);
    debugTiming('screenshot', Date.now() - t1);
    const image = result?.image;
    if (!image?.length) throw new Error('渲染结果为空');
    touchIdle();
    return Buffer.from(image);
  } finally {
    if (ownTmp) await fs.unlink(file).catch(() => undefined);
  }
};

/* ------------------------------------------------------------------ *
 * Chromium（playwright-core，回退用）
 * ------------------------------------------------------------------ */

let browser: any = null;
let browserIdle: any = null;

const CHROMIUM_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--allow-file-access-from-files',
  '--font-render-hinting=none'
];

const launchBrowser = async () => {
  const pw: any = await import('playwright-core');
  const chromium = pw.chromium ?? pw.default?.chromium;
  if (!chromium?.launch) throw new Error('playwright-core 未正确加载（chromium 为 undefined）');
  const executablePath = resolveBrowserPath();
  return chromium.launch({
    headless: true,
    // 探到了就用它；没探到就别传，交给 playwright 自己按内置 registry 找
    ...(executablePath ? { executablePath } : {}),
    args: CHROMIUM_ARGS
  });
};

/** 取浏览器；挂掉或没启过就现启，失败重试一次（Docker 刚重启时能自救） */
const getBrowser = async (): Promise<any> => {
  if (browser && browser.isConnected()) {
    if (browserIdle) {
      clearTimeout(browserIdle);
      browserIdle = null;
    }
    return browser;
  }

  browser = null;
  let lastErr: any = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      browser = await launchBrowser();
      return browser;
    } catch (err: any) {
      lastErr = err;
      browser = null;
      if (attempt === 1) {
        logger.warn(`[名言卡片] Chromium 启动失败，800ms 后重试一次: ${cleanError(err?.message ?? err, 100)}`);
        await new Promise(r => setTimeout(r, 800));
      }
    }
  }

  const attempted = resolveBrowserPath();
  const detail = String(lastErr?.message ?? lastErr);
  logger.error(`[名言卡片] 启动浏览器失败: ${detail}`);
  if (!attempted) {
    // 报错要分清两种情况：内置引擎是好的，只是被 ENGINE=chromium 关掉了；
    // 还是两条路都不通。否则用户照提示去「装内置引擎」只会白忙。
    if (enginePreference() === 'chromium') {
      throw new Error(
        `你指定了 ${ENV_KEY}=chromium，但这台机器上没找到 Chrome / Chromium / Edge。` +
          `内置引擎是可用的，去掉这个设置（或设为 shotium）即可出图`
      );
    }
    throw new Error(
      `没有可用的出图引擎：内置引擎装不上，本机也没找到 Chrome / Chromium / Edge。装个浏览器（或用 ${ENV_KEY}=shotium 强制内置）即可`
    );
  }
  throw new Error(`启动 Chromium 失败: ${cleanError(detail)}${launchErrorHint(detail, attempted)}`);
};

const touchBrowserIdle = () => {
  if (browserIdle) clearTimeout(browserIdle);
  browserIdle = setTimeout(() => {
    browser?.close?.().catch(() => undefined);
    browser = null;
    browserIdle = null;
  }, 5 * 60 * 1000);
  browserIdle?.unref?.();
};

/** 浏览器疑似半死（崩溃 / 端口断开）就丢掉实例，下次渲染重新 launch */
const dropBrowserIfDead = (err: unknown) => {
  const m = String((err as any)?.message ?? err);
  if (/Target closed|Connection closed|has been closed|crash|Protocol error|browser has disconnected/i.test(m)) {
    logger.warn(`[名言卡片] 浏览器已断开，丢弃实例待重建: ${cleanError(m, 100)}`);
    browser?.close?.().catch(() => undefined);
    browser = null;
  }
};

const renderByChromium = async (req: RenderRequest): Promise<Buffer> => {
  const ownTmp = typeof req.html === 'string';
  const file = ownTmp ? await writeTempHtml(req.html as string) : (req.file as string);
  try {
    const instance = await getBrowser();
    const page = await instance.newPage({ viewport: req.viewport });
    try {
      await page.goto(pathToFileURL(file).href, { waitUntil: 'load', timeout: 30_000 });
      const shot = { type: 'jpeg' as const, quality: clampQuality(req.quality) };
      const buf = req.selector
        ? await page.locator(req.selector).first().screenshot(shot)
        : await page.screenshot({ ...shot, fullPage: Boolean(req.fullPage) });
      if (!buf?.length) throw new Error('渲染结果为空');
      return Buffer.from(buf);
    } finally {
      await page.close().catch(() => undefined);
      touchBrowserIdle();
    }
  } catch (err) {
    dropBrowserIfDead(err);
    throw err;
  } finally {
    if (ownTmp) await fs.unlink(file).catch(() => undefined);
  }
};

/* ------------------------------------------------------------------ *
 * 对外入口
 * ------------------------------------------------------------------ */

/** 上次真正用上的后端，报错文案与日志按它来说话 */
let lastEngine: RenderEngine | null = null;

/** 排查慢图用：QUOTE_CARD_DEBUG=1 时把每个阶段耗时打进日志 */
export const debugTiming = (label: string, cost: number, extra = ''): void => {
  if (!debugOn) return;
  logger.info(`[名言卡片][debug] ${label} ${cost}ms${extra ? ` ${extra}` : ''}`);
};

/** 环境变量被子进程过滤掉时，还能用这个标记文件打开调试（排查完删掉即可） */
const debugOn = (() => {
  if (process.env.QUOTE_CARD_DEBUG) return true;
  try {
    return existsSync(path.join(os.tmpdir(), 'quote-card-debug'));
  } catch {
    return false;
  }
})();

/** 渲染一张图；内部按偏好挑后端，内置引擎引擎级失败时自动退回 Chromium */
export const renderImage = (req: RenderRequest): Promise<Buffer> =>
  enqueue(async () => {
    if (!req.html && !req.file) throw new Error('渲染请求缺少 html 或 file');

    const started = Date.now();
    const size = req.html ? req.html.length : 0;
    const want = enginePreference();

    try {
      if (want !== 'chromium') {
        const mod = await shotiumModule();
        if (mod) {
          try {
            const buf = await renderByShotium(req);
            lastEngine = 'shotium';
            return buf;
          } catch (err: any) {
            const detail = String(err?.message ?? err);
            // 只有「引擎本身加载不了 / 崩了」才放弃它；选择器没命中、文档超时这类是业务错误，直接往上抛
            if (!ENGINE_BROKEN.test(detail) && !/内置渲染引擎不可用/.test(detail)) throw err;
            shotiumState = 'absent';
            shotiumReason = cleanError(detail, 100);
            logger.warn(`[名言卡片] 内置引擎运行失败，本次改用本机浏览器: ${shotiumReason}`);
          }
        }
        // 用户明确只认内置引擎时，别再偷偷退回浏览器
        if (want === 'shotium' && shotiumState !== 'ready') {
          throw new Error(
            `内置引擎不可用（${shotiumReason || '未安装'}）。执行 npm i ${SHOTIUM_SPECIFIER} 后重试，或把 ${ENV_KEY} 设为 chromium 改用本机浏览器`
          );
        }
      }

      const buf = await renderByChromium(req);
      lastEngine = 'chromium';
      return buf;
    } finally {
      // 排队等待的时间也算在里面，所以能看出是不是被前一张图堵住了
      debugTiming('render', Date.now() - started, `engine=${lastEngine} html=${(size / 1024).toFixed(0)}KB`);
    }
  });

/** 当前/上次用的后端，供错误文案与状态行使用 */
export const activeEngine = (): RenderEngine | null => lastEngine;

/**
 * 启动自检：试加载内置引擎并把它拉起来（首个卡片就不用再等冷启）
 * 返回一行可直接打日志的说明
 */
export const warmupRenderer = async (): Promise<string> => {
  const want = enginePreference();

  if (want !== 'chromium') {
    const mod = await shotiumModule();
    if (mod) {
      await ensureShotium();
      return '渲染引擎: shotium（内置 Blink，无需另装浏览器）';
    }
    if (want === 'shotium') {
      return `⚠️ 内置渲染引擎不可用（${shotiumReason || '未安装'}），且已强制只走内置引擎；执行 npm i ${SHOTIUM_SPECIFIER} 即可`;
    }
  }

  const found = resolveBrowserPath();
  if (found) {
    const why = want === 'chromium' ? `${ENV_KEY}=chromium` : '内置引擎不可用';
    return `渲染引擎: 本机浏览器 ${found}（${why}）`;
  }
  if (want === 'chromium') {
    return `⚠️ 你指定了 ${ENV_KEY}=chromium，但这台机器上没找到 Chrome / Chromium / Edge。内置引擎是可用的，去掉这个设置即可出图`;
  }
  return `⚠️ 没有可用的出图引擎：内置引擎装不上，本机也没找到浏览器。执行 npm i ${SHOTIUM_SPECIFIER} 即可，或装一个 Chrome / Chromium / Edge 再用 ${executableEnvKeys()} 指定路径`;
};

/** 供测试重置内部状态 */
export const __resetRenderer = (): void => {
  shotium = null;
  shotiumState = 'unknown';
  shotiumReason = '';
  shotiumStarted = false;
  lastEngine = null;
};
