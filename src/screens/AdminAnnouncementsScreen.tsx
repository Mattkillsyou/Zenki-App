import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAnnouncements, Announcement } from '../context/AnnouncementContext';
import { typography, spacing, borderRadius } from '../theme';
import { Button } from '../components';

export function AdminAnnouncementsScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { announcements, addAnnouncement, updateAnnouncement, removeAnnouncement } = useAnnouncements();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDesc, setDraftDesc] = useState('');
  const [draftPinned, setDraftPinned] = useState(false);

  const startNew = () => {
    setEditingId('NEW');
    setDraftTitle('');
    setDraftDesc('');
    setDraftPinned(false);
  };

  const startEdit = (a: Announcement) => {
    setEditingId(a.id);
    setDraftTitle(a.title);
    setDraftDesc(a.description);
    setDraftPinned(a.pinned);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraftTitle('');
    setDraftDesc('');
    setDraftPinned(false);
  };

  const save = () => {
    if (!draftTitle.trim()) {
      Alert.alert('Missing title', 'Please enter a title.');
      return;
    }
    if (editingId === 'NEW') {
      addAnnouncement({ title: draftTitle.trim(), description: draftDesc.trim(), pinned: draftPinned });
    } else if (editingId) {
      updateAnnouncement(editingId, {
        title: draftTitle.trim(),
        description: draftDesc.trim(),
        pinned: draftPinned,
      });
    }
    cancelEdit();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.iconBtn, { backgroundColor: colors.surface }]}>
          <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Announcements</Text>
        <TouchableOpacity onPress={startNew} style={[styles.iconBtn, { backgroundColor: colors.gold }]}>
          <Ionicons name="add" size={22} color="#000" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Editor */}
        {editingId && (
          <View style={[styles.editorCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.editorLabel, { color: colors.textTertiary }]}>
              {editingId === 'NEW' ? 'NEW ANNOUNCEMENT' : 'EDIT ANNOUNCEMENT'}
            </Text>
            <TextInput
              style={[styles.titleInput, { backgroundColor: colors.backgroundElevated, color: colors.textPrimary }]}
              value={draftTitle}
              onChangeText={setDraftTitle}
              placeholder="Title (e.g. Mat Cleaning Saturday 8AM)"
              placeholderTextColor={colors.textMuted}
              maxLength={80}
            />
            <TextInput
              style={[styles.descInput, { backgroundColor: colors.backgroundElevated, color: colors.textPrimary }]}
              value={draftDesc}
              onChangeText={setDraftDesc}
              placeholder="Short description (optional)"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={140}
            />
            <TouchableOpacity
              style={styles.pinRow}
              onPress={() => setDraftPinned(!draftPinned)}
              activeOpacity={0.7}
            >
              <Ionicons name={draftPinned ? 'pin' : 'pin-outline'} size={18} color={draftPinned ? colors.gold : colors.textMuted} />
              <Text style={[styles.pinLabel, { color: colors.textSecondary }]}>Pin to top</Text>
            </TouchableOpacity>
            <View style={styles.editorActions}>
              <Button title="Cancel" onPress={cancelEdit} variant="secondary" />
              <Button title={editingId === 'NEW' ? 'Post' : 'Save'} onPress={save} />
            </View>
          </View>
        )}

        {/* List */}
        {announcements.length === 0 && !editingId && (
          <View style={styles.empty}>
            <Ionicons name="newspaper-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No announcements yet</Text>
            <Text style={[styles.emptySub, { color: colors.textTertiary }]}>Tap the + to add the first one</Text>
          </View>
        )}

        {announcements.map((a) => (
          <View key={a.id} style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.cardTop}>
              <View style={styles.cardTitleRow}>
                {a.pinned && <Ionicons name="pin" size={14} color={colors.gold} />}
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={2}>{a.title}</Text>
              </View>
              <View style={styles.cardActions}>
                <TouchableOpacity onPress={() => startEdit(a)} style={styles.actionBtn}>
                  <Ionicons name="create-outline" size={18} color={colors.gold} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    Alert.alert('Delete announcement', 'Are you sure?', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => removeAnnouncement(a.id) },
                    ]);
                  }}
                  style={styles.actionBtn}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                </TouchableOpacity>
              </View>
            </View>
            {a.description ? (
              <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>{a.description}</Text>
            ) : null}
            <Text style={[styles.cardTime, { color: colors.textMuted }]}>
              Posted {new Date(a.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
  scroll: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },
  editorCard: { borderRadius: 16, padding: 16, gap: 10 },
  editorLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  titleInput: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontWeight: '500' },
  descInput: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, minHeight: 60, textAlignVertical: 'top' },
  pinRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  pinLabel: { fontSize: 14, fontWeight: '500' },
  editorActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '600' },
  emptySub: { fontSize: 13 },
  card: { borderRadius: 14, padding: 14 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '600', flex: 1 },
  cardActions: { flexDirection: 'row', gap: 6 },
  actionBtn: { padding: 6, borderRadius: 8 },
  cardDesc: { fontSize: 13, fontWeight: '400', marginTop: 6, lineHeight: 18 },
  cardTime: { fontSize: 11, fontWeight: '500', marginTop: 8 },
});
