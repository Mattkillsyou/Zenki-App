import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { spacing, borderRadius } from '../theme';

/**
 * One-time health-data disclosure shown before the first Bloodwork or DEXA
 * upload. Apple requires an in-context disclosure for health data per rule 5.1.3.
 *
 * Persist the accepted flag under `@zenki_health_consent_v1` — bump the version
 * suffix on the storage key if the disclosure text materially changes.
 */
interface Props {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
  /** "bloodwork" or "DEXA scan" — used in the title copy. */
  feature: string;
}

export function HealthDataConsentModal({ visible, onAccept, onDecline, feature }: Props) {
  const { colors } = useTheme();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onDecline}>
      <Pressable style={styles.backdrop} onPress={onDecline}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <View style={[styles.iconWrap, { backgroundColor: colors.goldMuted ?? colors.gold + '22' }]}>
            <Ionicons name="shield-checkmark-outline" size={32} color={colors.gold} />
          </View>

          <Text style={[styles.title, { color: colors.textPrimary }]}>Before you upload</Text>

          <Text style={[styles.lede, { color: colors.textSecondary }]}>
            You're about to upload a {feature}. Here's what you should know:
          </Text>

          <ScrollView style={styles.bodyScroll} showsVerticalScrollIndicator={false}>
            <Bullet
              icon="lock-closed-outline"
              title="Stored on your device"
              text="Your health data lives on your phone, in app storage. It is not uploaded to our servers beyond the AI extraction step."
              colors={colors}
            />
            <Bullet
              icon="sparkles-outline"
              title="AI extraction is one-time"
              text="The uploaded image is sent to our server (which calls Anthropic Claude) only to pull the values out of the report. The image is not retained after extraction."
              colors={colors}
            />
            <Bullet
              icon="medkit-outline"
              title="Not medical advice"
              text="Zenki Dojo is a training app. Results displayed here are for your own tracking. Always consult a clinician for medical decisions."
              colors={colors}
            />
            <Bullet
              icon="trash-outline"
              title="You own deletion"
              text="Delete any scan or report at any time from its detail screen. Deleting your account wipes all health data client-side."
              colors={colors}
            />
          </ScrollView>

          <View style={styles.btnRow}>
            <TouchableOpacity
              onPress={onDecline}
              style={[styles.btn, styles.btnSecondary, { borderColor: colors.border }]}
            >
              <Text style={[styles.btnText, { color: colors.textSecondary }]}>Not now</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onAccept}
              style={[styles.btn, { backgroundColor: colors.gold }]}
            >
              <Text style={[styles.btnText, { color: '#000' }]}>I understand, continue</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Bullet({
  icon,
  title,
  text,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  text: string;
  colors: any;
}) {
  return (
    <View style={styles.bullet}>
      <View style={[styles.bulletIcon, { backgroundColor: colors.gold + '22' }]}>
        <Ionicons name={icon} size={16} color={colors.gold} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.bulletTitle, { color: colors.textPrimary }]}>{title}</Text>
        <Text style={[styles.bulletText, { color: colors.textSecondary }]}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
  },
  card: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    padding: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    maxHeight: '88%',
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  title: { fontSize: 22, fontWeight: '900', letterSpacing: -0.4, textAlign: 'center' },
  lede: { fontSize: 14, fontWeight: '500', textAlign: 'center', marginTop: 6, marginBottom: spacing.md, lineHeight: 20 },

  bodyScroll: { marginBottom: spacing.md },
  bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.md },
  bulletIcon: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  bulletTitle: { fontSize: 14, fontWeight: '800' },
  bulletText: { fontSize: 13, fontWeight: '500', lineHeight: 18, marginTop: 2 },

  btnRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondary: { borderWidth: 1, backgroundColor: 'transparent' },
  btnText: { fontSize: 14, fontWeight: '900', letterSpacing: 0.3 },
});

export const HEALTH_CONSENT_KEY = '@zenki_health_consent_v1';
