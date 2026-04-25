import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Linking, Alert, Platform} from 'react-native';
import { SoundPressable } from '../components/SoundPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { spacing, borderRadius } from '../theme';
import { resetCoachmarks } from '../components/CoachmarkTutorial';

const APP_VERSION = '1.0.0';
const PRIVACY_URL = 'https://zenki-dojo.web.app/privacy';
const SUPPORT_URL = 'https://zenki-dojo.web.app/support';
const CONTACT_EMAIL = 'mattbrowntheemail@gmail.com';

interface Faq {
  q: string;
  a: string;
}

const FAQS: Faq[] = [
  {
    q: "How do I customize my home screen?",
    a: "Tap Edit next to 'Welcome back' on Home. Drag sections to reorder. Tap the red − to hide a section or the green + to restore it. Tap DONE to save.",
  },
  {
    q: "How do I book a class or private session?",
    a: "Tap the calendar tab to see this week's schedule. Tap any class or tap Book to request a 1:1 with an instructor. Bookings are inquiries. The dojo confirms by text or email, and payment happens in person at the dojo.",
  },
  {
    q: "How do I log food and track macros?",
    a: "From Home, tap Search to look up a food by name, Scan to scan a barcode, or Photo to snap a meal and let AI estimate the macros. Food Log tile has the same options plus your meal history.",
  },
  {
    q: "Can I connect a heart-rate monitor?",
    a: "Yes. Open Start Workout from the Training grid on Home. Put on any Bluetooth chest strap that supports the standard HR service (Polar H10, Wahoo Tickr, Garmin HRM Pro, etc.), then tap Scan.",
  },
  {
    q: "How do I block or report someone?",
    a: "Tap the ••• menu on any post, direct message thread, or user profile → Report or Block user. Manage your block list in Settings → Privacy & Safety → Blocked Users.",
  },
  {
    q: "How do I earn Dojo Points (💎) and Flames?",
    a: "Attending sessions, logging workouts, keeping streaks alive, and winning the daily spin all earn points. Flames are weekly bonus currency. Redeem both in the store when checking out.",
  },
  {
    q: "How do I delete my account?",
    a: "Settings → Danger Zone → Delete Account. This permanently removes your profile, workouts, messages, photos, and all training data. Cannot be undone.",
  },
  {
    q: "My heart-rate monitor won't pair.",
    a: "Make sure the strap is wet (chest straps need skin contact), Bluetooth is on, and no other app is currently connected to the strap. If the Start Workout screen says 'unavailable', restart the app. Web preview doesn't support Bluetooth.",
  },
];

