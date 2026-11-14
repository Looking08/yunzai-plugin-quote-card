/**
 * 浏览器可执行文件探测（出图引擎的**回退**路径）
 *
 * v1.1.6 起出图默认走内置引擎（见 renderer.ts），本机浏览器只是备选：
 * 内置引擎装不上、加载不了、或运行时崩了才用得上这里。
 *
 * 为什么需要探测：playwright 需要一个真实的 Chromium。之前代码把容器里的
 * `/usr/bin/chromium-browser` 当成默认值写死，于是 macOS、Windows、非 Debian 发行版一律报
 *   Failed to launch chromium because executable doesn't exist at /usr/bin/chromium-browser
 * 「本机能跑」只是因为我这台机器的容器里恰好有这个路径。
 *
 * 现在的查找顺序（找到第一个存在的就用）：
 *   1. 环境变量：JSXP_EXECUTABLE_PATH / PUPPETEER_EXECUTABLE_PATH / CHROME_PATH / CHROMIUM_PATH / GOOGLE_CHROME_BIN
 *   2. PATH 里的常见命令名（chromium / chromium-browser / google-chrome / chrome / msedge / brave-browser）
 *   3. 各平台标准安装位置（macOS 的 .app、Windows 的 Program Files、Linux 的 /usr/bin 与 snap）
 *   4. playwright / puppeteer 下载缓存（`npx playwright-core install chromium` 装的那份）
 * 都找不到就返回 null，把决定权交回 playwright，并把安装指引写进报错，而不是抛一句没头没脑的 ENOENT。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** 用户显式指定路径用的环境变量（按优先级） */
const ENV_KEYS = [
  'JSXP_EXECUTABLE_PATH',
  'PUPPETEER_EXECUTABLE_PATH',
  'CHROME_PATH',
  'CHROMIUM_PATH',
  'GOOGLE_CHROME_BIN'
] as const;

/** PATH 里按优先级找的命令名 */
const COMMANDS = [
  'chromium',
  'chromium-browser',
  'google-chrome',
  'google-chrome-stable',
  'chrome',
  'microsoft-edge',
  'msedge',
  'brave-browser',
  'chrome.exe',
  'msedge.exe',
  'brave.exe'
];

const isFile = (candidate?: string | null): candidate is string => {
  if (!candidate) return false;
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
};

const homedir = (): string => {
  try {
    return os.homedir() || '';
  } catch {
    return '';
  }
};

const unique = (list: string[]): string[] => [...new Set(list.filter(Boolean))];

/** macOS：装了的 App 里的可执行文件 */
const darwinCandidates = (): string[] => {
  const roots = unique(['/Applications', homedir() ? path.join(homedir(), 'Applications') : '']);
  const apps: Array<[string, string]> = [
    ['Google Chrome.app', 'Google Chrome'],
    ['Google Chrome Beta.app', 'Google Chrome Beta'],
    ['Chromium.app', 'Chromium'],
    ['Microsoft Edge.app', 'Microsoft Edge'],
    ['Brave Browser.app', 'Brave Browser']
  ];
  return roots.flatMap(root => apps.map(([app, bin]) => path.join(root, app, 'Contents', 'MacOS', bin)));
};

/** Linux：各发行版包管理器装出来的位置 + snap */
const linuxCandidates = (): string[] => [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chrome',
  '/usr/bin/microsoft-edge',
  '/usr/bin/microsoft-edge-stable',
  '/usr/bin/brave-browser',
  '/usr/local/bin/chromium',
  '/usr/local/bin/chromium-browser',
  '/usr/local/bin/google-chrome',
  '/snap/bin/chromium',
  '/snap/bin/google-chrome',
  '/snap/bin/microsoft-edge',
  '/opt/google/chrome/chrome',
  '/opt/microsoft/msedge/msedge',
  '/opt/brave.com/brave/brave-browser',
  // Alpine 的 chromium 包有时只放这个软链
  '/usr/lib/chromium/chrome',
  '/usr/lib/chromium-browser/chrome'
];

/** Windows：Program Files / LocalAppData */
const windowsCandidates = (): string[] => {
  const roots = unique([
    process.env.PROGRAMFILES ?? '',
    process.env['PROGRAMFILES(X86)'] ?? '',
    process.env.LOCALAPPDATA ?? ''
  ]);
  const rels: string[][] = [
    ['Google', 'Chrome', 'Application', 'chrome.exe'],
    ['Google', 'Chrome Beta', 'Application', 'chrome.exe'],
    ['Microsoft', 'Edge', 'Application', 'msedge.exe'],
    ['BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe']
  ];
  return roots.flatMap(root => rels.map(parts => path.join(root, ...parts)));
};

const platformCandidates = (): string[] => {
  if (process.platform === 'darwin') return darwinCandidates();
  if (process.platform === 'win32') return windowsCandidates();
  return linuxCandidates();
};

/** 读目录，按名称倒序（新版本优先），失败返回空数组 */
const readdirSafe = (dir: string): string[] => {
  try {
    return fs.readdirSync(dir).sort().reverse();
  } catch {
    return [];
  }
};

/** playwright 下载缓存的根目录 */
const playwrightCacheRoots = (): string[] => {
  const home = homedir();
  if (process.platform === 'darwin') {
    return unique([home ? path.join(home, 'Library', 'Caches', 'ms-playwright') : '']);
  }
  if (process.platform === 'win32') {
    return unique([process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'ms-playwright') : '']);
  }
  return unique([
    home ? path.join(home, '.cache', 'ms-playwright') : '',
    '/root/.cache/ms-playwright',
    '/home/node/.cache/ms-playwright'
  ]);
};

