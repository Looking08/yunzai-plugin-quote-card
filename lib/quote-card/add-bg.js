import { MAX_SLOT, downloadImage, listBgSlots, saveBg } from "./service.js";
import { parseExplicitSlot, resolveQuoted } from "./quoted.js";
import { Format, useEvent, useMessage } from "alemonjs";

// src/quote-card/add-bg.ts
const EVENTS = ["message.create", "private.message.create"];
/**
* #添加名言照片 / #添加名言照片N —— 主人发送图片保存为背景
* 支持一次多张：
*   不带数字 → 按顺序接在现有最大槽位后面
*   带数字   → 从该槽位开始依次占用
* 对应 Yunzai 插件 QuoteCard.addBg（v1.2.0 起的批量版）
*/
var add_bg_default = async () => {
	const [ref] = useEvent({ selects: [...EVENTS] });
	const event = ref.current;
	const [message] = useMessage();
	const reply = async (text) => {
		const format = Format.create();
		format.addText(text);
		await message.send({ format });
	};
	if (!event.IsMaster) {
		await reply("⚠️ 只有主人可以添加名言背景");
		return;
	}
	const startSlot = parseExplicitSlot(String(event.MessageText ?? ""));
	if (startSlot > 100) {
		await reply(`⚠️ 槽位仅支持 1~${100}，例如 #添加名言照片10`);
		return;
	}
	let urls = (Array.isArray(event.MessageMedia) ? event.MessageMedia : []).filter((item) => item?.Type === "image").map((item) => String(item.Url ?? "")).filter(Boolean);
	if (!urls.length) urls = (await resolveQuoted(event, (messageId) => message.get({ messageId })))?.imageUrls ?? [];
	urls = [...new Set(urls)];
	if (!urls.length) {
		await reply("⚠️ 请附带图片（可一次发多张 + 命令，或引用一条带图消息）");
		return;
	}
	const exist = await listBgSlots();
	const base = startSlot || (exist.length ? exist[exist.length - 1] + 1 : 1);
	const targets = [];
	for (let i = 0; i < urls.length; i++) {
		const slot = base + i;
		if (slot > 100) break;
		targets.push(slot);
	}
	if (!targets.length) {
		await reply(`⚠️ 槽位已满（最多 ${100} 个），请先删除一些再添加`);
		return;
	}
	const dropped = urls.length - targets.length;
	await reply(`⏳ 正在保存 ${targets.length} 张背景...`);
	const saved = [];
	const failed = [];
	let lastExt = "jpg";
	let lastKb = 0;
	for (let i = 0; i < targets.length; i++) {
		const slot = targets[i];
		try {
			const buf = await downloadImage(urls[i]);
			const type = await saveBg(slot, buf);
			saved.push(slot);
			lastExt = type.ext;
			lastKb = Math.round(buf.length / 1024);
		} catch (err) {
			logger.error(`[名言卡片] 保存背景 ${slot} 失败: ${err.message}`);
			failed.push(slot);
		}
	}
	if (!saved.length) {
		await reply("❌ 保存背景失败，请检查图片链接是否可访问");
		return;
	}
	const range = saved.length === 1 ? `#${saved[0]}` : `#${saved[0]} ~ #${saved[saved.length - 1]}`;
	let text = `✅ 已保存 ${saved.length} 张：${range}`;
	if (saved.length === 1) text += `（${lastExt}，${lastKb}KB）`;
	if (failed.length) text += `\n⚠️ 失败：${failed.map((n) => `#${n}`).join(" ")}`;
	if (dropped > 0) text += `\n⚠️ 槽位上限 ${100}，有 ${dropped} 张未保存`;
	text += "\n发送 #名言照片列表 可查看";
	await reply(text);
};

export { add_bg_default as default };