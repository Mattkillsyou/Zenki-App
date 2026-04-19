import React, { useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, TextInput, StyleSheet,
  ActivityIndicator, Alert, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import {
  ReportReason,
  ReportTargetType,
  REPORT_REASON_LABELS,
  submitReport,
} from '../services/firebaseModeration';
import { spacing, borderRadius } from '../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: string;
  targetUserId: string;
  /** Shown in the modal header so the user knows what they're reporting. */
  targetPreview?: string;
  /** Called after a successful report so the parent can e.g. hide the item. */
  onReported?: () => void;
}

const REASONS: ReportReason[] = [
  'spam', 'harassment', 'inappropriate', 'hate_speech',
  'violence', 'self_harm', 'impersonation', 'other',
];

export function ReportModal({ visible, onClose, targetType, targetId, targetUserId, targetPreview, onReported }: Props) {
  const { colors } = useTheme();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [context, setContext] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setReason(null);
    setContext('');
    setSubmitting(false);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!reason || submitting) return;
    setSubmitting(true);
    const ok = await submitReport({
      targetType,
      targetId,
      targetUserId,
      reason,
      context,
    });
    setSubmitting(false);
    if (ok) {
      Alert.alert(
        'Report submitted',
        'Thanks — our team will review this shortly. You can also block this user from their profile.',
      );
      onReported?.();
      reset();
      onClose();
    } else {
      Alert.alert('Error', 'Could not submit your report. Please try again.');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <View style={[styles.card, { backgroundColor: colors.backgroundElevated, borderColor: colors.border }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Report content</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {targetPreview ? (
            <Text style={[styles.targetPreview, { color: colors.textMuted }]} numberOfLines={2}>
              "{targetPreview}"
            </Text>
          ) : null}

          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Why are you reporting this?</Text>

          <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
            {REASONS.map((r) => {
              const selected = reason === r;
              return (
                <TouchableOpacity
                  key={r}
                  style={[
                    styles.reasonRow,
                    {
                      backgroundColor: selected ? (colors.goldMuted || 'rgba(212,160,23,0.18)') : colors.surface,
                      borderColor: selected ? (colors.gold || '#D4A017') : colors.border,
                    },
                  ]}
                  onPress={() => setReason(r)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.reasonText, { color: colors.textPrimary }]}>{REPORT_REASON_LABELS[r]}</Text>
                  {selected && <Ionicons name="checkmark-circle" size={18} color={colors.gold || '#D4A017'} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TextInput
            value={context}
            onChangeText={setContext}
            placeholder="Additional detail (optional)"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={500}
            style={[styles.input, {
              backgroundColor: colors.surface,
              color: colors.textPrimary,
              borderColor: colors.border,
            }]}
          />

          <TouchableOpacity
            style={[
              styles.submitBtn,
              { backgroundColor: reason ? (colors.gold || '#D4A017') : (colors.surface),
                opacity: reason ? 1 : 0.5 },
            ]}
            onPress={handleSubmit}
            disabled={!reason || submitting}
            activeOpacity={0.85}
          >
            {submitting
              ? <ActivityIndicator color="#000" />
              : <Text style={[styles.submitText, { color: reason ? '#000' : colors.textMuted }]}>Submit Report</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  card: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xl,
    borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1,
    maxHeight: '90%',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  title: { fontSize: 18, fontWeight: '700', letterSpacing: -0.2 },
  targetPreview: { fontSize: 13, fontStyle: 'italic', marginBottom: spacing.md },
  sectionLabel: { fontSize: 13, fontWeight: '600', marginBottom: spacing.sm },
  reasonRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md, borderWidth: 1, marginBottom: 6,
  },
  reasonText: { fontSize: 14, fontWeight: '600', flex: 1 },
  input: {
    borderRadius: borderRadius.md, borderWidth: 1,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    fontSize: 14, marginTop: spacing.md, minHeight: 60, textAlignVertical: 'top',
  },
  submitBtn: {
    marginTop: spacing.md, paddingVertical: spacing.md, borderRadius: borderRadius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  submitText: { fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
});
