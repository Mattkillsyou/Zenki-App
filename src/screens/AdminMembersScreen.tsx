import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Modal} from 'react-native';
import { SoundPressable } from '../components/SoundPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { typography, spacing, borderRadius } from '../theme';
import { Button, KeyboardAwareScrollView, ScreenContainer } from '../components';
import {
  MEMBERS,
  Member,
  BeltLevel,
  BELT_ORDER,
  BELT_DISPLAY_COLORS,
  BELT_LABELS,
} from '../data/members';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  upsertMemberInFirestore,
  deleteMemberFromFirestore,
  subscribeToAllMembers,
  backfillMembersToFirestore,
  BackfillResult,
} from '../services/memberSync';
import { getMergedMembers, saveMemberOverride, deleteMemberOverride } from '../services/memberOverrides';
import {
  adminCreateMemberAccount,
  firebaseSendPasswordReset,
  emailForMember,
} from '../services/firebaseAuth';
import { showAlert, confirmAlert } from '../utils/alert';

const BACKFILL_FLAG_KEY = '@zenki_members_backfilled_v1';

const EMPTY_MEMBER: Omit<Member, 'id'> = {
  username: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  belt: 'white',
  stripes: 0,
  memberSince: new Date().toISOString().split('T')[0],
  isAdmin: false,
  isEmployee: false,
  totalSessions: 0,
  weekStreak: 0,
};