export function HelpScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const handleReplayTutorial = async () => {
    // Harmless action — no confirm needed. Reset the flag and hop to Home;
    // HomeScreen's focus listener reopens the TutorialModal.
    // (Using Alert.alert with buttons doesn't work on web react-native, so
    //  we avoid it for this particular flow.)
    try {
      await resetCoachmarks();
    } catch {
      /* ignore */
    }
    navigation.navigate('Main', { screen: 'Home' });
  };

  const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Zenki Support')}`;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <SoundPressable onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </SoundPressable>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Help</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Quick actions */}
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>QUICK ACTIONS</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <SoundPressable style={styles.row} onPress={handleReplayTutorial} activeOpacity={0.7}>
            <View style={[styles.rowIcon, { backgroundColor: colors.goldMuted }]}>
              <Ionicons name="play-circle-outline" size={20} color={colors.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.textPrimary }]}>Replay tutorial</Text>
              <Text style={[styles.rowSub, { color: colors.textMuted }]}>Show the first-run walkthrough again</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </SoundPressable>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <SoundPressable
            style={styles.row}
            onPress={() => navigation.navigate('ContactSupport')}
            activeOpacity={0.7}
          >
            <View style={[styles.rowIcon, { backgroundColor: colors.goldMuted }]}>
              <Ionicons name="chatbubbles-outline" size={20} color={colors.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.textPrimary }]}>Contact the dojo</Text>
              <Text style={[styles.rowSub, { color: colors.textMuted }]}>In-app message to admin</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </SoundPressable>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <SoundPressable
            style={styles.row}
            onPress={() => Linking.openURL(mailto).catch(() => Alert.alert('Error', 'Could not open mail app.'))}
            activeOpacity={0.7}
          >
            <View style={[styles.rowIcon, { backgroundColor: colors.goldMuted }]}>
              <Ionicons name="mail-outline" size={20} color={colors.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.textPrimary }]}>Email support</Text>
              <Text style={[styles.rowSub, { color: colors.textMuted }]}>{CONTACT_EMAIL}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </SoundPressable>
        </View>

        {/* FAQ */}
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>FREQUENTLY ASKED</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {FAQS.map((f, i) => {
            const expanded = expandedIdx === i;
            return (
              <View key={i}>
                <SoundPressable
                  style={styles.faqRow}
                  onPress={() => setExpandedIdx(expanded ? null : i)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.faqQ, { color: colors.textPrimary }]} numberOfLines={expanded ? undefined : 2}>
                    {f.q}
                  </Text>
                  <Ionicons
                    name={expanded ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={colors.textMuted}
                    style={{ marginLeft: 8 }}
                  />
                </SoundPressable>
                {expanded && (
                  <Text style={[styles.faqA, { color: colors.textSecondary }]}>{f.a}</Text>
                )}
                {i < FAQS.length - 1 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
              </View>
            );
          })}
        </View>

        {/* Legal / info */}
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>ABOUT</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <SoundPressable
            style={styles.row}
            onPress={() => Linking.openURL(PRIVACY_URL).catch(() => Alert.alert('Error', 'Could not open privacy policy.'))}
            activeOpacity={0.7}
          >
            <View style={[styles.rowIcon, { backgroundColor: colors.goldMuted }]}>
              <Ionicons name="shield-checkmark-outline" size={20} color={colors.gold} />
            </View>
            <Text style={[styles.rowTitle, { color: colors.textPrimary, flex: 1 }]}>Privacy Policy</Text>
            <Ionicons name="open-outline" size={18} color={colors.textMuted} />
          </SoundPressable>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <SoundPressable
            style={styles.row}
            onPress={() => Linking.openURL(SUPPORT_URL).catch(() => Alert.alert('Error', 'Could not open support page.'))}
            activeOpacity={0.7}
          >
            <View style={[styles.rowIcon, { backgroundColor: colors.goldMuted }]}>
              <Ionicons name="document-text-outline" size={20} color={colors.gold} />
            </View>
            <Text style={[styles.rowTitle, { color: colors.textPrimary, flex: 1 }]}>Full support page</Text>
            <Ionicons name="open-outline" size={18} color={colors.textMuted} />
          </SoundPressable>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.row}>
            <View style={[styles.rowIcon, { backgroundColor: colors.goldMuted }]}>
              <Ionicons name="information-circle-outline" size={20} color={colors.gold} />
            </View>
            <Text style={[styles.rowTitle, { color: colors.textPrimary, flex: 1 }]}>App version</Text>
            <Text style={[styles.rowSub, { color: colors.textMuted }]}>{APP_VERSION} · {Platform.OS}</Text>
          </View>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  scroll: { paddingBottom: spacing.lg },

  sectionLabel: {
    fontSize: 11, fontWeight: '800', letterSpacing: 1.4,
    paddingHorizontal: spacing.lg, marginTop: spacing.lg, marginBottom: 8,
  },
  card: {
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.lg, borderWidth: 1.5,
    overflow: 'hidden',
  },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 14, gap: 12,
  },
  rowIcon: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  rowTitle: { fontSize: 14, fontWeight: '700' },
  rowSub: { fontSize: 11, fontWeight: '500', marginTop: 1 },
  divider: { height: 1, marginHorizontal: 14 },

  faqRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 14,
  },
  faqQ: { flex: 1, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  faqA: {
    fontSize: 13, lineHeight: 19,
    paddingHorizontal: 14, paddingBottom: 14,
  },
});
