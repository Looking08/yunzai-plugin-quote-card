/**
 * Expose 提供者 —— 把名言卡片的「出图 / 背景管理 / 设置」能力共享给同一实例里的
 * 其他插件与 AI（思路同 alemonjs-roco 的 game-hub，类似 MCP 的 tool 目录）。
 *
 * 消费方示例（新框架 2.1.12x，带超时与结构化错误）：
 *   const r = await Expose.create().call('quote-card', 'my-plugin', 'render_card',
 *     { text: '人生如逆旅', author: '苏轼' }, { timeoutMs: 20000 })
 *   if (r.ok) r.data.image // data:image/jpeg;base64,...
 *
 * 消费方示例（旧框架 2.1.11x）：
 *   const [p] = Expose.create().list('quote-card')
 *   const out = await p.invoke('render_card', { text: '...' })
 *
 * 兼容性说明：
 *   2.1.11x 只有 { description, params, returns, handler }，handler 只收到一个 value，
 *   没有 schema 校验、没有 authorize、没有 context；2.1.12x 增加了 Expose.action()、
 *   inputSchema/outputSchema、effect、authorize 和 ExposeCallContext。
 *   这里按运行时能力探测，一次定义两种形态都能注册。
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
import React from 'react';
import * as alemon from 'alemonjs';
import {
  collectBgItems,
  downloadImage,
  fileToDataUrl,
  findBgFile,
  HELP_BG_FILE,
  listBgSlots,
  MAX_SLOT,
  pickBackground,
  renderPage,
  renderQuoteCard,
  clearBgFile,
  saveBg
} from './service';
import { readSettings, writeSettings } from './settings';
import HelpPage from './help-page';
import ListPage from './list-page';

/** 协议名（消费方按这个名字找提供者） */
export const EXPOSE_PROTOCOL = 'quote-card';

/** 契约版本：动作增减时递增，消费方可据此判断兼容性 */
const EXPOSE_VERSION = '1.0.0';

/** 列表类动作单次最多返回多少张预览图，别把消息体撑爆 */
const MAX_PREVIEW = 24;

/** 背景图上限 20MB（data URL 解码后） */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

type $Any = Record<string, any>;

/* ---------------------------------------------------------------- 兼容层 */

const ExposeApi: any = (alemon as any).Expose;

/** 新版才有的 Expose.action / ExposeError，旧版退化成普通对象 / 普通 Error */
const ExposeErrorClass: any = (alemon as any).ExposeError;

/** 构造带 code 的失败：新版是 ExposeError，旧版手工挂 code */
const fail = (code: string, message: string): Error => {
  if (typeof ExposeErrorClass === 'function') return new ExposeErrorClass(code, message);
  const err: any = new Error(message);
  err.name = 'ExposeError';
  err.code = code;
  return err;
};

/** 动作规格：两版字段并集，注册时按框架能力裁剪 */
type ActionSpec = {
  description: string;
  params?: Record<string, string>;
  returns?: Record<string, string>;
  inputSchema?: $Any;
  outputSchema?: $Any;
  effect?: 'read' | 'write' | 'unknown';
  authorize?: (input: any, context: any) => boolean;
  handler: (input: any, context?: any) => any;
};

const action = (spec: ActionSpec) => (typeof ExposeApi?.action === 'function' ? ExposeApi.action(spec) : spec);

/** 当前消息事件（旧版 2.1.113 也有 getCurrentEvent，但保险起见做存在性判断） */
const currentEvent = (): $Any | null => {
  const fn = (alemon as any).getCurrentEvent;
  if (typeof fn !== 'function') return null;
  try {
    return fn() ?? null;
  } catch {
    return null;
  }
};

/* ---------------------------------------------------------------- schema 小工具 */

const emptyInput: $Any = { type: 'object', properties: {}, additionalProperties: false };

const str = (description: string, extra: $Any = {}): $Any => ({
  type: 'string',
  ...(description ? { description } : {}),
  ...extra
});

const int = (description: string, extra: $Any = {}): $Any => ({
  type: 'integer',
  ...(description ? { description } : {}),
  ...extra
});

const obj = (properties: Record<string, $Any>, required?: string[]): $Any => ({
  type: 'object',
  properties,
  ...(required?.length ? { required } : {}),
  additionalProperties: false
});

