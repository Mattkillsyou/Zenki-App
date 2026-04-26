import {
  collection,
  doc,
  setDoc,
  addDoc,
  getDoc,
  query,
  where,
  orderBy,
  limit,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
  increment,
} from 'firebase/firestore';
import { db, FIREBASE_CONFIGURED } from '../config/firebase';
import { getCurrentUid } from './firebaseAuth';

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  createdAt: string;
}

export interface Conversation {
  id: string;                      // deterministic, sorted-UIDs joined with '_'
  participants: string[];
  lastMessage: string;
  lastSenderId: string;
  lastMessageAt: string;
  unreadFor: Record<string, number>;
  // Enriched client-side for display
  otherUserId?: string;
  otherUserName?: string;
  otherUserAvatar?: string | null;
}

/** Compute deterministic conversation ID from two UIDs (order-independent). */
export function conversationIdFor(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join('_');
}

/**
 * Get or create a conversation between the current user and `otherUid`.
 * Returns the conversation ID.
 */
export async function getOrCreateConversation(otherUid: string): Promise<string | null> {
  if (!FIREBASE_CONFIGURED || !db) return null;
  const me = getCurrentUid();
  if (!me) return null;
  const id = conversationIdFor(me, otherUid);
  const ref = doc(db, 'conversations', id);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      participants: [me, otherUid].sort(),
      lastMessage: '',
      lastSenderId: '',
      lastMessageAt: new Date().toISOString(),
      unreadFor: { [me]: 0, [otherUid]: 0 },
      createdAt: serverTimestamp(),
    });
  }
  return id;
}

/**
 * Send a message to an existing conversation. Returns the created message.
 */
export async function sendMessage(conversationId: string, text: string): Promise<Message | null> {
  if (!FIREBASE_CONFIGURED || !db) return null;
  const me = getCurrentUid();
  if (!me) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Load conversation to determine recipient
  const convSnap = await getDoc(doc(db, 'conversations', conversationId));
  if (!convSnap.exists()) return null;
  const data = convSnap.data() as any;
  const recipient = (data.participants || []).find((p: string) => p !== me);

  const msgData = {
    conversationId,
    senderId: me,
    text: trimmed,
    createdAt: new Date().toISOString(),
  };
  const ref = await addDoc(collection(db, 'conversations', conversationId, 'messages'), {
    ...msgData,
    serverTs: serverTimestamp(),
  });

  // Update conversation summary + recipient's unread count
  const unreadUpdate: any = {
    lastMessage: trimmed,
    lastSenderId: me,
    lastMessageAt: msgData.createdAt,
  };
  if (recipient) unreadUpdate[`unreadFor.${recipient}`] = increment(1);
  await updateDoc(doc(db, 'conversations', conversationId), unreadUpdate);

  return { id: ref.id, ...msgData };
}

/** Mark all unread messages in a conversation as read by current user. */
export async function markConversationRead(conversationId: string): Promise<void> {
  if (!FIREBASE_CONFIGURED || !db) return;
  const me = getCurrentUid();
  if (!me) return;
  try {
    await updateDoc(doc(db, 'conversations', conversationId), {
      [`unreadFor.${me}`]: 0,
    });
  } catch { /* ignore */ }
}

/**
 * Subscribe to the current user's inbox — all conversations they're part of.
 * Returns unsubscribe fn.
 */
export function subscribeToInbox(onUpdate: (convs: Conversation[]) => void): Unsubscribe {
  if (!FIREBASE_CONFIGURED || !db) return () => {};
  const me = getCurrentUid();
  if (!me) return () => {};
  const q = query(
    collection(db, 'conversations'),
    where('participants', 'array-contains', me),
  );
  return onSnapshot(q, (snap) => {
    const convs: Conversation[] = [];
    snap.forEach((d) => {
      const data = d.data() as any;
      const other = (data.participants || []).find((p: string) => p !== me);
      convs.push({
        id: d.id,
        participants: data.participants || [],
        lastMessage: data.lastMessage || '',
        lastSenderId: data.lastSenderId || '',
        lastMessageAt: data.lastMessageAt || '',
        unreadFor: data.unreadFor || {},
        otherUserId: other,
      });
    });
    convs.sort((a, b) => (b.lastMessageAt || '').localeCompare(a.lastMessageAt || ''));
    onUpdate(convs);
  });
}

/** Subscribe to messages in a conversation, ordered oldest-first. */
export function subscribeToThread(conversationId: string, onUpdate: (msgs: Message[]) => void): Unsubscribe {
  if (!FIREBASE_CONFIGURED || !db) return () => {};
  const q = query(
    collection(db, 'conversations', conversationId, 'messages'),
    orderBy('createdAt', 'asc'),
    limit(200),
  );
  return onSnapshot(q, (snap) => {
    const list: Message[] = [];
    snap.forEach((d) => {
      const data = d.data() as any;
      list.push({
        id: d.id,
        conversationId,
        senderId: data.senderId,
        text: data.text,
        createdAt: data.createdAt,
      });
    });
    onUpdate(list);
  });
}

/** One-shot fetch of a user's profile doc for enriching conversation list. */
export async function fetchUserProfile(uid: string): Promise<{ displayName: string; avatar: string | null } | null> {
  if (!FIREBASE_CONFIGURED || !db) return null;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    const data = snap.data() as any;
    return {
      displayName: data.displayName || 'Member',
      avatar: data.avatar || null,
    };
  } catch {
    return null;
  }
}

/** Total unread across all conversations for the current user. */
export function unreadCount(convs: Conversation[]): number {
  const me = getCurrentUid();
  if (!me) return 0;
  return convs.reduce((n, c) => n + (c.unreadFor?.[me] || 0), 0);
}
