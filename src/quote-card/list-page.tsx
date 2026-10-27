import React from 'react';

export type ListItem = {
  slot: number;
  /** 图片 data URL */
  src: string;
  /** 展示用体积文案，如 120KB */
  size: string;
};

export type ListPageProps = {
  items: ListItem[];
  total: number;
  shown: number;
  /** #名言照片列表 是否所有人可见（仅影响页脚文案） */
  listPublic?: boolean;
  /** 是否主人（决定是否显示删除提示） */
  canEdit?: boolean;
};

const PAGE_WIDTH = 1280;
const YELLOW = '#FCC419';

/**
 * 名言背景列表页
 * 由 Yunzai 插件资源 resources/list.html 迁移而来，字段与排版保持一致。
 * 整页 output 为一张图，直接当图片消息发送。
 */
export default function ListPage({ items, total, shown, listPublic = true, canEdit = false }: ListPageProps) {
  return (
    <html>
      <head>
        <meta charSet='utf-8' />
      </head>
      <body
        style={{
          margin: 0,
          padding: '40px 40px 32px',
          width: PAGE_WIDTH,
          boxSizing: 'border-box',
          background: '#14161a',
          color: '#e8eaed',
          fontFamily: '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            marginBottom: 26,
            paddingBottom: 18,
            borderBottom: '1px solid rgba(255,255,255,.1)'
          }}
        >
          <div>
            <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: 2 }}>
              名言背景<span style={{ color: YELLOW }}>列表</span>
            </div>
            <div style={{ fontSize: 20, color: '#9aa0a6', marginTop: 8 }}>生成卡片时从这些背景里随机挑一张</div>
          </div>
          <div style={{ fontSize: 22, color: '#9aa0a6', textAlign: 'right', lineHeight: 1.6 }}>
            共 <b style={{ color: YELLOW, fontSize: 30 }}>{total}</b> 张
            {shown < total ? (
              <>
                {' '}
                · 本页展示 <b style={{ color: YELLOW, fontSize: 30 }}>{shown}</b> 张
              </>
            ) : null}
          </div>
        </div>

        {items.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 22 }}>
            {items.map(item => (
              <div
                key={item.slot}
                style={{
                  position: 'relative',
                  boxSizing: 'border-box',
                  background: '#1e2228',
                  border: '1px solid rgba(255,255,255,.07)',
                  borderRadius: 16,
                  padding: '10px 10px 12px'
                }}
              >
                <div
                  style={{
                    position: 'relative',
                    width: '100%',
                    height: 190,
                    borderRadius: 10,
                    overflow: 'hidden',
                    background: '#0f1115'
                  }}
                >
                  {/* 序号浮在图片上层，z-index 必须高于 img */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 8,
                      left: 8,
                      zIndex: 3,
                      minWidth: 54,
                      height: 36,
                      padding: '0 10px',
                      borderRadius: 18,
                      background: 'rgba(252,196,25,.95)',
                      color: '#1a1a1a',
                      fontSize: 20,
                      fontWeight: 700,
                      lineHeight: '36px',
                      textAlign: 'center',
                      boxShadow: '0 3px 10px rgba(0,0,0,.45)'
                    }}
                  >
                    {item.slot}
                  </div>
                  <img
                    src={item.src}
                    alt=''
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: 10,
                    fontSize: 17,
                    color: '#9aa0a6',
                    padding: '0 4px'
                  }}
                >
                  <span>{item.size}</span>
                  {canEdit ? (
                    <span style={{ color: '#FF8787', fontWeight: 600 }}>#删除名言照片{item.slot}</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: '90px 0', textAlign: 'center', color: '#9aa0a6', fontSize: 26 }}>
            还没有设置过背景图
          </div>
        )}

        <div
          style={{
            marginTop: 26,
            paddingTop: 18,
            borderTop: '1px solid rgba(255,255,255,.1)',
            fontSize: 20,
            color: '#9aa0a6',
            display: 'flex',
            justifyContent: 'space-between'
          }}
        >
          <span>
            添加：<b style={{ color: '#e8eaed', fontWeight: 600 }}>#添加名言照片</b> + 图片（可多张）　删除：
            <b style={{ color: '#e8eaed', fontWeight: 600 }}>#删除名言照片N</b>
          </span>
          <span>槽位 1~100 · {listPublic ? '所有人可见' : '仅主人可见'}</span>
        </div>
      </body>
    </html>
  );
}
