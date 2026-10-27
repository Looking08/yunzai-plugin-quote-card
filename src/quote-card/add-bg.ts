import { Format, useEvent, useMessage } from 'alemonjs';
import { MAX_SLOT, downloadImage, listBgSlots, saveBg } from './service';
import { parseExplicitSlot, resolveQuoted } from './quoted';

const EVENTS = ['message.create', 'private.message.create'] as const;

/**
 * #添加名言照片 / #添加名言照片N —— 主人发送图片保存为背景
 * 支持一次多张：
 *   不带数字 → 按顺序接在现有最大槽位后面
 *   带数字   → 从该槽位开始依次占用
 * 对应 Yunzai 插件 QuoteCard.addBg（v1.2.0 起的批量版）
 */
export default async () => {
  const [ref] = useEvent({ selects: [...EVENTS] });
  const event = ref.current as Record<string, any>;
  const [message] = useMessage();

  const reply = async (text: string) => {
    const format = Format.create();
    format.addText(text);
    await message.send({ format });
  };

  if (!event.IsMaster) {
    await reply('⚠️ 只有主人可以添加名言背景');
    return;
  }

  const startSlot = parseExplicitSlot(String(event.MessageText ?? ''));
  if (startSlot > MAX_SLOT) {
    await reply(`⚠️ 槽位仅支持 1~${MAX_SLOT}，例如 #添加名言照片10`);
    return;
  }

  // 当前消息自带的图片
  const media = Array.isArray(event.MessageMedia) ? event.MessageMedia : [];
  let urls: string[] = media
    .filter((item: any) => item?.Type === 'image')
    .map((item: any) => String(item.Url ?? ''))
    .filter(Boolean);

  // 没有则尝试从引用消息中取
  if (!urls.length) {
    const quoted = await resolveQuoted(event, messageId => message.get({ messageId }));
    urls = quoted?.imageUrls ?? [];
  }

  // 去重但保留顺序
  urls = [...new Set(urls)];
  if (!urls.length) {
    await reply('⚠️ 请附带图片（可一次发多张 + 命令，或引用一条带图消息）');
    return;
  }

  // 排号：显式指定就从它开始；否则接在现有最大槽位后面
  const exist = await listBgSlots();
  const base = startSlot || (exist.length ? exist[exist.length - 1] + 1 : 1);
  const targets: number[] = [];
  for (let i = 0; i < urls.length; i++) {
    const slot = base + i;
    if (slot > MAX_SLOT) break;
    targets.push(slot);
  }

  if (!targets.length) {
    await reply(`⚠️ 槽位已满（最多 ${MAX_SLOT} 个），请先删除一些再添加`);
    return;
  }

  const dropped = urls.length - targets.length;
  await reply(`⏳ 正在保存 ${targets.length} 张背景...`);

  const saved: number[] = [];
  const failed: number[] = [];
  let lastExt = 'jpg';
  let lastKb = 0;

  for (let i = 0; i < targets.length; i++) {
    const slot = targets[i];
    try {
      const buf = await downloadImage(urls[i]);
      const type = await saveBg(slot, buf);
      saved.push(slot);
      lastExt = type.ext;
      lastKb = Math.round(buf.length / 1024);
    } catch (err) {
      logger.error(`[名言卡片] 保存背景 ${slot} 失败: ${(err as Error).message}`);
      failed.push(slot);
    }
  }

  if (!saved.length) {
    await reply('❌ 保存背景失败，请检查图片链接是否可访问');
    return;
  }

  const range = saved.length === 1 ? `#${saved[0]}` : `#${saved[0]} ~ #${saved[saved.length - 1]}`;
  let text = `✅ 已保存 ${saved.length} 张：${range}`;
  if (saved.length === 1) text += `（${lastExt}，${lastKb}KB）`;
  if (failed.length) text += `\n⚠️ 失败：${failed.map(n => `#${n}`).join(' ')}`;
  if (dropped > 0) text += `\n⚠️ 槽位上限 ${MAX_SLOT}，有 ${dropped} 张未保存`;
  text += '\n发送 #名言照片列表 可查看';

  await reply(text);
};
