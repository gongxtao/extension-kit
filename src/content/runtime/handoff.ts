/**
 * runtime/handoff —— storage.session 交接通道（
 * R46/R47；守卫面已由 /messaging kitMessages 承接，本模块只留
 * store/编解码/TTL）
 *
 * 单通道裁定：
 * - chrome.storage.session 键 ${ns}-image-handoff（键 ns 化——key 注入，
 *   kit.key('image-handoff') 派生口径）：浏览器会话级、默认仅扩展上下文可访
 *   ——background 写 / 面板读，content script 不接触，正合隐私分工。
 * - storage 只收 JSON 可序列化值 → bytes 走 base64；HANDOFF_MAX_BYTES 把门
 *   （capture/types EXTRACT_MAX_BYTES，F18 通道上限随通道走）。
 * - 冷启动（面板未开）与热路径（storage.onChanged）同链路，无双通道竞态。
 *
 * TTL（R47）：5min 内新鲜；面板端过期记录直接丢（防旧内容在用户无预期时突袭载入）。
 *
 * 业务 payload 与框架通道分离（§5/F17/F24）：源 source 站点值域 → `metadata?: unknown`
 * 透传——框架只查存在性，值域校验由产品注入守卫回调（消费侧）。
 */

import type { StorageArea } from '../../io/storage';
import { EXTRACT_MAX_BYTES } from '../capture/types';

/** 交接记录（source → metadata 透传） */
export interface HandoffRecord {
  kind: 'image';
  base64: string;
  mime: 'image/png' | 'image/jpeg';
  metadata?: unknown;
  /** epoch ms——content script 抓取完成时刻 */
  requestedAt: number;
}

/** R47 新鲜度窗口（ms） */
export const HANDOFF_TTL_MS = 5 * 60 * 1000;

/** 通道上限（ms 换算见 capture/types；base64 膨胀下的实际上限——F18 随通道走） */
export const HANDOFF_MAX_BYTES = EXTRACT_MAX_BYTES;

/** chrome.storage.session 的结构子集（DI；/io StorageArea 同形） */
export type HandoffStorageArea = StorageArea;

export interface HandoffStore {
  get(): Promise<HandoffRecord | null>;
  /** 成功 true；storage 异常（超限/IO）→ false 不抛——调用方按 too_large 分支 */
  set(record: HandoffRecord): Promise<boolean>;
  clear(): Promise<void>;
}

const isMime = (v: unknown): v is HandoffRecord['mime'] =>
  v === 'image/png' || v === 'image/jpeg';

function parseHandoff(raw: unknown): HandoffRecord | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const rec = raw as Record<string, unknown>;
  if (rec.kind !== 'image') return null;
  if (typeof rec.base64 !== 'string' || rec.base64.length === 0) return null;
  if (!isMime(rec.mime)) return null;
  if (typeof rec.requestedAt !== 'number' || !Number.isFinite(rec.requestedAt)) return null;
  // metadata 透传零值域约束（F17/F24）——值域校验由产品注入守卫回调
  return {
    kind: 'image',
    base64: rec.base64,
    mime: rec.mime,
    ...(rec.metadata !== undefined ? { metadata: rec.metadata } : {}),
    requestedAt: rec.requestedAt,
  };
}

export function createHandoffStore(storage: HandoffStorageArea, key: string): HandoffStore {
  return {
    async get() {
      try {
        const bag = await storage.get([key]);
        return parseHandoff(bag[key]);
      } catch {
        return null;
      }
    },
    async set(record) {
      try {
        await storage.set({ [key]: record });
        return true;
      } catch {
        return false; // QUOTA / IO —— background 走 too_large 回退分支
      }
    },
    async clear() {
      try {
        await storage.remove([key]);
      } catch {
        /* 静默：清理失败无消费侧影响 */
      }
    },
  };
}

/** R47 新鲜度：requestedAt 距 now 不足 TTL 才算新鲜 */
export function isFresh(record: HandoffRecord, now: number): boolean {
  return now - record.requestedAt < HANDOFF_TTL_MS;
}

// —— base64 编解码（分块防爆栈；jsdom/SW 均有 btoa/atob） ————————————

const B64_CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += B64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + B64_CHUNK));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** blob → base64（jsdom Blob 无 arrayBuffer 且 undici Response 会字符串化它——
 *  FileReader 路兜底；生产 Chrome 走 arrayBuffer 快路） */
export async function blobToBase64(blob: Blob): Promise<string> {
  if (typeof blob.arrayBuffer === 'function') {
    return bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(bytesToBase64(new Uint8Array(reader.result as ArrayBuffer)));
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
    reader.readAsArrayBuffer(blob);
  });
}
