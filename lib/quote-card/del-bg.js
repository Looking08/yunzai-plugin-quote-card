import { MAX_SLOT, clearBgFile, findBgFile } from "./service.js";
import { parseSlot } from "./quoted.js";
import { Format, useEvent, useMessage } from "alemonjs";

// src/quote-card/del-bg.ts
const EVENTS = ["message.create", "private.message.create"];
/**
* #删除名言照片N —— 主人删除指定槽位的背景
* 对应原插件 QuoteCard.delBg
*/
var del_bg_default = async () => {
	const [ref] = useEvent({ selects: [...EVENTS] });
	const event = ref.current;
	const [message] = useMessage();
	const reply = async (text) => {
		const format = Format.create();
		format.addText(text);
		await message.send({ format });
	};
	if (!event.IsMaster) {
		await reply("⚠️ 只有主人可以删除名言背景");
		return;
	}
	const n = parseSlot(event.MessageText ?? "");
	if (n > 100) {
		await reply(`⚠️ 槽位仅支持 1~${100}，例如 #删除名言照片1`);
		return;
	}
	if (!await findBgFile(n)) {
		await reply(`⚠️ 名言照片 ${n} 尚未设置`);
		return;
	}
	await clearBgFile(n);
	await reply(`🗑️ 名言照片 ${n} 已删除`);
};

export { del_bg_default as default };