/** 所有动作统一的返回结构 */
const cardOutput: $Any = obj(
  {
    status: { type: 'string', enum: ['success', 'error'], description: 'success = 成功；error = 业务失败（text 为原因）' },
    text: str('给用户看的一句话摘要；status=error 时是失败原因'),
    image: str('图片结果，data URL（data:image/jpeg;base64,...）；无图或失败为空串'),
    data: str('附加数据，JSON 字符串（字段随动作不同）；无附加数据或失败为空串')
  },
  ['status', 'text', 'image', 'data']
);

const ok = (text: string, image = '', data = ''): $Any => ({ status: 'success', text, image, data });

const errOut = (e: unknown): $Any => ({
  status: 'error',
  text: String((e as any)?.message ?? e ?? '未知错误').slice(0, 300),
  image: '',
  data: ''
});

/* ---------------------------------------------------------------- 入参校验（旧框架没有 schema 校验） */

const readStr = (value: unknown, name: string, maxLength: number): string => {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw fail('INVALID_INPUT', `${name} 应为字符串`);
  if (value.length > maxLength) throw fail('INVALID_INPUT', `${name} 过长（上限 ${maxLength} 字符）`);
  return value;
};

const readInt = (value: unknown, name: string, min: number, max: number): number => {
  if (value === undefined || value === null || value === '') return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) {
    throw fail('INVALID_INPUT', `${name} 应为 ${min}~${max} 的整数`);
  }
  return n;
};

/* ---------------------------------------------------------------- 配置与授权 */

type ExposeConf = {
  enabled: boolean;
  allowedCallers: string[] | null;
  requireMasterForWrite: boolean;
};

/**
 * 读 alemon.config.yaml（顶层，与平台段同级）：
 *   quote-card:
 *     expose:
 *       enabled: true                 # 总开关，默认 true
 *       allowed_callers: []           # 允许的调用方插件名，留空/缺省 = 不限
 *       require_master_for_write: true # 写操作（改设置/增删背景）仅限主人，默认 true
 */
const readExposeConfig = (): ExposeConf => {
  let root: $Any = {};
  try {
    root = ((alemon as any).getConfigValue?.() as $Any) ?? {};
  } catch {
    root = {};
  }

  // 允许两种写法：quote-card（与协议同名，推荐）或包名
  const conf = root?.['quote-card']?.expose ?? root?.['alemonjs-quote-card']?.expose;
  if (conf !== undefined && conf !== null && (typeof conf !== 'object' || Array.isArray(conf))) {
    throw fail('FORBIDDEN', 'quote-card.expose 配置格式不正确（应为对象）');
  }

  const allowed = conf?.allowed_callers;
  if (
    allowed !== undefined &&
    !(Array.isArray(allowed) && allowed.every((v: unknown) => typeof v === 'string' && v.trim() && v.trim() === v))
  ) {
    throw fail('FORBIDDEN', 'quote-card.expose.allowed_callers 应为非空字符串数组');
  }

  return {
    enabled: conf?.enabled !== false,
    allowedCallers: Array.isArray(allowed) && allowed.length ? allowed : null,
    requireMasterForWrite: conf?.require_master_for_write !== false
  };
};

/**
 * 授权：配置开关 → 调用方白名单 → 写操作要求主人身份（来自当前消息事件）
 * 抛出的错误在旧框架上会直接冒泡给调用方，新框架则返回 FORBIDDEN
 */
const assertAllowed = (context: any, options: { write?: boolean } = {}) => {
  const conf = readExposeConfig();
  if (!conf.enabled) throw fail('FORBIDDEN', 'quote-card 的 expose 能力已被配置关闭');

  if (conf.allowedCallers) {
    const caller = context?.callerApp;
    if (!caller) throw fail('FORBIDDEN', '本动作不允许无插件身份的调用');
    if (!conf.allowedCallers.includes(caller)) {
      throw fail('FORBIDDEN', `调用方 ${caller} 不在 quote-card.expose.allowed_callers 白名单内`);
    }
  }

  if (options.write && conf.requireMasterForWrite) {
    const event = currentEvent();
    if (!event) throw fail('FORBIDDEN', '写操作需要在聊天消息链路内发起（按消息身份判断是否为机器人主人）');
    if (!event.IsMaster) throw fail('FORBIDDEN', '写操作仅限机器人主人');
  }

  context?.signal?.throwIfAborted?.();
};

/* ---------------------------------------------------------------- 渲染与文件小工具 */

