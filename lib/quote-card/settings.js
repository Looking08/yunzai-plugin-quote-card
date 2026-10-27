import path from "node:path";
import fs from "node:fs/promises";

// src/quote-card/settings.ts
const DEFAULT_SETTINGS = {
	width: 1280,
	height: 640,
	quality: 92,
	listPublic: true
};
const SETTINGS_FILE = path.join(process.cwd(), "data", "quote-card", "settings.json");
const clampInt = (value, min, max, fallback) => {
	const n = Math.round(Number(value));
	if (!Number.isFinite(n)) return fallback;
	return Math.min(max, Math.max(min, n));
};
const toBool = (value, fallback) => {
	if (value === void 0 || value === null) return fallback;
	return Boolean(value);
};
/** 归一化，防止写入非法值 */
const normalizeSettings = (input = {}, base = DEFAULT_SETTINGS) => ({
	width: clampInt(input.width ?? base.width, 480, 3840, base.width),
	height: clampInt(input.height ?? base.height, 240, 2160, base.height),
	quality: clampInt(input.quality ?? base.quality, 60, 100, base.quality),
	listPublic: toBool(input.listPublic, base.listPublic)
});
/** 读取设置（文件不存在时返回默认值） */
const readSettings = async () => {
	try {
		const raw = await fs.readFile(SETTINGS_FILE, "utf8");
		const parsed = JSON.parse(raw);
		return normalizeSettings(parsed);
	} catch {
		return { ...DEFAULT_SETTINGS };
	}
};
/** 写入设置（增量合并） */
const writeSettings = async (patch) => {
	const current = await readSettings();
	const next = normalizeSettings(patch, current);
	await fs.mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
	await fs.writeFile(SETTINGS_FILE, JSON.stringify(next, null, 2), "utf8");
	return next;
};
const DEFAULT_CARD_SETTINGS = DEFAULT_SETTINGS;

export { DEFAULT_CARD_SETTINGS, normalizeSettings, readSettings, writeSettings };