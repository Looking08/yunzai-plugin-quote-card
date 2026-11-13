import { registerQuoteCard } from "./quote-card/index.js";
import { registerQuoteCardHttp } from "./quote-card/http.js";
import quoteCardExpose from "./quote-card/expose.js";
import { Router } from "alemonjs";
import koaRouter from "koa-router";

// src/index.ts
/**
* alemonjs-quote-card —— 名言卡片插件（ALemonJS 版）
*
* 命令：
*   #名言              引用一条消息后生成名言卡片
*   #添加名言照片N     主人：附带图片保存为第 N 张背景
*   #删除名言照片N     主人：删除第 N 张背景
*   #名言照片列表      查看已有背景（缩略图总览）
*   #名言帮助          图片版功能说明
*
* 管理台：/app/api/quote-card/admin
*
* 插件间共享（Expose，类 MCP）：协议名 quote-card，
* 出图 / 背景清单 / 设置读写共 9 个动作，详见 src/quote-card/expose.ts
*/
const r = new koaRouter({ prefix: "/api" });
registerQuoteCardHttp(r);
const router = Router.create({ events: ["message.create", "private.message.create"] });
registerQuoteCard(router);
var src_default = defineChildren({ register() {
	return {
		responseRouter: router.define,
		koaRouter: r,
		...quoteCardExpose ? { expose: quoteCardExpose } : {}
	};
} });

export { src_default as default };