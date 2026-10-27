import { pickBackground, renderQuoteCard, resolveAvatarUrl } from "./service.js";
import { describeQuoteContext, resolveQuoted } from "./quoted.js";
import { Format, useEvent, useMessage } from "alemonjs";

// src/quote-card/run.ts
const EVENTS = ["message.create", "private.message.create"];
/**
* #名言 —— 引用一条消息后生成名言卡片
* 对应原插件 QuoteCard.run
* 兼容 OneBot（ReplyId + get_msg）与 QQ 官方机器人（MessageContent.msg_elements）
*/
var run_default = async () => {
	const [ref] = useEvent({ selects: [...EVENTS] });
	const event = ref.current;
	const [message] = useMessage();
	const reply = async (text) => {
		const format = Format.create();
		format.addText(text);
		await message.send({ format });
	};
	const quoted = await resolveQuoted(event, (messageId) => message.get({ messageId }));
	if (!quoted) {
		logger.warn(`[名言卡片] 未取到引用消息 ${describeQuoteContext(event)}`);
		await reply("⚠️ 请引用一条消息后发送 #名言");
		return;
	}
	const text = quoted.text;
	if (!text.trim()) {
		await reply("⚠️ 引用的消息没有文字内容");
		return;
	}
	await reply("🎨 正在生成卡片...");
	const botId = event.BotId ? String(event.BotId) : void 0;
	const senderId = String(event.UserId ?? "").trim();
	const senderName = String(event.UserName ?? "").trim();
	const quotedId = quoted.userId.trim();
	const quotedName = quoted.userName.trim();
	const isFallback = !quotedId && !quotedName;
	if (isFallback) logger.info("[名言卡片] 引用作者缺失，回退到发送者身份");
	const qq = quotedId || senderId;
	const avatarUrl = isFallback ? String(event.UserAvatar ?? "") || (senderId ? resolveAvatarUrl(senderId, botId) : "") : resolveAvatarUrl(quotedId, botId);
	const name = quotedName || senderName || "匿名";
	try {
		const bgImage = await pickBackground();
		const img = await renderQuoteCard({
			text,
			senderName: name,
			qq,
			avatarUrl,
			botId,
			bgImage
		});
		if (!img) {
			await reply("❌ 卡片生成失败，请稍后重试");
			return;
		}
		const format = Format.create();
		format.addImage(img);
		await message.send({ format });
	} catch (err) {
		logger.error(`[名言卡片] 渲染失败: ${err.message}`);
		await reply(`❌ 卡片生成失败: ${err.message.slice(0, 50)}`);
	}
};

export { run_default as default };