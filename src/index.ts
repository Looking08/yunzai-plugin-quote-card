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
import { Router } from 'alemonjs';
import koaRouter from 'koa-router';
import { registerQuoteCard } from './quote-card';
import { registerQuoteCardHttp } from './quote-card/http';
import { quoteCardExpose } from './quote-card/expose';
import { browserStatusLine } from './quote-card/browser';

// 出图依赖本机已装的 Chrome / Chromium / Edge：启动时先把探测结果打出来，
// 免得等到用户第一次发指令才发现没有浏览器
try {
  const line = browserStatusLine();
  if (line.startsWith('⚠️')) logger.warn(`[名言卡片] ${line}`);
  else logger.info(`[名言卡片] ${line}`);
} catch {
  // logger 还没就绪就算了，不能因为一行日志影响插件加载
}

// 管理台 HTTP 接口
const r = new koaRouter({
  prefix: '/api'
});
registerQuoteCardHttp(r);

// 消息路由
const router = Router.create({
  events: ['message.create', 'private.message.create']
});

registerQuoteCard(router);

export default defineChildren({
  register() {
    return {
      responseRouter: router.define,
      koaRouter: r,
      // 老框架（未提供 Expose）下 quoteCardExpose 为 null，跳过即可
      ...(quoteCardExpose ? { expose: quoteCardExpose } : {})
    };
  }
});
