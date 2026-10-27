import React from "react";

// src/quote-card/help-page.tsx
const PAGE_WIDTH = 1e3;
const YELLOW = "#FCC419";
const itemStyle = {
	display: "flex",
	alignItems: "flex-start",
	gap: 18,
	padding: "20px 22px",
	marginBottom: 16,
	background: "rgba(255,255,255,.07)",
	border: "1px solid rgba(255,255,255,.12)",
	borderRadius: 16
};
const cmdStyle = {
	flex: "0 0 auto",
	fontFamily: "\"JetBrains Mono\", Menlo, monospace",
	fontSize: 24,
	fontWeight: 700,
	borderRadius: 10,
	padding: "8px 16px",
	whiteSpace: "nowrap",
	marginTop: 2
};
const CMD_ON = {
	...cmdStyle,
	color: "#1a1a1a",
	background: YELLOW
};
const CMD_GHOST = {
	...cmdStyle,
	color: "#fff",
	background: "rgba(255,255,255,.14)"
};
const Item = ({ cmd, ghost, title, sub }) => /* @__PURE__ */ React.createElement("div", { style: itemStyle }, /* @__PURE__ */ React.createElement("div", { style: ghost ? CMD_GHOST : CMD_ON }, cmd), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("div", { style: {
	fontSize: 26,
	fontWeight: 700,
	marginBottom: 6
} }, title), /* @__PURE__ */ React.createElement("div", { style: {
	fontSize: 20,
	color: "rgba(255,255,255,.72)",
	lineHeight: 1.55
} }, sub)));
/**
* 名言卡片帮助页
* 由 Yunzai 插件资源 resources/help.html 迁移而来：背景图 + 深色蒙版 + 指令清单。
*/
function HelpPage({ bgImage, version = "1.0.0", listPublic = true }) {
	return /* @__PURE__ */ React.createElement("html", null, /* @__PURE__ */ React.createElement("head", null, /* @__PURE__ */ React.createElement("meta", { charSet: "utf-8" })), /* @__PURE__ */ React.createElement("body", { style: {
		margin: 0,
		padding: 0,
		width: PAGE_WIDTH,
		boxSizing: "border-box",
		background: "#111"
	} }, /* @__PURE__ */ React.createElement("div", { style: {
		position: "relative",
		width: PAGE_WIDTH,
		boxSizing: "border-box",
		padding: "64px 56px 48px",
		overflow: "hidden"
	} }, bgImage ? /* @__PURE__ */ React.createElement("img", {
		src: bgImage,
		alt: "",
		style: {
			position: "absolute",
			inset: 0,
			width: "100%",
			height: "100%",
			objectFit: "cover",
			zIndex: 0
		}
	}) : /* @__PURE__ */ React.createElement("div", { style: {
		position: "absolute",
		inset: 0,
		zIndex: 0,
		background: "linear-gradient(135deg,#1b1408,#2a1f0a)"
	} }), /* @__PURE__ */ React.createElement("div", { style: {
		position: "absolute",
		inset: 0,
		zIndex: 1,
		background: "linear-gradient(180deg, rgba(12,10,4,.86) 0%, rgba(12,10,4,.9) 45%, rgba(12,10,4,.95) 100%)"
	} }), /* @__PURE__ */ React.createElement("div", { style: {
		position: "relative",
		zIndex: 2,
		color: "#fff"
	} }, /* @__PURE__ */ React.createElement("div", { style: {
		fontSize: 20,
		letterSpacing: 6,
		color: YELLOW,
		fontWeight: 600,
		marginBottom: 16
	} }, "QUOTE CARD"), /* @__PURE__ */ React.createElement("div", { style: {
		fontSize: 64,
		fontWeight: 800,
		letterSpacing: 3,
		lineHeight: 1.15,
		textShadow: "0 4px 24px rgba(0,0,0,.7)"
	} }, "名言卡片", /* @__PURE__ */ React.createElement("br", null), "使用帮助"), /* @__PURE__ */ React.createElement("div", { style: {
		marginTop: 18,
		fontSize: 24,
		color: "rgba(255,255,255,.82)",
		lineHeight: 1.6
	} }, "引用别人的一句话，把它做成一张好看的卡片。"), /* @__PURE__ */ React.createElement("div", { style: {
		height: 3,
		width: 88,
		background: YELLOW,
		margin: "34px 0 30px",
		borderRadius: 2
	} }), /* @__PURE__ */ React.createElement(Item, {
		cmd: "#名言",
		title: "生成卡片 · 玻璃质感",
		sub: "引用一条消息后发送，头像在左、彩色玻璃底，字号随文字长度自适应。"
	}), /* @__PURE__ */ React.createElement(Item, {
		cmd: "#添加名言照片",
		ghost: true,
		title: "设置背景图（仅主人）",
		sub: "一次发多张图 + 指令，自动按顺序存成槽位；也可以写 #添加名言照片N 从指定槽位开始排（上限 100）。"
	}), /* @__PURE__ */ React.createElement(Item, {
		cmd: "#名言照片列表",
		ghost: true,
		title: `查看已有背景（${listPublic ? "所有人可用" : "仅主人"}）`,
		sub: "直接发出一张缩略图总览，每张带槽位号，看哪个不顺眼就删哪个。"
	}), /* @__PURE__ */ React.createElement(Item, {
		cmd: "#删除名言照片N",
		ghost: true,
		title: "删除背景（仅主人）",
		sub: "清空槽位 N 的背景图，删除后该槽位不再参与随机。"
	}), /* @__PURE__ */ React.createElement("div", { style: {
		marginTop: 28,
		padding: "22px 24px",
		borderLeft: `4px solid ${YELLOW}`,
		background: "rgba(252,196,25,.1)",
		borderRadius: "0 12px 12px 0",
		fontSize: 20,
		lineHeight: 1.7,
		color: "rgba(255,255,255,.88)"
	} }, "设了多张背景时，每次生成会", /* @__PURE__ */ React.createElement("b", { style: { color: YELLOW } }, "随机抽一张"), "；一张都不设就用随机纯色玻璃底。 图片保存在插件数据目录的 ", /* @__PURE__ */ React.createElement("b", { style: { color: YELLOW } }, "quote-card/backgrounds/"), "。"), /* @__PURE__ */ React.createElement("div", { style: {
		marginTop: 34,
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		fontSize: 18,
		color: "rgba(255,255,255,.5)",
		paddingTop: 20,
		borderTop: "1px solid rgba(255,255,255,.14)"
	} }, /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "Menlo, monospace" } }, "github.com/Looking08/yunzai-plugin-quote-card"), /* @__PURE__ */ React.createElement("span", null, "v", version))))));
}

export { HelpPage as default };