import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, FIREBASE_CONFIGURED } from '../config/firebase';

const QUEUE_KEY = '@zenki_support_queue';

export type SupportCategory = 'bug' | 'feature' | 'general' | 'urgent';

export interface SupportMessageInput {
  memberId: string;
  memberName: string;
  memberEmail?: string;
  category: SupportCategory;
  subject: string;
  message: string;
}

interface QueuedMessage extends SupportMessageInput {
  localId: string;
  platform: string;
  appVersion: string;
  timestamp: string;
}

const APP_VERSION = '1.0.0';

/**
 * Submit a support message. Writes to Firestore when configured, otherwise
 * queues locally and will retry next time flushQueue() is called.
 */
export async function submitSupportMessage(input: SupportMessageInput): Promise<{ ok: boolean; id?: string; queued?: boolean }> {
  const payload = {
    ...input,
    platform: Platform.OS,
    appVersion: APP_VERSION,
    status: 'new' as const,
    timestamp: new Date().toISOString(),
  };

  if (FIREBASE_CONFIGURED && db) {
    try {
      const ref = await addDoc(collection(db, 'supportMessages'), {
        ...payload,
        createdAt: serverTimestamp(),
      });
      return { ok: true, id: ref.id };
    } catch (e) {
      console.warn('[Support] Firestore write failed, queuing:', e);
      // fall through to local queue
    }
  }

  // Queue locally for retry
  await enqueue(payload);
  return { ok: true, queued: true };
}

/**
 * Flush any queued messages to Firestore. Safe to call on app launch or
 * after connectivity regained.
 */
export async function flushSupportQueue(): Promise<number> {
  if (!FIREBASE_CONFIGURED || !db) return 0;
  const queue = await readQueue();
  if (queue.length === 0) return 0;

  const remaining: QueuedMessage[] = [];
  let flushed = 0;
  for (const msg of queue) {
    try {
      await addDoc(collection(db, 'supportMessages'), {
        memberId: msg.memberId,
        memberName: msg.memberName,
        memberEmail: msg.memberEmail ?? null,
        category: msg.category,
        subject: msg.subject,
        message: msg.message,
        platform: msg.platform,
        appVersion: msg.appVersion,
        status: 'new',
        timestamp: msg.timestamp,
        createdAt: serverTimestamp(),
      });
      flushed++;
    } catch (e) {
      console.warn('[Support] Flush retry failed, keeping in queue:', e);
      remaining.push(msg);
    }
  }
  await writeQueue(remaining);
  return flushed;
}

async function enqueue(msg: Omit<QueuedMessage, 'localId'>) {
  const queue = await readQueue();
  queue.push({ ...msg, localId: Date.now().toString(36) + Math.random().toString(36).slice(2, 6) });
  await writeQueue(queue);
}

async function readQueue(): Promise<QueuedMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedMessage[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueuedMessage[]) {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}
