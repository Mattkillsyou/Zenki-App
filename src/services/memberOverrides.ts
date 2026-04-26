import AsyncStorage from '@react-native-async-storage/async-storage';
import { Member, MEMBERS } from '../data/members';

// Local cache of admin-edited members and self-signups, keyed by member id.
// Acts as offline-first persistence so changes survive app reload even when
// Firestore is unreachable or rules block the write.
const OVERRIDES_KEY = '@zenki_member_overrides';

type Overrides = Record<string, Member>;

async function readOverrides(): Promise<Overrides> {
  try {
    const raw = await AsyncStorage.getItem(OVERRIDES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Overrides) : {};
  } catch {
    return {};
  }
}

async function writeOverrides(map: Overrides): Promise<void> {
  try {
    await AsyncStorage.setItem(OVERRIDES_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/**
 * Persist a member edit to the local overrides cache. Returns the saved
 * record so callers can chain with optimistic UI.
 */
export async function saveMemberOverride(member: Member): Promise<Member> {
  const map = await readOverrides();
  map[member.id] = member;
  await writeOverrides(map);
  return member;
}

/**
 * Look up a single member from the overrides cache by id.
 */
export async function getMemberOverride(id: string): Promise<Member | null> {
  const map = await readOverrides();
  return map[id] ?? null;
}

/**
 * Remove a member override by id. Stores a `deleted` tombstone marker so we
 * can hide the corresponding seed member from the merged list (otherwise the
 * member would just reappear on next reload).
 */
export async function deleteMemberOverride(id: string): Promise<void> {
  const map = await readOverrides();
  // Tombstone — `getMergedMembers` filters this out below.
  map[id] = { id, _deleted: true } as unknown as Member;
  await writeOverrides(map);
}

/**
 * Return the seed `MEMBERS` array merged with locally cached overrides.
 * Override fields win on a per-member basis; new members not in the seed
 * (e.g., admin-added) are appended. Tombstoned overrides (`_deleted: true`)
 * filter the corresponding member out entirely.
 */
export async function getMergedMembers(): Promise<Member[]> {
  const map = await readOverrides();
  const seedById = new Map(MEMBERS.map((m) => [m.id, m]));
  for (const id of Object.keys(map)) {
    const override = map[id] as Member & { _deleted?: boolean };
    if (override._deleted) {
      seedById.delete(id);
      continue;
    }
    seedById.set(id, { ...(seedById.get(id) ?? {} as Member), ...override });
  }
  return Array.from(seedById.values());
}
