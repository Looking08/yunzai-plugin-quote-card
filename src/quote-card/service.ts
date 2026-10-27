import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import React from 'react';
import { Component, Playwright } from 'jsxp';
import { getConfigValue } from 'alemonjs';
import QuoteCard from './card';
import { readSettings } from './settings';

export const MAX_SLOT = 100;

/** 背景槽位持久化目录（bind mount 到宿主机 ./data，容器重建不丢失） */
export const BG_DIR = path.join(process.cwd(), 'data', 'quote-card', 'backgrounds');

export const COLORS = [
  '#FF6B6B',
  '#FF8E72',
  '#FFA94D',
  '#FFD43B',
  '#FF922B',
  '#F06595',
  '#DA77F2',
  '#9775FA',
  '#748FFC',
  '#4DABF7',
  '#3BC9DB',
  '#38D9A9',
  '#69DB7C',
  '#A9E34B',
  '#94D82D',
  '#FCC419',
  '#F76707',
  '#E8590C',
  '#FF8787',
  '#E599F7',
  '#20C997',
  '#22B8CF',
  '#339AF0',
  '#5C7CFA',
  '#7950F2'
];

const IMG_TYPES = [
  { ext: 'jpg', mime: 'image/jpeg', test: (b: Buffer) => b[0] === 0xff && b[1] === 0xd8 },
  { ext: 'png', mime: 'image/png', test: (b: Buffer) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  {
    ext: 'webp',
    mime: 'image/webp',
    test: (b: Buffer) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  },
  { ext: 'gif', mime: 'image/gif', test: (b: Buffer) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 }
];

const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif'
};

const UA =
  'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';

export const randColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];

/** 按文本长度自适应字号（与原插件一致） */
export const fontSize = (text: string) => {
  const n = text.length;
  if (n <= 8) return 64;
  if (n <= 16) return 52;
  if (n <= 32) return 42;
  if (n <= 60) return 36;
  if (n <= 100) return 28;
  return 22;
};

export const detectType = (buf: Buffer) => IMG_TYPES.find(t => t.test(buf)) ?? { ext: 'jpg', mime: 'image/jpeg' };

/** 下载远程图片 */
export const downloadImage = async (url: string): Promise<Buffer> => {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) throw new Error('图片为空');
  return buf;
};

/** 下载并转为 data URL，失败时返回空串（不阻断出图） */
export const toDataUrl = async (url: string): Promise<string> => {
  if (!url) return '';
  try {
    const buf = await downloadImage(url);
    const type = detectType(buf);
    return `data:${type.mime};base64,${buf.toString('base64')}`;
  } catch (err) {
    logger.warn(`[名言卡片] 图片获取失败: ${url} ${(err as Error).message}`);
    return '';
  }
};

/** QQ 号头像地址；只接受纯数字 QQ 号 */
export const qqAvatarUrl = (qq: string) => (/^\d{4,}$/.test(qq ?? '') ? `https://q1.qlogo.cn/g?b=qq&s=640&nk=${qq}` : '');

/** QQ 官方机器人：openid 头像（qqapp 接口需要 AppID，优先用事件里的 BotId） */
export const qqBotAvatarUrl = (openid: string, botId?: string) => {
  if (!openid) return '';
  let appId = botId ?? '';
  if (!appId) {
    try {
      const cfg = (getConfigValue() as any) ?? {};
      appId = cfg?.['qq-bot']?.app_id ?? cfg?.['@alemonjs/qq-bot']?.app_id ?? '';
    } catch {
      appId = '';
    }
  }
  return appId ? `https://q.qlogo.cn/qqapp/${appId}/${openid}/640` : '';
};

/** 按账号形态挑头像：纯数字走 QQ 号头像，否则按官方机器人 openid 处理 */
export const resolveAvatarUrl = (id: string, botId?: string) => qqAvatarUrl(id) || qqBotAvatarUrl(id, botId);

const ensureBgDir = async () => {
  await fs.mkdir(BG_DIR, { recursive: true });
};

export const findBgFile = async (n: number): Promise<string | null> => {
  try {
    const files = await fs.readdir(BG_DIR);
    const hit = files.find(f => f.startsWith(`custom-${n}.`));
    return hit ? path.join(BG_DIR, hit) : null;
  } catch {
    return null;
  }
};

export const clearBgFile = async (n: number) => {
  try {
    const files = await fs.readdir(BG_DIR);
    for (const f of files) {
      if (f.startsWith(`custom-${n}.`)) await fs.unlink(path.join(BG_DIR, f));
    }
  } catch {
    // 忽略
  }
  // 缩略图缓存一起清掉，免得删了背景列表里还留着旧图
  try {
    await fs.unlink(path.join(THUMB_DIR, `custom-${n}.jpg`));
  } catch {
    // 忽略
  }
};

export const listBgSlots = async (): Promise<number[]> => {
  try {
    const files = await fs.readdir(BG_DIR);
    const set = new Set<number>();
    for (const f of files) {
      const m = f.match(/^custom-(\d+)\./);
      if (m) set.add(parseInt(m[1], 10));
    }
    return [...set].sort((a, b) => a - b);
  } catch {
    return [];
  }
};

