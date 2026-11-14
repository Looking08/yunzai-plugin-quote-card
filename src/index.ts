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
 * 管理台：/apps/<插件包名>/api/quote-card/admin（注册进主应用时则是 /app/api/quote-card/admin）
 *
 * 插件间共享（Expose，类 MCP）：协议名 quote-card，
 * 出图 / 背景清单 / 设置读写共 9 个动作，详见 src/quote-card/expose.ts
 */
import { Router } from 'alemonjs';
import koaRouter from 'koa-router';
import { registerQuoteCard } from './quote-card';
import { registerQuoteCardHttp } from './quote-card/http';
import { quoteCardExpose } from './quote-card/expose';
import { warmupRenderer } from './quote-card/renderer';

// 出图引擎自检：优先用随包安装的内置内核（不需要另装浏览器），
// 装不上再退回本机 Chrome / Chromium / Edge。启动时就把结论打出来，
// 免得等到用户第一次发指令才发现没引擎可用。
warmupRenderer()
  .then(line => {
    if (line.startsWith('⚠️')) logger.warn(`[名言卡片] ${line}`);
    else logger.info(`[名言卡片] ${line}`);
  })
  .catch((err: any) => {
    // 自检本身失败不影响插件加载
    logger.warn(`[名言卡片] 渲染引擎自检失败: ${err?.message ?? err}`);
  });

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