/** 在 chromium-<rev>/ 里找真正的可执行文件，各平台布局不同 */
const playwrightBinary = (dir: string): string | null => {
  const layouts =
    process.platform === 'darwin'
      ? ['chrome-mac-arm64', 'chrome-mac', 'chrome-mac-x64']
      : process.platform === 'win32'
        ? ['chrome-win', 'chrome-win64']
        : ['chrome-linux', 'chrome-linux64'];
  for (const layout of layouts) {
    const base = path.join(dir, layout);
    const candidates =
      process.platform === 'darwin'
        ? [
            path.join(base, 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
            path.join(base, 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing')
          ]
        : process.platform === 'win32'
          ? [path.join(base, 'chrome.exe')]
          : [path.join(base, 'chrome'), path.join(base, 'headless_shell')];
    for (const candidate of candidates) if (isFile(candidate)) return candidate;
  }
  return null;
};

/** playwright 缓存：ms-playwright/chromium-<rev>/... */
const playwrightCacheCandidates = (): string[] => {
  const hits: string[] = [];
  for (const root of playwrightCacheRoots()) {
    for (const name of readdirSafe(root)) {
      if (!name.startsWith('chromium-')) continue;
      const bin = playwrightBinary(path.join(root, name));
      if (bin) hits.push(bin);
    }
  }
  return hits;
};

/** puppeteer 缓存：puppeteer/chrome/版本号/chrome-平台目录/… */
const puppeteerCacheCandidates = (): string[] => {
  const home = homedir();
  const roots = unique([
    home ? path.join(home, '.cache', 'puppeteer', 'chrome') : '',
    '/root/.cache/puppeteer/chrome'
  ]);
  const hits: string[] = [];
  for (const root of roots) {
    for (const version of readdirSafe(root)) {
      const bin = playwrightBinary(path.join(root, version));
      if (bin) hits.push(bin);
    }
  }
  return hits;
};

/** 1) 环境变量指定的路径（只认真实存在的文件） */
const fromEnv = (): string | null => {
  for (const key of ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (value && isFile(value)) return value;
  }
  return null;
};

/** 2) PATH 里的命令名（不用 execSync，直接按 PATH 拼路径判断） */
const fromPath = (): string | null => {
  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  for (const command of COMMANDS) {
    for (const dir of dirs) {
      const candidate = path.join(dir, command);
      if (isFile(candidate)) return candidate;
    }
  }
  return null;
};

let cached: string | null | undefined;

/**
 * 找一个可用的浏览器可执行文件；找不到返回 null
 * 结果会缓存（同一进程里浏览器路径不会变），测试可用 resetBrowserPathCache 清掉
 */
export const resolveBrowserPath = (): string | null => {
  if (cached !== undefined) return cached;
  cached =
    fromEnv() ??
    fromPath() ??
    platformCandidates().find(isFile) ??
    playwrightCacheCandidates()[0] ??
    puppeteerCacheCandidates()[0] ??
    null;
  return cached;
};

/** 清缓存（测试 / 改了 env 后重新探测用） */
export const resetBrowserPathCache = (): void => {
  cached = undefined;
};

/** 环境变量清单，报错里展示给用户 */
export const executableEnvKeys = (): string => ENV_KEYS.join(' / ');

/** 一行版提示：能塞进聊天回复（受 180 字符限制） */
export const missingBrowserHint = (): string =>
  `（未找到可用的浏览器：装一个 Chrome / Chromium / Edge 即可，或设置 ${ENV_KEYS[0]} 指定路径）`;

/**
 * 把 playwright 的多行报错压成一行可读文本
 * （它会打一段 ╔══╗ 的「请执行 npx playwright install」横幅，夹在聊天回复里既占字数又没信息量）
 */
export const cleanError = (message: unknown, maxLength = 120): string => {
  const text = String((message as any)?.message ?? message ?? '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !/^[╔║╚╠╣═]/.test(line))
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
};

/**
 * 把 launch 失败的技术原因翻译成一句人话（单行，供聊天回复用）
 * @param message 原始错误
 * @param attempted 本次尝试的可执行文件路径（null = 没找到任何候选）
 */
export const launchErrorHint = (message: string, attempted?: string | null): string => {
  const m = String(message ?? '');
  const exe = attempted === undefined ? resolveBrowserPath() : attempted;

  if (!exe) return missingBrowserHint();
  if (/executable doesn't exist|ENOENT|no such file|not found/i.test(m)) {
    return `（浏览器文件不存在：${exe}，请确认该路径，或删掉相关环境变量让插件自动探测）`;
  }
  if (/Cannot find module|playwright-core/i.test(m)) return '（依赖缺失：playwright-core 未安装）';
  if (/ENOSPC|no space left/i.test(m)) return '（磁盘写满，Chromium 无法创建临时文件，请清理磁盘）';
  if (/Cannot allocate memory|out of memory|ENOMEM/i.test(m)) {
    return '（内存不足，Chromium 起不来，请给容器/主机多分点内存或稍后重试）';
  }
  if (/Timeout|timed out/i.test(m)) return '（启动超时，通常是主机或容器负载太高）';
  if (/crash|Target closed|Connection closed/i.test(m)) return '（浏览器进程崩溃，可能是磁盘/内存异常）';
  if (/sandbox|SUID/i.test(m)) return '（沙箱相关失败：容器内需要 --no-sandbox，请升级插件或检查启动参数）';
  return '';
};