/** 保存背景到指定槽位 */
export const saveBg = async (n: number, buf: Buffer) => {
  const type = detectType(buf);
  await ensureBgDir();
  await clearBgFile(n);
  const target = path.join(BG_DIR, `custom-${n}.${type.ext}`);
  await fs.writeFile(target, buf);
  // 顺手把缩略图备好（不 await，别拖慢「已保存」的回复）；失败也无所谓，列表时会再试
  ensureThumb(target).catch(() => undefined);
  return type;
};

/** 随机挑一张已设置的背景，返回 data URL */
export const pickBackground = async (): Promise<string> => {
  try {
    const slots = await listBgSlots();
    if (!slots.length) return '';
    const pick = slots[Math.floor(Math.random() * slots.length)];
    const file = await findBgFile(pick);
    if (!file) return '';
    const buf = await fs.readFile(file);
    const ext = path.extname(file).slice(1).toLowerCase();
    const mime = EXT_MIME[ext] ?? 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch (err) {
    logger.error(`[名言卡片] 加载背景失败: ${(err as Error).message}`);
    return '';
  }
};

export type QuoteCardImageOptions = {
  text: string;
  senderName: string;
  qq?: string;
  /** 直接指定头像地址（优先于 qq / botId 推导） */
  avatarUrl?: string;
  /** QQ 官方机器人 AppID（事件里的 BotId），用于拼 openid 头像 */
  botId?: string;
  bgImage?: string;
  bgColor?: string;
};

/** 浏览器可执行文件（容器内为 apk 安装的 chromium） */
const CHROMIUM_PATH =
  process.env.JSXP_EXECUTABLE_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser';

let engine: any = null;

/** 复用同一个无头浏览器实例，显式关闭沙箱以适配容器环境 */
const getEngine = () => {
  if (!engine) {
    engine = new Playwright({
      headless: true,
      executablePath: CHROMIUM_PATH,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none']
    });
  }
  return engine;
};

/** 串行化渲染，避免并发开过多页面 */
let renderQueue: Promise<unknown> = Promise.resolve();

/**
 * 渲染名言卡片为图片 Buffer
 * 使用 jsxp（Playwright + Chromium）替代原插件的 puppeteer.screenshots
 */
export const renderQuoteCard = async (options: QuoteCardImageOptions): Promise<Buffer | null> => {
  const avatar = await toDataUrl(options.avatarUrl || resolveAvatarUrl(options.qq ?? '', options.botId));
  const settings = await readSettings();

  const task = async () => {
    const element = React.createElement(QuoteCard, {
      bgColor: options.bgColor ?? randColor(),
      bgImage: options.bgImage ?? '',
      avatar,
      text: options.text,
      fontSize: fontSize(options.text),
      senderName: options.senderName,
      width: settings.width,
      height: settings.height
    });

    const html = await new Component().compile({ component: element } as any, 'local');
    const buf = await getEngine().render(html, {
      selector: 'body',
      screenshot: { type: 'jpeg', quality: settings.quality }
    });

    return buf && buf.length ? Buffer.from(buf) : null;
  };

  const run = renderQueue.then(task, task);
  renderQueue = run.catch(() => undefined);

  return run as Promise<Buffer | null>;
};

/** 本地文件转 data URL（渲染时内嵌，避免 file:// 被拦） */
export const fileToDataUrl = async (file: string): Promise<string> => {
  try {
    const buf = await fs.readFile(file);
    const ext = path.extname(file).slice(1).toLowerCase();
    const mime = EXT_MIME[ext] ?? 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return '';
  }
};

/** 页面渲染专用浏览器：列表页图片走 file://，不把几十 MB base64 塞进 HTML */
let pageBrowser: any = null;
let pageBrowserIdle: any = null;

const getPageBrowser = async () => {
  const { chromium } = await import('playwright-core');
  if (pageBrowser && pageBrowser.isConnected()) {
    if (pageBrowserIdle) {
      clearTimeout(pageBrowserIdle);
      pageBrowserIdle = null;
    }
    return pageBrowser;
  }
  pageBrowser = await chromium.launch({
    headless: true,
    executablePath: CHROMIUM_PATH,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--allow-file-access-from-files'
    ]
  });
  return pageBrowser;
};

/** 空闲 5 分钟自动关掉，别长期占内存 */
const touchPageBrowserIdle = () => {
  if (pageBrowserIdle) clearTimeout(pageBrowserIdle);
  pageBrowserIdle = setTimeout(() => {
    pageBrowser?.close?.().catch(() => undefined);
    pageBrowser = null;
    pageBrowserIdle = null;
  }, 5 * 60 * 1000);
  pageBrowserIdle?.unref?.();
};

/** 缩略图宽度：列表页每格只有 190px 高，喂原图纯属浪费 */
const THUMB_WIDTH = 480;
const THUMB_DIR = path.join(BG_DIR, '.thumbs');

/**
 * 生成（或复用）某张背景的缩略图，返回缩略图路径；失败返回 null
 * 用 Chromium 自己解码缩放，不额外依赖 sharp / ffmpeg
 */
