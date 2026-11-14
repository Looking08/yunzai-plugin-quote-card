import QuoteCard from "./card.js";
import { readSettings } from "./settings.js";
import { cleanError } from "./browser.js";
import { debugTiming, renderImage } from "./renderer.js";
import { getConfigValue } from "alemonjs";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import React from "react";
import { Component } from "jsxp";

// src/quote-card/service.ts
const MAX_SLOT = 100;
/** 背景槽位持久化目录（bind mount 到宿主机 ./data，容器重建不丢失） */
const BG_DIR = path.join(process.cwd(), "data", "quote-card", "backgrounds");
const COLORS = [
	"#FF6B6B",
	"#FF8E72",
	"#FFA94D",
	"#FFD43B",
	"#FF922B",
	"#F06595",
	"#DA77F2",
	"#9775FA",
	"#748FFC",
	"#4DABF7",
	"#3BC9DB",
	"#38D9A9",
	"#69DB7C",
	"#A9E34B",
	"#94D82D",
	"#FCC419",
	"#F76707",
	"#E8590C",
	"#FF8787",
	"#E599F7",
	"#20C997",
	"#22B8CF",
	"#339AF0",
	"#5C7CFA",
	"#7950F2"
];
const IMG_TYPES = [
	{
		ext: "jpg",
		mime: "image/jpeg",
		test: (b) => b[0] === 255 && b[1] === 216
	},
	{
		ext: "png",
		mime: "image/png",
		test: (b) => b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71
	},
	{
		ext: "webp",
		mime: "image/webp",
		test: (b) => b[0] === 82 && b[1] === 73 && b[2] === 70 && b[3] === 70 && b[8] === 87 && b[9] === 69 && b[10] === 66 && b[11] === 80
	},
	{
		ext: "gif",
		mime: "image/gif",
		test: (b) => b[0] === 71 && b[1] === 73 && b[2] === 70 && b[3] === 56
	}
];
const EXT_MIME = {
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	png: "image/png",
	webp: "image/webp",
	gif: "image/gif"
};
const UA = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
const randColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];
/** 按文本长度自适应字号（与原插件一致） */
const fontSize = (text) => {
	const n = text.length;
	if (n <= 8) return 64;
	if (n <= 16) return 52;
	if (n <= 32) return 42;
	if (n <= 60) return 36;
	if (n <= 100) return 28;
	return 22;
};
const detectType = (buf) => IMG_TYPES.find((t) => t.test(buf)) ?? {
	ext: "jpg",
	mime: "image/jpeg"
};
/** 下载远程图片（5 秒超时：头像是可选项，不能因为 qlogo 慢就把整张卡片拖住） */
const downloadImage = async (url, timeoutMs = 5e3) => {
	const init = {
		headers: { "User-Agent": UA },
		redirect: "follow"
	};
	const signal = typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(timeoutMs) : void 0;
	if (signal) init.signal = signal;
	const res = await fetch(url, init);
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const buf = Buffer.from(await res.arrayBuffer());
	if (!buf.length) throw new Error("图片为空");
	return buf;
};
/** 下载并转为 data URL，失败时返回空串（不阻断出图） */
const toDataUrl = async (url) => {
	if (!url) return "";
	if (/^(data:|file:)/i.test(url)) return url;
	try {
		const buf = await downloadImage(url);
		return `data:${detectType(buf).mime};base64,${buf.toString("base64")}`;
	} catch (err) {
		logger.warn(`[名言卡片] 图片获取失败: ${url} ${err.message}`);
		return "";
	}
};
/** QQ 号头像地址；只接受纯数字 QQ 号 */
const qqAvatarUrl = (qq) => /^\d{4,}$/.test(qq ?? "") ? `https://q1.qlogo.cn/g?b=qq&s=640&nk=${qq}` : "";
/** QQ 官方机器人：openid 头像（qqapp 接口需要 AppID，优先用事件里的 BotId） */
const qqBotAvatarUrl = (openid, botId) => {
	if (!openid) return "";
	let appId = botId ?? "";
	if (!appId) try {
		const cfg = getConfigValue() ?? {};
		appId = cfg?.["qq-bot"]?.app_id ?? cfg?.["@alemonjs/qq-bot"]?.app_id ?? "";
	} catch {
		appId = "";
	}
	return appId ? `https://q.qlogo.cn/qqapp/${appId}/${openid}/640` : "";
};
/** 按账号形态挑头像：纯数字走 QQ 号头像，否则按官方机器人 openid 处理 */
const resolveAvatarUrl = (id, botId) => qqAvatarUrl(id) || qqBotAvatarUrl(id, botId);
const ensureBgDir = async () => {
	await fs.mkdir(BG_DIR, { recursive: true });
};
const findBgFile = async (n) => {
	try {
		const hit = (await fs.readdir(BG_DIR)).find((f) => f.startsWith(`custom-${n}.`));
		return hit ? path.join(BG_DIR, hit) : null;
	} catch {
		return null;
	}
};
const clearBgFile = async (n) => {
	try {
		const files = await fs.readdir(BG_DIR);
		for (const f of files) if (f.startsWith(`custom-${n}.`)) await fs.unlink(path.join(BG_DIR, f));
	} catch {}
	try {
		await fs.unlink(path.join(THUMB_DIR, `custom-${n}.jpg`));
	} catch {}
};
const listBgSlots = async () => {
	try {
		const files = await fs.readdir(BG_DIR);
		const set = /* @__PURE__ */ new Set();
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
const saveBg = async (n, buf) => {
	const type = detectType(buf);
	await ensureBgDir();
	await clearBgFile(n);
	const target = path.join(BG_DIR, `custom-${n}.${type.ext}`);
	await fs.writeFile(target, buf);
	ensureThumb(target).catch(() => void 0);
	return type;
};
/**
* 随机挑一张已设置的背景，返回可直接放进 <img src> 的地址
*
* 返回 **file:// 而不是 data URL**：一张 12MB 的原图转成 base64 是 16MB 字符串，
* 编译 HTML 要多花 300ms、落盘再读一遍，渲染前还要把它塞进 DOM；
* 实测同一张图「file:// 直读」1201ms，「内嵌 base64」2832ms，输出字节完全一样。
*/
const pickBackground = async () => {
	try {
		const slots = await listBgSlots();
		if (!slots.length) return "";
		const pick = slots[Math.floor(Math.random() * slots.length)];
		const file = await findBgFile(pick);
		if (!file) return "";
		return pathToFileURL(file).href;
	} catch (err) {
		logger.error(`[名言卡片] 加载背景失败: ${err.message}`);
		return "";
	}
};
/**
* 渲染名言卡片为图片 Buffer
*
* HTML 由 jsxp 编译，出图交给 renderer（优先内置 Blink 内核，回退本机 Chromium）。
* 卡片是固定 1280×640 的画幅，用 selector:'body' 精确截这一块，避免多余留白。
*/
const renderQuoteCard = async (options) => {
	const started = Date.now();
	const avatar = await toDataUrl(options.avatarUrl || resolveAvatarUrl(options.qq ?? "", options.botId));
	const settings = await readSettings();
	const element = React.createElement(QuoteCard, {
		bgColor: options.bgColor ?? randColor(),
		bgImage: options.bgImage ?? "",
		avatar,
		text: options.text,
		fontSize: fontSize(options.text),
		senderName: options.senderName,
		width: settings.width,
		height: settings.height
	});
	const html = await new Component().compile({ component: element }, "local");
	debugTiming("compileCard", Date.now() - started, `avatar=${avatar ? "y" : "n"} html=${(html.length / 1024).toFixed(0)}KB`);
	try {
		const buf = await renderImage({
			html,
			selector: "body",
			viewport: {
				width: settings.width,
				height: settings.height
			},
			quality: settings.quality,
			allowFileAccess: /^file:/i.test(options.bgImage ?? "") || /^file:/i.test(avatar)
		});
		debugTiming("cardTotal", Date.now() - started);
		return buf?.length ? buf : null;
	} catch (err) {
		const detail = String(err?.message ?? err);
		if (/没有可用的出图引擎|内置引擎不可用/.test(detail)) throw err;
		logger.error(`[名言卡片] 卡片渲染失败: ${detail}`);
		throw new Error(`渲染失败: ${cleanError(detail)}`);
	}
};
/** 本地文件转 data URL（渲染时内嵌，避免 file:// 被拦） */
const fileToDataUrl = async (file) => {
	try {
		const buf = await fs.readFile(file);
		const ext = path.extname(file).slice(1).toLowerCase();
		return `data:${EXT_MIME[ext] ?? "image/jpeg"};base64,${buf.toString("base64")}`;
	} catch {
		return "";
	}
};
/** 缩略图最长边：列表页每格只有 190px 高，喂原图纯属浪费 */
const THUMB_WIDTH = 480;
const THUMB_DIR = path.join(BG_DIR, ".thumbs");
/** 用一张最小 HTML 把本地图片按最长边缩放（纯 CSS，不执行 JS，两种引擎都适用） */
const thumbHtml = (fileHref) => `<html><head><meta charset="utf-8"></head><body style="margin:0;background:#fff"><img src="${fileHref}" style="display:block;max-width:${THUMB_WIDTH}px;max-height:${THUMB_WIDTH}px"></body></html>`;
/**
* 生成（或复用）某张背景的缩略图，返回缩略图路径；失败返回 null
*
* 之前这一步靠 page.evaluate 量出原图尺寸再算缩放，内置引擎不跑 JS 就用不了；
* 改成 CSS 的 max-width/max-height（保持比例自适应），再按元素盒子截图，效果一样。
*/
const ensureThumb = async (file) => {
	const out = path.join(THUMB_DIR, `${path.basename(file).replace(/\.[^.]+$/, "")}.jpg`);
	try {
		const [srcStat, thumbStat] = await Promise.all([fs.stat(file), fs.stat(out).catch(() => null)]);
		if (thumbStat && thumbStat.mtimeMs >= srcStat.mtimeMs && thumbStat.size > 1024) return out;
	} catch {}
	try {
		await fs.mkdir(THUMB_DIR, { recursive: true });
		const buf = await renderImage({
			html: thumbHtml(pathToFileURL(file).href),
			selector: "img",
			viewport: {
				width: THUMB_WIDTH,
				height: THUMB_WIDTH
			},
			quality: 75,
			allowFileAccess: true
		});
		if (!buf?.length) return null;
		await fs.writeFile(out, buf);
		return out;
	} catch (err) {
		logger.warn(`[名言卡片] 生成缩略图失败 ${path.basename(file)}: ${cleanError(err?.message ?? err, 80)}`);
		return null;
	}
};
/**
* 长图渲染的视口高度
*
* 内置引擎的 fullPage 取的是 max(文档高度, 视口高度)：视口给 900，内容只有 530 时
* 出来的图就是 900 高，底部一大片空白；给个小视口才能拿到真正的内容高度。
* 这两个页面都是内容驱动的高度（没有 vh / 100% 依赖），压小视口不影响排版。
*/
const PAGE_VIEWPORT_HEIGHT = 200;
/**
* 渲染任意页面组件为 JPEG
*
* 之前是把 HTML（含每张背景的 base64 内嵌）直接交给 page.setContent，
* 背景一多 HTML 就涨到几十 MB（5 张 43MB 的原图 ≈ 57MB），setContent 60s 超时。
* 现在图片在 HTML 里只放 file:// 路径（缩略图），由引擎自己去读本地文件。
*/
const renderPage = async (component, quality, viewportWidth = 1280) => {
	const settings = await readSettings();
	const q = quality ?? settings.quality;
	const html = await new Component().compile({ component }, "local");
	try {
		const buf = await renderImage({
			html,
			fullPage: true,
			viewport: {
				width: viewportWidth,
				height: PAGE_VIEWPORT_HEIGHT
			},
			quality: q,
			allowFileAccess: true
		});
		return buf?.length ? buf : null;
	} catch (err) {
		const detail = String(err?.message ?? err);
		if (/没有可用的出图引擎|内置引擎不可用/.test(detail)) throw err;
		throw new Error(`渲染失败: ${cleanError(detail)}`);
	}
};
/** 按槽位顺序读取背景图，供列表页渲染 */
const collectBgItems = async (slots) => {
	const items = [];
	for (const slot of slots) {
		const file = await findBgFile(slot);
		if (!file) continue;
		const thumb = await ensureThumb(file);
		const src = pathToFileURL(thumb || file).href;
		let size = "";
		try {
			const stat = await fs.stat(file);
			size = stat.size >= 1048576 ? `${(stat.size / 1024 / 1024).toFixed(1)}MB` : `${Math.round(stat.size / 1024)}KB`;
		} catch {
			size = "";
		}
		items.push({
			slot,
			src,
			size
		});
	}
	return items;
};
/** 帮助页背景图：随包发布的 assets/help-bg.jpg（缺失时由调用方兜底） */
const HELP_BG_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "assets", "help-bg.jpg");

export { BG_DIR, COLORS, HELP_BG_FILE, MAX_SLOT, clearBgFile, collectBgItems, detectType, downloadImage, fileToDataUrl, findBgFile, fontSize, listBgSlots, pickBackground, qqAvatarUrl, qqBotAvatarUrl, randColor, renderPage, renderQuoteCard, resolveAvatarUrl, saveBg, toDataUrl };