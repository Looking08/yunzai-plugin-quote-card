import path from 'node:path';
import fs from 'node:fs/promises';

export type CardSettings = {
  /** 卡片输出宽度（像素） */
  width: number;
  /** 卡片输出高度（像素） */
  height: number;
  /** JPEG 质量 60~100 */
  quality: number;
  /** #名言照片列表 是否允许所有人查看（false 则仅主人） */
  listPublic: boolean;
};

const DEFAULT_SETTINGS: CardSettings = {
  width: 1280,
  height: 640,
  quality: 92,
  listPublic: true
};

const SETTINGS_FILE = path.join(process.cwd(), 'data', 'quote-card', 'settings.json');

const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const toBool = (value: unknown, fallback: boolean) => {
  if (value === undefined || value === null) return fallback;
  return Boolean(value);
};

/** 归一化，防止写入非法值 */
export const normalizeSettings = (input: Partial<CardSettings> = {}, base: CardSettings = DEFAULT_SETTINGS): CardSettings => ({
  width: clampInt(input.width ?? base.width, 480, 3840, base.width),
  height: clampInt(input.height ?? base.height, 240, 2160, base.height),
  quality: clampInt(input.quality ?? base.quality, 60, 100, base.quality),
  listPublic: toBool(input.listPublic, base.listPublic)
});

/** 读取设置（文件不存在时返回默认值） */
export const readSettings = async (): Promise<CardSettings> => {
  try {
    const raw = await fs.readFile(SETTINGS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<CardSettings>;
    return normalizeSettings(parsed);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
};

/** 写入设置（增量合并） */
export const writeSettings = async (patch: Partial<CardSettings>): Promise<CardSettings> => {
  const current = await readSettings();
  const next = normalizeSettings(patch, current);
  await fs.mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(next, null, 2), 'utf8');
  return next;
};

export const DEFAULT_CARD_SETTINGS = DEFAULT_SETTINGS;