const ensureThumb = async (file: string): Promise<string | null> => {
  const out = path.join(THUMB_DIR, `${path.basename(file).replace(/\.[^.]+$/, '')}.jpg`);
  try {
    const [srcStat, thumbStat] = await Promise.all([fs.stat(file), fs.stat(out).catch(() => null)]);
    if (thumbStat && thumbStat.mtimeMs >= srcStat.mtimeMs && thumbStat.size > 1024) return out;
  } catch {
    // 交给下面重建
  }
  try {
    await fs.mkdir(THUMB_DIR, { recursive: true });
    const browser = await getPageBrowser();
    const page = await browser.newPage({ viewport: { width: THUMB_WIDTH, height: THUMB_WIDTH } });
    try {
      await page.goto(pathToFileURL(file).href, { waitUntil: 'load', timeout: 30_000 });
      // 按最长边 480 等比缩放，同时把页面尺寸调成缩放后的尺寸，避免截图带白边
      const dim = await page.evaluate((maxW: number) => {
        const img = document.querySelector('img') as HTMLImageElement | null;
        const nw = img?.naturalWidth || maxW;
        const nh = img?.naturalHeight || maxW;
        const w = Math.max(1, Math.min(nw, maxW));
        const h = Math.max(1, Math.round((nh * w) / nw));
        if (img) {
          img.style.width = `${w}px`;
          img.style.height = `${h}px`;
          img.style.display = 'block';
        }
        document.documentElement.style.margin = '0';
        document.body.style.margin = '0';
        return { w, h };
      }, THUMB_WIDTH);
      await page.setViewportSize({ width: dim.w, height: dim.h });
      const buf = await page.screenshot({
        type: 'jpeg',
        quality: 75,
        clip: { x: 0, y: 0, width: dim.w, height: dim.h }
      });
      if (!buf || !buf.length) return null;
      await fs.writeFile(out, buf);
      return out;
    } finally {
      await page.close().catch(() => undefined);
      touchPageBrowserIdle();
    }
  } catch (err: any) {
    logger.warn(`[名言卡片] 生成缩略图失败 ${path.basename(file)}: ${err.message}`);
    return null;
  }
};

/**
 * 渲染任意页面组件为 JPEG
 *
 * 之前是把 HTML（含每张背景的 base64 内嵌）直接交给 page.setContent，
 * 背景一多 HTML 就涨到几十 MB（5 张 43MB 的原图 ≈ 57MB），setContent 60s 超时。
 * 现在图片在 HTML 里只放 file:// 路径，HTML 写到临时文件后用 page.goto 打开，
 * 传输量从几十 MB 降到几 KB，由浏览器自己去读本地文件。
 */
export const renderPage = async (
  component: React.ReactElement,
  quality?: number,
  viewportWidth = 1280
): Promise<Buffer | null> => {
  const settings = await readSettings();
  const q = quality ?? settings.quality;

  const task = async () => {
    const html = await new Component().compile({ component } as any, 'local');
    const tmp = path.join(process.cwd(), 'data', `.qc-page-${process.pid}.html`);
    await fs.mkdir(path.dirname(tmp), { recursive: true });
    await fs.writeFile(tmp, html, 'utf8');
    try {
      const browser = await getPageBrowser();
      const page = await browser.newPage({ viewport: { width: viewportWidth, height: 900 } });
      try {
        await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load', timeout: 30_000 });
        const buf = await page.screenshot({ type: 'jpeg', quality: q, fullPage: true });
        return buf && buf.length ? Buffer.from(buf) : null;
      } finally {
        await page.close().catch(() => undefined);
      }
    } finally {
      touchPageBrowserIdle();
      await fs.unlink(tmp).catch(() => undefined);
    }
  };

  const run = renderQueue.then(task, task);
  renderQueue = run.catch(() => undefined);

  return run as Promise<Buffer | null>;
};

/** 列表页条目：槽位 + 图片地址 + 体积文案 */
export type BgListItem = {
  slot: number;
  src: string;
  size: string;
};

/** 按槽位顺序读取背景图，供列表页渲染 */
export const collectBgItems = async (slots: number[]): Promise<BgListItem[]> => {
  const items: BgListItem[] = [];
  for (const slot of slots) {
    const file = await findBgFile(slot);
    if (!file) continue;
    // 优先用缩略图：原图动辄十几 MB、几千像素，5 张就能把渲染拖到 30s 以上
    const thumb = await ensureThumb(file);
    const src = pathToFileURL(thumb || file).href;
    let size = '';
    try {
      const stat = await fs.stat(file);
      size =
        stat.size >= 1024 * 1024
          ? `${(stat.size / 1024 / 1024).toFixed(1)}MB`
          : `${Math.round(stat.size / 1024)}KB`;
    } catch {
      size = '';
    }
    items.push({ slot, src, size });
  }
  return items;
};

/** 帮助页背景图：随包发布的 assets/help-bg.jpg（缺失时由调用方兜底） */
export const HELP_BG_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'assets',
  'help-bg.jpg'
);
