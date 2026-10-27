import { readSettings } from "./settings.js";
import { HELP_BG_FILE, fileToDataUrl, pickBackground, renderPage } from "./service.js";
import HelpPage from "./help-page.js";
import { Format, useEvent, useMessage } from "alemonjs";
import fs from "node:fs/promises";
import React from "react";

// src/quote-card/help.ts
const EVENTS = ["message.create", "private.message.create"];
/** 读 package.json 的版本号（src 与 lib 两种层级都能命中） */
const readVersion = async () => {
	try {
		const raw = await fs.readFile(new URL("../../package.json", import.meta.url), "utf8");
		return JSON.parse(raw).version ?? "1.0.0";
	} catch {
		return "1.0.0";
	}
};
/**
* #名言帮助 —— 图+文介绍插件功能
* 背景优先用随包发布的 assets/help-bg.jpg，缺失时用一张用户背景图兜底
*/
var help_default = async () => {
	const [ref] = useEvent({ selects: [...EVENTS] });
	ref.current;
	const [message] = useMessage();
	const reply = async (text) => {
		const format = Format.create();
		format.addText(text);
		await message.send({ format });
	};
	try {
		const settings = await readSettings();
		const bgImage = await fileToDataUrl(HELP_BG_FILE) || await pickBackground();
		const version = await readVersion();
		const img = await renderPage(React.createElement(HelpPage, {
			bgImage,
			version,
			listPublic: settings.listPublic
		}), 92);
		if (!img) {
			await reply("❌ 帮助图生成失败，请检查 chromium 是否正常");
			return;
		}
		const format = Format.create();
		format.addImage(img);
		await message.send({ format });
	} catch (err) {
		logger.error(`[名言卡片] 帮助图渲染失败: ${err.message}`);
		await reply(`❌ 帮助图生成失败: ${err.message.slice(0, 50)}`);
	}
};

export { help_default as default };