export function AdminMembersScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [members, setMembers] = useState<Member[]>(MEMBERS);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [form, setForm] = useState(EMPTY_MEMBER);

  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<BackfillResult | null>(null);
  // Initial password the admin sets when adding a new member. Stays in
  // component memory only (NEVER persisted) — Firebase Auth hashes the real
  // password and we can't read it back later. We surface it to the admin in
  // the success alert so they can communicate it to the new member.
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [resettingId, setResettingId] = useState<string | null>(null);

  // Hydrate from local overrides on mount, then subscribe to Firestore so
  // edits made by other admins (or this admin on another device) flow in
  // live. Both sources are merged on top of the seed `MEMBERS` array.
  useEffect(() => {
    let cancelled = false;
    getMergedMembers().then((merged) => {
      if (cancelled) return;
      setMembers(merged);
      // Auto-backfill on first admin visit so the canonical Firestore docs
      // exist for every seed + override member. Idempotent (setDoc merge),
      // so re-running is safe — but the flag prevents repeat hits on every
      // navigation.
      AsyncStorage.getItem(BACKFILL_FLAG_KEY).then((flag) => {
        if (flag || cancelled) return;
        backfillMembersToFirestore(merged).then((res) => {
          console.log('[Members] Auto-backfill:', res);
          if (res.ok > 0) {
            AsyncStorage.setItem(BACKFILL_FLAG_KEY, new Date().toISOString()).catch(() => {});
          }
        });
      });
    });

    const unsub = subscribeToAllMembers((remote) => {
      if (cancelled || remote.length === 0) return;
      // Merge Firestore docs over the current in-memory list so we don't
      // lose seed-only members that haven't been pushed yet.
      setMembers((prev) => {
        const byId = new Map(prev.map((m) => [m.id, m]));
        for (const r of remote) byId.set(r.id, { ...(byId.get(r.id) ?? {} as Member), ...r });
        return Array.from(byId.values());
      });
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const handleManualSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const merged = await getMergedMembers();
      // Include any members in the live list that aren't in the merged set
      // (e.g., admin-added in this session and not yet flushed to overrides).
      const byId = new Map(merged.map((m) => [m.id, m]));
      for (const m of members) if (!byId.has(m.id)) byId.set(m.id, m);
      const all = Array.from(byId.values());

      const res = await backfillMembersToFirestore(all);
      setLastSync(res);
      if (res.ok > 0) {
        await AsyncStorage.setItem(BACKFILL_FLAG_KEY, new Date().toISOString());
      }
      showAlert(
        'Sync complete',
        `Synced ${res.ok} member${res.ok === 1 ? '' : 's'} to Firestore.` +
          (res.failed > 0 ? `\n${res.failed} failed (check console).` : '') +
          (res.skipped > 0 ? `\n${res.skipped} skipped (Firebase not configured).` : ''),
      );
    } catch (err: any) {
      showAlert('Sync failed', err?.message || 'Unknown error — check console.');
    } finally {
      setSyncing(false);
    }
  };

  const openAddModal = () => {
    setEditingMember(null);
    setForm(EMPTY_MEMBER);
    setNewPassword('');
    setModalVisible(true);
  };

  const openEditModal = (member: Member) => {
    setEditingMember(member);
    setForm({
      username: member.username,
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email,
      phone: member.phone || '',
      belt: member.belt,
      stripes: member.stripes,
      memberSince: member.memberSince,
      isAdmin: member.isAdmin,
      isEmployee: member.isEmployee ?? false,
      firebaseUid: member.firebaseUid,
      totalSessions: member.totalSessions,
      weekStreak: member.weekStreak,
    });
    setNewPassword('');
    setModalVisible(true);
  };

  // Persist the given member to AsyncStorage (always succeeds) and to
  // Firestore (best-effort — silently no-ops if rules block the write).
  const persistMember = (member: Member) => {
    saveMemberOverride(member).catch(() => {});
    upsertMemberInFirestore(member).catch(() => {});
  };

  const handleSave = async () => {
    if (saving) return;
    if (!form.firstName || !form.lastName || !form.username) {
      showAlert('Missing Info', 'First name, last name, and username are required.');
      return;
    }
    const isNew = !editingMember;
    const wantsAuthAccount = isNew && newPassword.length > 0;
    if (wantsAuthAccount && !form.email) {
      showAlert('Email required', 'Set an email before assigning a password — Firebase Auth uses it as the login.');
      return;
    }
    if (wantsAuthAccount && newPassword.length < 6) {
      showAlert('Password too short', 'Firebase requires at least 6 characters.');
      return;
    }

    setSaving(true);
    try {
      // Trim text fields so we never persist trailing whitespace — that broke
      // sign-in lookups for usernames like "mbrown " (with trailing space)
      // because the input was matched against "mbrown" (no space).
      const trimmedForm = {
        ...form,
        firstName: (form.firstName ?? '').trim(),
        lastName: (form.lastName ?? '').trim(),
        username: (form.username ?? '').trim(),
        email: (form.email ?? '').trim(),
      };
      const base: Member = editingMember
        ? { ...editingMember, ...trimmedForm }
        : { ...trimmedForm, id: Date.now().toString() };

      // If admin set an initial password for a new member, provision the
      // Firebase Auth account in a sibling app so the admin stays signed in,
      // then attach the new uid to the member record.
      let updated = base;
      if (wantsAuthAccount) {
        try {
          const uid = await adminCreateMemberAccount(emailForMember(base), newPassword, base);
          updated = { ...base, firebaseUid: uid };
        } catch (err: any) {
          const code = err?.code || '';
          const friendly =
            code === 'auth/email-already-in-use'
              ? 'That email is already a Firebase Auth user. The member record was saved, but the existing account password was not changed — use "Send password reset" instead.'
              : err?.message || 'Could not create the Firebase Auth account.';
          showAlert('Auth account not created', friendly);
          // We still save the member doc — the admin can retry the auth bit later.
        }
      }

      setMembers((prev) =>
        editingMember
          ? prev.map((m) => (m.id === editingMember.id ? updated : m))
          : [...prev, updated],
      );
      persistMember(updated);

      setModalVisible(false);
      setEditingMember(null);

      // One-time success message. We surface the password back to the admin
      // here because Firebase hashes it server-side and we can NEVER read it
      // again — this is the only chance to communicate it to the member.
      if (wantsAuthAccount && updated.firebaseUid) {
        showAlert(
          'Member added',
          `${updated.firstName} can sign in with:\n\nEmail: ${emailForMember(updated)}\nPassword: ${newPassword}\n\nWrite this down — Firebase hashes the password and it can't be retrieved later. Send a password reset if they forget it.`,
        );
      } else {
        showAlert(isNew ? 'Member added' : 'Saved', `${updated.firstName} ${updated.lastName} ${isNew ? 'created.' : 'updated.'}`);
      }
      setNewPassword('');
    } finally {
      setSaving(false);
    }
  };

  const sendPasswordReset = async (member: Member) => {
    if (resettingId) return;
    if (!member.email) {
      showAlert('No email on file', 'Add an email to this member before sending a reset link.');
      return;
    }
    const ok = await confirmAlert(
      'Send password reset',
      `Email a reset link to ${member.email}?`,
      'Send',
    );
    if (!ok) return;
    setResettingId(member.id);
    try {
      await firebaseSendPasswordReset(member.email);
      showAlert('Reset sent', `${member.email} will receive a Firebase password reset email.`);
    } catch (err: any) {
      showAlert('Reset failed', err?.message || String(err));
    } finally {
      setResettingId(null);
    }
  };

  const handleDelete = async (member: Member) => {
    const ok = await confirmAlert(
      'Remove member',
      `Remove ${member.firstName} ${member.lastName}? This hides them from the app and deletes their Firestore record. Their Firebase Auth login (if any) is preserved.`,
      'Remove',
    );
    if (!ok) return;

    // Optimistic local update
    setMembers((prev) => prev.filter((m) => m.id !== member.id));
    try {
      await deleteMemberOverride(member.id);
      const fsOk = await deleteMemberFromFirestore(member.id);
      if (!fsOk) {
        // Firestore couldn't delete (offline / permission / not configured) —
        // local override tombstone still hides this member. Surface the gap.
        showAlert(
          'Removed locally',
          'Could not reach Firestore to delete the cloud record. The member is hidden on this device — try "Sync to Cloud" once you have admin permission.',
        );
      }
    } catch (err: any) {
      // Roll back UI if AsyncStorage tombstone failed
      setMembers((prev) => (prev.find((m) => m.id === member.id) ? prev : [...prev, member]));
      showAlert('Remove failed', err?.message || 'Unknown error — check console.');
    }
  };

  const addStripe = (id: string) => {
    const target = members.find((m) => m.id === id);
    if (!target || target.stripes >= 4) return;
    const updated: Member = { ...target, stripes: target.stripes + 1 };
    setMembers((prev) => prev.map((m) => (m.id === id ? updated : m)));
    persistMember(updated);
  };

  const promoteBelt = (id: string) => {
    const member = members.find((m) => m.id === id);
    if (!member) return;
    const idx = BELT_ORDER.indexOf(member.belt);
    if (idx >= BELT_ORDER.length - 1) return;
    const next = BELT_ORDER[idx + 1];
    const updated: Member = { ...member, belt: next, stripes: 0 };
    setMembers((prev) => prev.map((m) => (m.id === id ? updated : m)));
    persistMember(updated);
  };

  const renderFormField = (label: string, value: string, key: string, opts?: { keyboard?: any; autoCapitalize?: any }) => (
    <View style={styles.fieldGroup} key={key}>
      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.textPrimary, borderColor: colors.border }]}
        value={value}
        onChangeText={(v) => setForm((prev) => ({ ...prev, [key]: v }))}
        placeholderTextColor={colors.textMuted}
        keyboardType={opts?.keyboard}
        autoCapitalize={opts?.autoCapitalize || 'none'}
      />
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenContainer>
      {/* Header */}
      <View style={styles.header}>
        <SoundPressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </SoundPressable>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Members</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <SoundPressable
            onPress={handleManualSync}
            style={styles.backButton}
            accessibilityLabel="Sync members to cloud"
            disabled={syncing}
          >
            <Ionicons
              name={syncing ? 'sync' : 'cloud-upload-outline'}
              size={22}
              color={syncing ? colors.textMuted : colors.gold}
            />
          </SoundPressable>
          <SoundPressable onPress={openAddModal} style={styles.backButton}>
            <Ionicons name="add-circle-outline" size={26} color={colors.gold} />
          </SoundPressable>
        </View>
      </View>

      {lastSync && (
        <View style={[styles.syncBanner, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
          <Ionicons name="checkmark-circle" size={16} color={colors.success} />
          <Text style={[styles.syncBannerText, { color: colors.textSecondary }]}>
            Last sync: {lastSync.ok} ok
            {lastSync.failed ? ` · ${lastSync.failed} failed` : ''}
            {lastSync.skipped ? ' · firebase off' : ''}
          </Text>
        </View>
      )}

      <KeyboardAwareScrollView offset={64} contentContainerStyle={styles.list}>
        {members.map((member) => (
          <View key={member.id} style={[styles.memberCard, { backgroundColor: colors.surface }]}>
            <SoundPressable style={styles.memberMain} onPress={() => openEditModal(member)}>
              <View style={[styles.avatar, { backgroundColor: BELT_DISPLAY_COLORS[member.belt] }]}>
                <Text style={[styles.avatarText, { color: member.belt === 'white' ? '#333' : '#FFF' }]}>
                  {member.firstName[0]}{member.lastName[0]}
                </Text>
              </View>
              <View style={styles.memberInfo}>
                <Text style={[styles.memberName, { color: colors.textPrimary }]}>
                  {member.firstName} {member.lastName}
                </Text>
                <Text style={[styles.memberMeta, { color: colors.textMuted }]}>
                  @{member.username} · {member.email}
                </Text>
                <View style={styles.beltRow}>
                  <View style={[styles.beltDot, { backgroundColor: BELT_DISPLAY_COLORS[member.belt] }]} />
                  <Text style={[styles.beltText, { color: colors.textSecondary }]}>
                    {BELT_LABELS[member.belt]} · {member.stripes} stripes
                  </Text>
                  {member.isAdmin && (
                    <View style={[styles.adminBadge, { backgroundColor: colors.redMuted }]}>
                      <Text style={[styles.adminBadgeText, { color: colors.red }]}>ADMIN</Text>
                    </View>
                  )}
                </View>
              </View>
              <Ionicons name="create-outline" size={18} color={colors.textMuted} />
            </SoundPressable>

            <View style={[styles.actionRow, { borderTopColor: colors.divider }]}>
              <SoundPressable style={styles.actionBtn} onPress={() => addStripe(member.id)}>
                <Ionicons name="add-circle-outline" size={16} color={colors.gold} />
                <Text style={[styles.actionLabel, { color: colors.gold }]}>+ Stripe</Text>
              </SoundPressable>
              <SoundPressable style={styles.actionBtn} onPress={() => promoteBelt(member.id)}>
                <Ionicons name="arrow-up-circle-outline" size={16} color={colors.success} />
                <Text style={[styles.actionLabel, { color: colors.success }]}>Promote</Text>
              </SoundPressable>
              <SoundPressable style={styles.actionBtn} onPress={() => handleDelete(member)}>
                <Ionicons name="trash-outline" size={16} color={colors.error} />
                <Text style={[styles.actionLabel, { color: colors.error }]}>Remove</Text>
              </SoundPressable>
            </View>
          </View>
        ))}
        <View style={{ height: spacing.xxl * 2 }} />
      </KeyboardAwareScrollView>
      </ScreenContainer>

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={styles.modalHeader}>
            <SoundPressable onPress={() => setModalVisible(false)}>
              <Text style={[styles.modalCancel, { color: colors.textMuted }]}>Cancel</Text>
            </SoundPressable>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              {editingMember ? 'Edit Member' : 'Add Member'}
            </Text>
            <View style={{ width: 60 }} />
          </View>
          <KeyboardAwareScrollView contentContainerStyle={styles.modalContent}>
            {renderFormField('FIRST NAME', form.firstName, 'firstName', { autoCapitalize: 'words' })}
            {renderFormField('LAST NAME', form.lastName, 'lastName', { autoCapitalize: 'words' })}
            {renderFormField('USERNAME', form.username, 'username')}
            {renderFormField('EMAIL', form.email, 'email', { keyboard: 'email-address' })}
            {renderFormField('PHONE', form.phone || '', 'phone', { keyboard: 'phone-pad' })}

            {/* Belt Selector */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>BELT LEVEL</Text>
              <View style={styles.beltSelector}>
                {BELT_ORDER.map((belt) => {
                  const isActive = form.belt === belt;
                  return (
                    <SoundPressable
                      key={belt}
                      style={[
                        styles.beltChip,
                        { backgroundColor: isActive ? BELT_DISPLAY_COLORS[belt] : colors.surfaceSecondary },
                        isActive && { borderColor: colors.gold, borderWidth: 2 },
                      ]}
                      onPress={() => setForm((prev) => ({ ...prev, belt: belt as BeltLevel }))}
                    >
                      <Text style={[styles.beltChipText, { color: isActive ? (belt === 'white' ? '#333' : '#FFF') : colors.textMuted }]}>
                        {BELT_LABELS[belt]}
                      </Text>
                    </SoundPressable>
                  );
                })}
              </View>
            </View>

            {/* Stripes */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>STRIPES</Text>
              <View style={styles.stripesSelector}>
                {[0, 1, 2, 3, 4].map((s) => {
                  const isActive = form.stripes === s;
                  return (
                    <SoundPressable
                      key={s}
                      style={[
                        styles.stripeChip,
                        { backgroundColor: isActive ? colors.gold : colors.surfaceSecondary },
                      ]}
                      onPress={() => setForm((prev) => ({ ...prev, stripes: s }))}
                    >
                      <Text style={[styles.stripeChipText, { color: isActive ? colors.textInverse : colors.textMuted }]}>
                        {s}
                      </Text>
                    </SoundPressable>
                  );
                })}
              </View>
            </View>

            {/* Admin Toggle */}
            <SoundPressable
              style={[styles.toggleRow, { backgroundColor: colors.surfaceSecondary, borderColor: form.isAdmin ? colors.gold : 'transparent' }]}
              onPress={() => setForm((prev) => ({ ...prev, isAdmin: !prev.isAdmin }))}
            >
              <Ionicons name="shield-outline" size={20} color={form.isAdmin ? colors.gold : colors.textMuted} />
              <Text style={[styles.toggleLabel, { color: colors.textPrimary }]}>Admin Access</Text>
              <Ionicons
                name={form.isAdmin ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
                color={form.isAdmin ? colors.gold : colors.textMuted}
              />
            </SoundPressable>

            {/* Employee Toggle — replaces store/hydration with checklist + clock-in */}
            <SoundPressable
              style={[styles.toggleRow, { backgroundColor: colors.surfaceSecondary, borderColor: form.isEmployee ? colors.gold : 'transparent' }]}
              onPress={() => setForm((prev) => ({ ...prev, isEmployee: !prev.isEmployee }))}
            >
              <Ionicons name="briefcase-outline" size={20} color={form.isEmployee ? colors.gold : colors.textMuted} />
              <Text style={[styles.toggleLabel, { color: colors.textPrimary }]}>Employee</Text>
              <Ionicons
                name={form.isEmployee ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
                color={form.isEmployee ? colors.gold : colors.textMuted}
              />
            </SoundPressable>

            {/* Password — set initial password for a new member, or send a reset link to an existing one */}
            {!editingMember ? (
              <View style={[styles.fieldGroup, { marginTop: spacing.md }]}>
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>INITIAL PASSWORD (OPTIONAL)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.textPrimary, borderColor: colors.border }]}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="At least 6 characters"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry={false}
                />
                <Text style={[styles.passwordHint, { color: colors.textMuted }]}>
                  Firebase hashes the password; it can never be retrieved later. Save it once it's shown after creation.
                </Text>
              </View>
            ) : (
              <SoundPressable
                style={[styles.resetRow, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                onPress={() => sendPasswordReset(editingMember)}
                disabled={resettingId === editingMember.id}
              >
                <Ionicons
                  name={resettingId === editingMember.id ? 'time-outline' : 'mail-outline'}
                  size={18}
                  color={colors.gold}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.toggleLabel, { color: colors.textPrimary }]}>
                    {resettingId === editingMember.id ? 'Sending…' : 'Send Password Reset Email'}
                  </Text>
                  <Text style={[styles.passwordHint, { color: colors.textMuted, marginTop: 0 }]}>
                    Firebase emails {editingMember.email || 'this member'} a reset link.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </SoundPressable>
            )}

            <Button
              title={saving ? 'Saving…' : editingMember ? 'Save Changes' : 'Add Member'}
              onPress={handleSave}
              fullWidth
              size="lg"
              disabled={saving}
              style={{ marginTop: spacing.lg }}
            />
            <View style={{ height: spacing.xxl * 2 }} />
          </KeyboardAwareScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingTop: 0, paddingBottom: spacing.md,
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.sectionTitle, fontSize: 20 },
  list: { paddingHorizontal: spacing.lg },
  memberCard: { borderRadius: borderRadius.md, marginBottom: spacing.md, overflow: 'hidden' },
  memberMain: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.md },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '800', fontSize: 14 },
  memberInfo: { flex: 1 },
  memberName: { ...typography.body, fontWeight: '600' },
  memberMeta: { ...typography.bodySmall, marginTop: 2 },
  beltRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs, gap: spacing.sm },
  beltDot: { width: 12, height: 12, borderRadius: 6 },
  beltText: { ...typography.bodySmall, fontSize: 12 },
  adminBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.full },
  adminBadgeText: { ...typography.label, fontSize: 8 },
  actionRow: { flexDirection: 'row', borderTopWidth: 1, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, justifyContent: 'space-around' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  actionLabel: { ...typography.label, fontSize: 10 },
  // Modal
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  modalCancel: { ...typography.body, fontWeight: '500' },
  modalTitle: { ...typography.cardTitle, fontSize: 18 },
  modalContent: { paddingHorizontal: spacing.lg },
  fieldGroup: { marginBottom: spacing.md },
  fieldLabel: { ...typography.label, fontSize: 11, marginBottom: spacing.xs },
  input: { borderRadius: borderRadius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 4, fontSize: 16, borderWidth: 1 },
  beltSelector: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  beltChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.sm },
  beltChipText: { ...typography.label, fontSize: 11 },
  stripesSelector: { flexDirection: 'row', gap: spacing.sm },
  stripeChip: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  stripeChipText: { fontSize: 16, fontWeight: '700' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderRadius: borderRadius.md, gap: spacing.md, borderWidth: 1.5, marginTop: spacing.sm },
  toggleLabel: { ...typography.body, fontWeight: '500', flex: 1 },
  resetRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.md, borderRadius: borderRadius.md, borderWidth: 1.5,
    marginTop: spacing.sm,
  },
  passwordHint: { ...typography.bodySmall, fontSize: 11, marginTop: spacing.xs },
  syncBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginHorizontal: spacing.lg, marginBottom: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm, borderWidth: 1,
  },
  syncBannerText: { ...typography.bodySmall, fontSize: 12 },
});
