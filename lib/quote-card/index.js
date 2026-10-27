// src/quote-card/index.ts
/**
* 名言卡片模块（Yunzai 插件 yunzai-plugin-quote-card 的 ALemonJS 实现）
*
* 命令：
*   #名言              引用一条消息后生成名言卡片
*   #添加名言照片      主人：一次发多张图，按顺序自动排号
*   #添加名言照片N     主人：从第 N 个槽位开始依次排（上限 100）
*   #删除名言照片N     主人：删除第 N 张背景
*   #名言照片列表      查看已有背景（缩略图总览，直接发图）
*   #名言帮助          图片版功能说明
*/
const EVENTS = ["message.create", "private.message.create"];
/** 前缀可选：# ＃ / ！ ! */
const PREFIX = "[#＃/!！]?";
const registerQuoteCard = (router) => {
	router.res({
		events: [...EVENTS],
		regular: new RegExp(`^${PREFIX}名言照片列表$`)
	}, () => import("./list-bg.js"));
	router.res({
		events: [...EVENTS],
		regular: new RegExp(`^${PREFIX}名言帮助$`)
	}, () => import("./help.js"));
	router.res({
		events: [...EVENTS],
		regular: new RegExp(`^${PREFIX}名言$`)
	}, () => import("./run.js"));
	router.res({
		events: [...EVENTS],
		regular: new RegExp(`^${PREFIX}添加名言照片(\\d*)$`)
	}, () => import("./add-bg.js"));
	router.res({
		events: [...EVENTS],
		regular: new RegExp(`^${PREFIX}删除名言照片(\\d*)$`)
	}, () => import("./del-bg.js"));
};

export { registerQuoteCard };