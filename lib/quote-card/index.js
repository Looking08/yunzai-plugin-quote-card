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
/**
* QQ 官方机器人（qq-bot）的正文会把附件拼成标签放在文字前面，形如
*   <attachmentType="image/jpeg",attachmentIndex=0,description="...">#添加名言照片
* alemon 的路由是按整段原文（MessageText）匹配的，不会剥掉这些标签，
* 于是「带图 + 命令」的写法会匹配失败。这里允许命令两侧出现若干这类标签。
*/
const TAG = "<[^>]*>";
const LEAD = `(?:\\s*${TAG})*\\s*`;
const TAIL = `(?:\\s*${TAG})*`;
/** 生成一条容错正则：忽略首尾的附件标签 */
const route = (body) => new RegExp(`^${LEAD}${PREFIX}${body}${TAIL}$`);
const registerQuoteCard = (router) => {
	router.res({
		events: [...EVENTS],
		regular: route("名言照片列表")
	}, () => import("./list-bg.js"));
	router.res({
		events: [...EVENTS],
		regular: route("名言帮助")
	}, () => import("./help.js"));
	router.res({
		events: [...EVENTS],
		regular: route("名言")
	}, () => import("./run.js"));
	router.res({
		events: [...EVENTS],
		regular: route("添加名言照片(\\d*)")
	}, () => import("./add-bg.js"));
	router.res({
		events: [...EVENTS],
		regular: route("删除名言照片(\\d*)")
	}, () => import("./del-bg.js"));
};

export { registerQuoteCard };
