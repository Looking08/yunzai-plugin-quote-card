import { readSettings } from "./settings.js";
import { collectBgItems, listBgSlots, renderPage } from "./service.js";
import ListPage from "./list-page.js";
import { Format, useEvent, useMessage } from "alemonjs";
import React from "react";

// src/quote-card/list-bg.ts
const EVENTS = ["message.create", "private.message.create"];
/** 单次最多画几张缩略图 */
const MAX_SHOW = 24;
/**
* #名言照片列表 —— 渲染缩略图总览，直接以图片消息发出（不再包合并转发）
* 默认所有人可看；settings.listPublic = false 时仅主人可用
*/
var list_bg_default = async () => {
	const [ref] = useEvent({ selects: [...EVENTS] });
	const event = ref.current;
	const [message] = useMessage();
	const reply = async (text) => {
		const format = Format.create();
		format.addText(text);
		await message.send({ format });
	};
	const settings = await readSettings();
	const isMaster = Boolean(event.IsMaster);
	if (!settings.listPublic && !isMaster) return;
	const slots = await listBgSlots();
	if (!slots.length) {
		await reply("⚠️ 还没有设置过背景图，发一张图片并带上「#添加名言照片」即可添加");
		return;
	}
	const shownSlots = slots.slice(0, MAX_SHOW);
	const items = await collectBgItems(shownSlots);
	if (!items.length) {
		await reply("⚠️ 背景图读取失败，可能文件已损坏");
		return;
	}
	try {
		const img = await renderPage(React.createElement(ListPage, {
			items,
			total: slots.length,
			shown: items.length,
			listPublic: settings.listPublic,
			canEdit: isMaster
		}), 90);
		if (!img) {
			await reply("❌ 列表图生成失败，请检查 chromium 是否正常");
			return;
		}
		const format = Format.create();
		format.addImage(img);
		await message.send({ format });
	} catch (err) {
		logger.error(`[名言卡片] 列表渲染失败: ${err.message}`);
		await reply(`❌ 列表图生成失败: ${err.message.slice(0, 50)}`);
	}
};

export { list_bg_default as default };