const jpegDataUrl = (buf: Buffer) => `data:image/jpeg;base64,${buf.toString('base64')}`;

const safeJson = (value: unknown) => {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return '';
  }
};

/** 读 package.json 的版本号（src 与 lib 两种层级都能命中） */
const readVersion = async (): Promise<string> => {
  try {
    const raw = await fs.readFile(new URL('../../package.json', import.meta.url), 'utf8');
    return (JSON.parse(raw) as { version?: string }).version ?? '1.0.0';
  } catch {
    return '1.0.0';
  }
};

/** 指定槽位的背景转 data URL；槽位没图就报业务错误 */
const slotBackground = async (slot: number): Promise<string> => {
  const file = await findBgFile(slot);
  if (!file) throw new Error(`背景槽位 ${slot} 还没有图片`);
  // file:// 直读，别把十几 MB 的图转成 base64 再塞进 HTML
  return pathToFileURL(file).href;
};

/** 下一个空槽位（写满为止） */
const nextFreeSlot = async (): Promise<number> => {
  const slots = await listBgSlots();
  for (let n = 1; n <= MAX_SLOT; n++) if (!slots.includes(n)) return n;
  throw new Error(`背景槽位已满（上限 ${MAX_SLOT}）`);
};

/** data URL / http 地址 → Buffer */
const decodeImage = async (raw: string): Promise<Buffer> => {
  const m = /^data:([^;,]*)((?:;[^;,]*)*);base64,(.*)$/s.exec(raw);
  if (m) {
    const buf = Buffer.from(m[3], 'base64');
    if (!buf.length) throw new Error('图片数据为空');
    return buf;
  }
  if (/^https?:\/\//i.test(raw)) return downloadImage(raw);
  throw new Error('image 需要是 data URL（base64）或 http(s) 图片地址');
};

/* ---------------------------------------------------------------- 动作实现 */

/** 指令菜单（纯文本，给 AI / 其他插件当索引用） */
const getHelp = action({
  description: '查询名言卡片的指令清单与用途（纯文本，不渲染图片）',
  params: {},
  returns: { text: '指令说明' },
  inputSchema: emptyInput,
  outputSchema: cardOutput,
  effect: 'read',
  authorize: (_input, context) => {
    assertAllowed(context);
    return true;
  },
  handler: async (_input: any, context?: any) => {
    assertAllowed(context);
    const version = await readVersion();
    const settings = await readSettings();
    const slots = await listBgSlots();
    const lines = [
      `名言卡片 v${version}`,
      '',
      '引用一条消息后发送：',
      '  #名言              生成名言卡片（引用谁就署谁的名，头像跟随）',
      '  #名言帮助          这张图片版说明',
      '  #名言照片列表      查看已有背景（缩略图总览，直接发图）',
      '',
      '主人指令：',
      '  #添加名言照片      发图时加这句，按顺序自动排号（上限 100 张）',
      '  #添加名言照片N     从第 N 个槽位开始依次排',
      '  #删除名言照片N     删除第 N 张背景',
      '',
      `当前设置：${settings.width}×${settings.height}，质量 ${settings.quality}，背景 ${slots.length} 张`
    ];
    return ok(lines.join('\n'), '', safeJson({ version, settings, slots }));
  }
});

/** 出图：文本 + 署名 → 名言卡片 */
const renderCard = action({
  description: '把一段文字渲染成名言卡片图片（JPEG data URL）。背景可按槽位指定，缺省随机挑一张已设置的背景',
  params: {
    text: '名言正文（必填，1~500 字）',
    author: '署名，缺省「匿名」',
    qq: '署名人的 QQ 号或 openid，用来取头像',
    avatarUrl: '直接指定头像地址，优先于 qq',
    bgColor: '背景色，如 #FF6B6B，缺省随机',
    background: '背景槽位 1~100，缺省随机'
  },
  returns: { image: 'JPEG data URL', text: '摘要' },
  inputSchema: obj(
    {
      text: str('要印在卡片上的正文（必填）', { minLength: 1, maxLength: 500 }),
      author: str('署名（说话人昵称），留空用「匿名」', { maxLength: 32 }),
      qq: str('署名人的 QQ 号或 openid，用于取头像；留空则无头像', { maxLength: 64 }),
      avatarUrl: str('头像图片地址（http(s) 或 data URL），优先于 qq', { maxLength: 4096 }),
      bgColor: str('背景色，形如 #FF6B6B；留空随机', { maxLength: 16 }),
      background: int('背景槽位 1~100；留空随机挑一张已设置的背景', { minimum: 1, maximum: MAX_SLOT })
    },
    ['text']
  ),
  outputSchema: cardOutput,
  effect: 'read',
  authorize: (_input, context) => {
    assertAllowed(context);
    return true;
  },
  handler: async (input: $Any, context?: any) => {
    assertAllowed(context);
    try {
      const text = readStr(input?.text, 'text', 500).trim();
      if (!text) throw fail('INVALID_INPUT', 'text 不能为空');

      const author = readStr(input?.author, 'author', 32).trim() || '匿名';
      const qq = readStr(input?.qq, 'qq', 64).trim();
      const avatarUrl = readStr(input?.avatarUrl, 'avatarUrl', 4096).trim();
      const bgColor = readStr(input?.bgColor, 'bgColor', 16).trim();
      const slot = readInt(input?.background, 'background', 1, MAX_SLOT);

      const bgImage = slot ? await slotBackground(slot) : await pickBackground();
      const settings = await readSettings();

      const buf = await renderQuoteCard({
        text,
        senderName: author,
        qq,
        avatarUrl: avatarUrl || undefined,
        bgColor: bgColor || undefined,
        bgImage
      });
      if (!buf) throw new Error('卡片渲染返回空图片');

      return ok(
        `已生成名言卡片（${settings.width}×${settings.height}）`,
        jpegDataUrl(buf),
        safeJson({ width: settings.width, height: settings.height, author, slot: slot || null, background: slot ? slot : 'random' })
      );
    } catch (e: any) {
      if (e?.code) throw e;
      return errOut(e);
    }
  }
});

/** 帮助图 */
const renderHelp = action({
  description: '渲染插件帮助图（JPEG data URL），内容与聊天里的 #名言帮助 一致',
  params: {},
  returns: { image: 'JPEG data URL' },
  inputSchema: emptyInput,
  outputSchema: cardOutput,
  effect: 'read',
  authorize: (_input, context) => {
    assertAllowed(context);
    return true;
  },
  handler: async (_input: any, context?: any) => {
    assertAllowed(context);
    try {
      const settings = await readSettings();
      const bgImage = (await fileToDataUrl(HELP_BG_FILE)) || (await pickBackground());
      const version = await readVersion();
      const buf = await renderPage(
        React.createElement(HelpPage, { bgImage, version, listPublic: settings.listPublic }),
        92
      );
      if (!buf) throw new Error('帮助图渲染返回空图片');
      return ok(`已生成帮助图（v${version}）`, jpegDataUrl(buf), safeJson({ version, listPublic: settings.listPublic }));
    } catch (e: any) {
      if (e?.code) throw e;
      return errOut(e);
    }
  }
});

/** 背景总览图 */
const renderGallery = action({
  description: '渲染背景缩略图总览（JPEG data URL），内容与聊天里的 #名言照片列表 一致',
  params: {},
  returns: { image: 'JPEG data URL' },
  inputSchema: emptyInput,
  outputSchema: cardOutput,
  effect: 'read',
  authorize: (_input, context) => {
    assertAllowed(context);
    return true;
  },
  handler: async (_input: any, context?: any) => {
    assertAllowed(context);
    try {
      const slots = await listBgSlots();
      if (!slots.length) throw new Error('还没有设置过背景图');

      const shownSlots = slots.slice(0, MAX_PREVIEW);
      const items = await collectBgItems(shownSlots);
      if (!items.length) throw new Error('背景图读取失败，可能文件已损坏');

      const settings = await readSettings();
      const buf = await renderPage(
        React.createElement(ListPage, {
          items,
          total: slots.length,
          shown: items.length,
          listPublic: settings.listPublic,
          canEdit: false
        }),
        90
      );
      if (!buf) throw new Error('列表图渲染返回空图片');

      return ok(`共 ${slots.length} 张背景`, jpegDataUrl(buf), safeJson({ total: slots.length, shown: items.length }));
    } catch (e: any) {
      if (e?.code) throw e;
      return errOut(e);
    }
  }
});

/** 背景清单（槽位 + 体积 + 缩略图预览） */
const listBackgrounds = action({
  description: '列出已设置的背景：槽位号、体积、格式与缩略图预览（不含原图）',
  params: {},
  returns: { data: 'JSON：{ total, slots: [{ slot, bytes, size, format, preview }] }' },
  inputSchema: emptyInput,
  outputSchema: cardOutput,
  effect: 'read',
  authorize: (_input, context) => {
    assertAllowed(context);
    return true;
  },
  handler: async (_input: any, context?: any) => {
    assertAllowed(context);
    try {
      const slots = await listBgSlots();
      const shownSlots = slots.slice(0, MAX_PREVIEW);
      const items = await collectBgItems(shownSlots);

      const detail = [];
      for (const item of items) {
        let bytes = 0;
        let format = '';
        try {
          const file = await findBgFile(item.slot);
          if (file) {
            const stat = await fs.stat(file);
            bytes = stat.size;
            format = file.slice(file.lastIndexOf('.') + 1).toLowerCase();
          }
        } catch {
          // 忽略，体积/格式留空
        }
        // item.src 是缩略图（480px）的 file:// 地址，原图可能有几十 MB，别往消息里塞
        const preview = await fileToDataUrl(fileURLToPath(item.src));
        detail.push({ slot: item.slot, bytes, size: item.size, format, preview });
      }

      const text = slots.length
        ? `共 ${slots.length} 张背景${slots.length > shownSlots.length ? `（预览前 ${shownSlots.length} 张）` : ''}`
        : '还没有设置过背景图';
      return ok(text, '', safeJson({ total: slots.length, slots: detail }));
    } catch (e: any) {
      if (e?.code) throw e;
      return errOut(e);
    }
  }
});

/** 读设置 */
const getSettings = action({
  description: '查询当前卡片设置：输出尺寸、JPEG 质量、背景列表是否公开',
  params: {},
  returns: { data: 'JSON：{ width, height, quality, listPublic }' },
  inputSchema: emptyInput,
  outputSchema: cardOutput,
  effect: 'read',
  authorize: (_input, context) => {
    assertAllowed(context);
    return true;
  },
  handler: async (_input: any, context?: any) => {
    assertAllowed(context);
    try {
      const settings = await readSettings();
      return ok(
        `${settings.width}×${settings.height}，质量 ${settings.quality}，背景列表${settings.listPublic ? '公开' : '仅主人'}`,
        '',
        safeJson(settings)
      );
    } catch (e: any) {
      if (e?.code) throw e;
      return errOut(e);
    }
  }
});

/** 写设置（主人） */
const setSettings = action({
  description: '修改卡片设置（写操作，默认仅机器人主人可用）：输出尺寸、JPEG 质量、背景列表是否公开',
  params: { width: '480~3840', height: '240~2160', quality: '60~100', listPublic: '布尔' },
  returns: { data: 'JSON：写入后的完整设置' },
  inputSchema: obj({
    width: int('输出宽度 480~3840', { minimum: 480, maximum: 3840 }),
    height: int('输出高度 240~2160', { minimum: 240, maximum: 2160 }),
    quality: int('JPEG 质量 60~100', { minimum: 60, maximum: 100 }),
    listPublic: { type: 'boolean', description: '#名言照片列表 是否所有人可见' }
  }),
  outputSchema: cardOutput,
  effect: 'write',
  authorize: (_input, context) => {
    assertAllowed(context, { write: true });
    return true;
  },
  handler: async (input: $Any, context?: any) => {
    assertAllowed(context, { write: true });
    try {
      const patch: $Any = {};
      if (input?.width !== undefined) patch.width = readInt(input.width, 'width', 480, 3840);
      if (input?.height !== undefined) patch.height = readInt(input.height, 'height', 240, 2160);
      if (input?.quality !== undefined) patch.quality = readInt(input.quality, 'quality', 60, 100);
      if (input?.listPublic !== undefined) {
        if (typeof input.listPublic !== 'boolean') throw fail('INVALID_INPUT', 'listPublic 应为布尔值');
        patch.listPublic = input.listPublic;
      }
      if (!Object.keys(patch).length) throw fail('INVALID_INPUT', '没有要修改的字段');

      const next = await writeSettings(patch);
      return ok(
        `已更新：${next.width}×${next.height}，质量 ${next.quality}，背景列表${next.listPublic ? '公开' : '仅主人'}`,
        '',
        safeJson(next)
      );
    } catch (e: any) {
      if (e?.code) throw e;
      return errOut(e);
    }
  }
});

/** 加背景（主人） */
const addBackground = action({
  description: '把一张图片保存为背景（写操作，默认仅机器人主人可用）。slot 留空则自动挑第一个空槽位',
  params: { image: 'data URL 或 http(s) 图片地址', slot: '槽位 1~100，留空自动排号' },
  returns: { data: 'JSON：{ slot, format }' },
  inputSchema: obj(
    {
      image: str('图片内容：data:image/...;base64,... 或 http(s) 地址（大图建议直接给 URL）', { minLength: 1, maxLength: 12_000_000 }),
      slot: int('目标槽位 1~100；留空自动排号', { minimum: 1, maximum: MAX_SLOT })
    },
    ['image']
  ),
  outputSchema: cardOutput,
  effect: 'write',
  authorize: (_input, context) => {
    assertAllowed(context, { write: true });
    return true;
  },
  handler: async (input: $Any, context?: any) => {
    assertAllowed(context, { write: true });
    try {
      const raw = readStr(input?.image, 'image', 12_000_000).trim();
      if (!raw) throw fail('INVALID_INPUT', 'image 不能为空');
      const slot = readInt(input?.slot, 'slot', 1, MAX_SLOT) || (await nextFreeSlot());

      const buf = await decodeImage(raw);
      if (buf.length > MAX_IMAGE_BYTES) {
        throw new Error(`图片过大（${(buf.length / 1024 / 1024).toFixed(1)}MB，上限 ${MAX_IMAGE_BYTES / 1024 / 1024}MB）`);
      }

      const type = await saveBg(slot, buf);
      return ok(`已保存为第 ${slot} 张背景（${type.ext.toUpperCase()}）`, '', safeJson({ slot, format: type.ext }));
    } catch (e: any) {
      if (e?.code) throw e;
      return errOut(e);
    }
  }
});

/** 删背景（主人） */
const deleteBackground = action({
  description: '删除指定槽位的背景（写操作，默认仅机器人主人可用）',
  params: { slot: '槽位 1~100' },
  returns: { data: 'JSON：{ slot }' },
  inputSchema: obj({ slot: int('要删除的槽位 1~100', { minimum: 1, maximum: MAX_SLOT }) }, ['slot']),
  outputSchema: cardOutput,
  effect: 'write',
  authorize: (_input, context) => {
    assertAllowed(context, { write: true });
    return true;
  },
  handler: async (input: $Any, context?: any) => {
    assertAllowed(context, { write: true });
    try {
      const slot = readInt(input?.slot, 'slot', 1, MAX_SLOT);
      if (!slot) throw fail('INVALID_INPUT', 'slot 不能为空');
      if (!(await findBgFile(slot))) throw new Error(`背景槽位 ${slot} 还没有图片`);

      await clearBgFile(slot);
      return ok(`已删除第 ${slot} 张背景`, '', safeJson({ slot }));
    } catch (e: any) {
      if (e?.code) throw e;
      return errOut(e);
    }
  }
});

/* ---------------------------------------------------------------- 提供者 */

/**
 * 注册到 defineChildren().register() 的 expose 字段
 * 老框架（< 2.1.11x 未提供 Expose）返回 null，index.ts 会跳过该字段
 */
export const quoteCardExpose =
  ExposeApi && typeof ExposeApi.create === 'function'
    ? ExposeApi.create().provide({
        name: EXPOSE_PROTOCOL,
        displayName: '名言卡片',
        entryCommand: '名言帮助',
        version: EXPOSE_VERSION,
        description:
          '引用消息生成名言卡片图片。渲染类动作出 JPEG data URL（base64），背景与设置类动作返回 JSON 字符串。'
          + '写操作（改设置、增删背景）默认仅机器人主人可用，可在 alemon.config.yaml 的 quote-card.expose 下调整。',
        actions: {
          get_help: getHelp,
          render_card: renderCard,
          render_help: renderHelp,
          render_gallery: renderGallery,
          list_backgrounds: listBackgrounds,
          get_settings: getSettings,
          set_settings: setSettings,
          add_background: addBackground,
          delete_background: deleteBackground
        }
      })
    : null;

/** 供内部/测试使用：动作名清单 */
export const EXPOSE_ACTIONS = [
  'get_help',
  'render_card',
  'render_help',
  'render_gallery',
  'list_backgrounds',
  'get_settings',
  'set_settings',
  'add_background',
  'delete_background'
] as const;

export default quoteCardExpose;
