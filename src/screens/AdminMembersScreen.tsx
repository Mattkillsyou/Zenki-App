import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform} from 'react-native';
import { SoundPressable } from '../components/SoundPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { typography, spacing, borderRadius } from '../theme';
import { Button } from '../components';
import {
  MEMBERS,
  Member,
  BeltLevel,
  BELT_ORDER,
  BELT_DISPLAY_COLORS,
  BELT_LABELS,
} from '../data/members';

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
  totalSessions: 0,
  weekStreak: 0,
};

export function AdminMembersScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [members, setMembers] = useState<Member[]>(MEMBERS);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [form, setForm] = useState(EMPTY_MEMBER);

  const openAddModal = () => {
    setEditingMember(null);
    setForm(EMPTY_MEMBER);
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
      totalSessions: member.totalSessions,
      weekStreak: member.weekStreak,
    });
    setModalVisible(true);
  };

  const handleSave = () => {
    if (!form.firstName || !form.lastName || !form.username) {
      Alert.alert('Missing Info', 'Please fill in first name, last name, and username.');
      return;
    }
    if (editingMember) {
      setMembers((prev) =>
        prev.map((m) => (m.id === editingMember.id ? { ...m, ...form } : m)),
      );
    } else {
      const newMember: Member = {
        ...form,
        id: Date.now().toString(),
      };
      setMembers((prev) => [...prev, newMember]);
    }
    setModalVisible(false);
    setEditingMember(null);
  };

  const handleDelete = (member: Member) => {
    setMembers((prev) => prev.filter((m) => m.id !== member.id));
  };

  const addStripe = (id: string) => {
    setMembers((prev) =>
      prev.map((m) => {
        if (m.id !== id || m.stripes >= 4) return m;
        return { ...m, stripes: m.stripes + 1 };
      }),
    );
  };

  const promoteBelt = (id: string) => {
    const member = members.find((m) => m.id === id);
    if (!member) return;
    const idx = BELT_ORDER.indexOf(member.belt);
    if (idx >= BELT_ORDER.length - 1) return;
    const next = BELT_ORDER[idx + 1];
    setMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, belt: next, stripes: 0 } : m)),
    );
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
      {/* Header */}
      <View style={styles.header}>
        <SoundPressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </SoundPressable>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Members</Text>
        <SoundPressable onPress={openAddModal} style={styles.backButton}>
          <Ionicons name="add-circle-outline" size={26} color={colors.gold} />
        </SoundPressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={64}
      >
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
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
        </ScrollView>
      </KeyboardAvoidingView>

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
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalContent}>
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

            <Button title={editingMember ? 'Save Changes' : 'Add Member'} onPress={handleSave} fullWidth size="lg" style={{ marginTop: spacing.lg }} />
            <View style={{ height: spacing.xxl * 2 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
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
});
