import { adminPageHtml } from "./admin.js";
import { readSettings, writeSettings } from "./settings.js";
import { MAX_SLOT, clearBgFile, detectType, downloadImage, findBgFile, listBgSlots, pickBackground, renderQuoteCard, saveBg } from "./service.js";
import path from "node:path";
import fs from "node:fs/promises";

// src/quote-card/http.ts
const MAX_BODY = 16777216;
const ok = (ctx, data = null, message = "ok") => {
	ctx.status = 200;
	ctx.type = "application/json; charset=utf-8";
	ctx.body = JSON.stringify({
		code: 200,
		message,
		data
	});
};
const fail = (ctx, message, code = 400, status = 200) => {
	ctx.status = status;
	ctx.type = "application/json; charset=utf-8";
	ctx.body = JSON.stringify({
		code,
		message,
		data: null
	});
};
/** 手动读取请求体，避免依赖额外的 body 解析中间件 */
const readBody = (ctx, limit = MAX_BODY) => new Promise((resolve, reject) => {
	const chunks = [];
	let size = 0;
	let done = false;
	ctx.req.on("data", (chunk) => {
		if (done) return;
		size += chunk.length;
		if (size > limit) {
			done = true;
			reject(/* @__PURE__ */ new Error("图片过大，请控制在 12MB 以内"));
			ctx.req.destroy();
			return;
		}
		chunks.push(chunk);
	});
	ctx.req.on("end", () => {
		if (done) return;
		done = true;
		resolve(Buffer.concat(chunks).toString("utf8"));
	});
	ctx.req.on("error", (err) => {
		if (done) return;
		done = true;
		reject(err);
	});
});
const readJson = async (ctx) => {
	const raw = await readBody(ctx);
	if (!raw) return {};
	try {
		return JSON.parse(raw);
	} catch {
		throw new Error("请求体不是合法 JSON");
	}
};
const parseSlot = (value) => {
	const n = Math.round(Number(value));
	if (!Number.isFinite(n) || n < 1 || n > 100) return null;
	return n;
};
/** 解析 data URL 或裸 base64 */
const decodeDataUrl = (input) => {
	const value = String(input ?? "");
	const matched = value.match(/^data:([^;]+);base64,(.+)$/);
	if (matched) return Buffer.from(matched[2], "base64");
	if (/^[A-Za-z0-9+/=\s]+$/.test(value) && value.length > 64) return Buffer.from(value, "base64");
	return null;
};
const listBackgrounds = async () => {
	const slots = await listBgSlots();
	const items = [];
	for (const slot of slots) {
		const file = await findBgFile(slot);
		if (!file) continue;
		try {
			const stat = await fs.stat(file);
			items.push({
				slot,
				ext: path.extname(file).slice(1).toLowerCase(),
				size: stat.size,
				updatedAt: stat.mtimeMs
			});
		} catch {}
	}
	return {
		slots: items,
		maxSlot: 100
	};
};
/**
* 注册名言卡片管理接口（挂在应用 koaRouter 上，最终路径形如 /app/api/quote-card/*）
*/
const registerQuoteCardHttp = (router) => {
	router.get("/quote-card/admin", (ctx) => {
		ctx.status = 200;
		ctx.type = "text/html; charset=utf-8";
		ctx.body = adminPageHtml();
	});
	router.get("/quote-card/settings", async (ctx) => {
		try {
			ok(ctx, await readSettings(), "卡片设置");
		} catch (err) {
			fail(ctx, err.message, 500);
		}
	});
	router.post("/quote-card/settings", async (ctx) => {
		try {
			const body = await readJson(ctx);
			const saved = await writeSettings(body);
			logger.info(`[名言卡片] 分辨率更新为 ${saved.width}x${saved.height} (q=${saved.quality})`);
			ok(ctx, saved, "设置已保存");
		} catch (err) {
			fail(ctx, err.message);
		}
	});
	router.get("/quote-card/backgrounds", async (ctx) => {
		try {
			ok(ctx, await listBackgrounds(), "背景列表");
		} catch (err) {
			fail(ctx, err.message, 500);
		}
	});
	router.post("/quote-card/backgrounds", async (ctx) => {
		try {
			const body = await readJson(ctx);
			const slot = parseSlot(body.slot);
			if (!slot) {
				fail(ctx, `槽位需在 1–${100} 之间`);
				return;
			}
			const buf = decodeDataUrl(body.dataUrl);
			if (!buf || !buf.length) {
				fail(ctx, "图片数据无效，请上传图片文件");
				return;
			}
			const type = await saveBg(slot, buf);
			ok(ctx, {
				slot,
				ext: type.ext,
				size: buf.length
			}, "背景已保存");
		} catch (err) {
			fail(ctx, err.message);
		}
	});
	router.post("/quote-card/backgrounds/url", async (ctx) => {
		try {
			const body = await readJson(ctx);
			const slot = parseSlot(body.slot);
			if (!slot) {
				fail(ctx, `槽位需在 1–${100} 之间`);
				return;
			}
			const url = String(body.url ?? "").trim();
			if (!/^https?:\/\//i.test(url)) {
				fail(ctx, "请填写 http(s) 图片地址");
				return;
			}
			const buf = await downloadImage(url);
			const type = await saveBg(slot, buf);
			ok(ctx, {
				slot,
				ext: type.ext,
				size: buf.length
			}, "背景已保存");
		} catch (err) {
			fail(ctx, err.message);
		}
	});
	router.delete("/quote-card/backgrounds/:slot", async (ctx) => {
		try {
			const slot = parseSlot(ctx.params?.slot);
			if (!slot) {
				fail(ctx, `槽位需在 1–${100} 之间`);
				return;
			}
			if (!await findBgFile(slot)) {
				fail(ctx, `槽位 ${slot} 尚未设置背景`);
				return;
			}
			await clearBgFile(slot);
			ok(ctx, { slot }, "背景已删除");
		} catch (err) {
			fail(ctx, err.message);
		}
	});
	router.get("/quote-card/backgrounds/:slot", async (ctx) => {
		const slot = parseSlot(ctx.params?.slot);
		if (!slot) {
			ctx.status = 400;
			ctx.body = "invalid slot";
			return;
		}
		const file = await findBgFile(slot);
		if (!file) {
			ctx.status = 404;
			ctx.body = "not found";
			return;
		}
		const buf = await fs.readFile(file);
		ctx.status = 200;
		ctx.type = detectType(buf).mime;
		ctx.set("Cache-Control", "no-cache");
		ctx.body = buf;
	});
	router.post("/quote-card/preview", async (ctx) => {
		try {
			const body = await readJson(ctx);
			const settings = await readSettings();
			const bgImage = await pickBackground();
			const buf = await renderQuoteCard({
				text: String(body.text ?? "人生若只如初见，何事秋风悲画扇。"),
				senderName: String(body.senderName ?? "预览用户"),
				qq: String(body.qq ?? "10001"),
				bgImage
			});
			if (!buf) {
				fail(ctx, "预览生成失败");
				return;
			}
			ok(ctx, {
				image: `data:image/jpeg;base64,${buf.toString("base64")}`,
				width: settings.width,
				height: settings.height,
				size: buf.length
			}, "预览已生成");
		} catch (err) {
			fail(ctx, err.message, 500);
		}
	});
};

export { registerQuoteCardHttp };