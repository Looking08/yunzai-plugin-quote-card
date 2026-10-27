/** OneBot get_msg 返回的引用消息结构（仅取用到的字段） */
export type OneBotQuoted = {
  user_id?: string | number;
  message_id?: string | number;
  raw_message?: string;
  sender?: {
    user_id?: string | number;
    nickname?: string;
    card?: string;
  };
  message?: Array<{ type?: string; data?: Record<string, any> }>;
};

/** 提取引用消息中的纯文本 */
export const extractText = (quoted?: OneBotQuoted | null): string => {
  if (!quoted) return '';
  const segments = Array.isArray(quoted.message) ? quoted.message : [];
  if (!segments.length) return String(quoted.raw_message ?? '');
  return segments
    .filter(item => item?.type === 'text')
    .map(item => String(item.data?.text ?? ''))
    .join('');
};

/** 提取引用消息中的图片地址 */
export const extractImageUrls = (quoted?: OneBotQuoted | null): string[] => {
  if (!quoted) return [];
  const segments = Array.isArray(quoted.message) ? quoted.message : [];
  return segments
    .filter(item => item?.type === 'image')
    .map(item => String(item.data?.url ?? item.data?.file ?? ''))
    .filter(Boolean);
};

/** 引用消息的发送者 QQ */
export const extractUserId = (quoted?: OneBotQuoted | null): string => {
  if (!quoted) return '';
  const id = quoted.user_id ?? quoted.sender?.user_id ?? '';
  return String(id).trim();
};

/** 引用消息的发送者昵称（群名片优先） */
export const extractUserName = (quoted?: OneBotQuoted | null): string => {
  if (!quoted) return '';
  return quoted.sender?.card || quoted.sender?.nickname || '';
};

/** 从命令文本中解析槽位号（末尾数字，缺省 1） */
export const parseSlot = (text: string): number => {
  const m = String(text ?? '').match(/(\d*)$/);
  const n = m && m[1] ? parseInt(m[1], 10) : 1;
  return n && n > 0 ? n : 1;
};

/** 只解析「指令末尾显式写了数字」的情况；没写返回 0（表示自动排号） */
export const parseExplicitSlot = (text: string): number => {
  const m = String(text ?? '').trim().match(/(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
};

/** 统一的「被引用消息」结构，屏蔽各平台差异 */
export type QuotedContent = {
  text: string;
  imageUrls: string[];
  userId: string;
  userName: string;
};

/**
 * 从框架标准化后的 MessageContent 中取被引用消息（QQ 官方机器人等）
 * QQ 侧结构：message_scene.ext 里有 ref_msg_idx，msg_elements 里带被引用消息的正文与作者
 */
const fromNormalizedContent = (content: any): QuotedContent | null => {
  if (!content || typeof content !== 'object') return null;
  const refId = content.replyReferenceId;
  if (!refId) return null;

  const flat: any[] = [];
  const walk = (list: any[]) => {
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      flat.push(item);
      if (Array.isArray(item.content?.elements)) walk(item.content.elements);
    }
  };
  if (Array.isArray(content.elements)) walk(content.elements);
  if (!flat.length) return null;

  const hit =
    flat.find(item => item.referenceId && String(item.referenceId) === String(refId)) ??
    [...flat].reverse().find(item => String(item.text ?? '').trim() || (item.attachments?.length ?? 0) > 0);

  if (!hit) return null;

  return {
    text: String(hit.text ?? ''),
    imageUrls: (Array.isArray(hit.attachments) ? hit.attachments : [])
      .filter((item: any) => item?.Type === 'image' && item?.Url)
      .map((item: any) => String(item.Url)),
    userId: String(hit.userId ?? hit.author?.UserId ?? '').trim(),
    userName: String(hit.userName ?? hit.author?.UserName ?? '').trim()
  };
};

/**
 * 解析当前消息引用的那条消息
 * 1) QQ 官方机器人：平台直接下发被引用消息，读 event.MessageContent
 * 2) OneBot（NapCat / Lagrange）：event.ReplyId + get_msg 拉取
 */
export const resolveQuoted = async (
  event: Record<string, any>,
  getMessage?: (messageId: string) => Promise<any>
): Promise<QuotedContent | null> => {
  const direct = fromNormalizedContent(event?.MessageContent);
  if (direct) return direct;

  const replyId = event?.ReplyId ?? event?.ReplyID;
  if (replyId && getMessage) {
    try {
      const res = await getMessage(String(replyId));
      const quoted = ((res as any)?.data ?? null) as OneBotQuoted | null;
      if (quoted) {
        return {
          text: extractText(quoted),
          imageUrls: extractImageUrls(quoted),
          userId: extractUserId(quoted),
          userName: extractUserName(quoted)
        };
      }
    } catch (err) {
      logger.warn(`[名言卡片] 拉取引用消息失败: ${(err as Error).message}`);
    }
  }

  return null;
};

/** 诊断用：把事件里与引用相关的字段摘出来，便于排查平台差异 */
export const describeQuoteContext = (event: Record<string, any>): string => {
  const content = event?.MessageContent ?? {};
  const brief = {
    ReplyId: event?.ReplyId ?? null,
    replyReferenceId: content.replyReferenceId ?? null,
    referenceId: content.referenceId ?? null,
    ext: content.context ?? null,
    elements: (Array.isArray(content.elements) ? content.elements : []).map((item: any) => ({
      referenceId: item?.referenceId ?? null,
      text: String(item?.text ?? '').slice(0, 30),
      userId: item?.userId ?? null,
      userName: item?.userName ?? null
    }))
  };
  return JSON.stringify(brief).slice(0, 600);
};
