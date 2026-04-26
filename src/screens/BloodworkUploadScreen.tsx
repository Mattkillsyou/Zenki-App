import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ActivityIndicator,
  ScrollView,
  Platform,
  KeyboardAvoidingView} from 'react-native';
import { SoundPressable } from '../components/SoundPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HealthDataConsentModal, HEALTH_CONSENT_KEY } from '../components/HealthDataConsentModal';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useNutrition } from '../context/NutritionContext';
import { spacing, borderRadius } from '../theme';
import { FadeInView } from '../components';
import { parseBloodwork, BloodworkExtraction } from '../services/aiVision';
import { getCurrentIdToken } from '../services/firebaseAuth';
import { AI_IMAGE_MAX_DIMENSION } from '../config/api';
import { BiomarkerStatus, StoredBiomarker } from '../types/bloodwork';
import { lookupBiomarkerRef } from '../data/biomarkers';

type MimeType = 'image/jpeg' | 'image/png' | 'application/pdf';

type Phase =
  | { kind: 'idle' }
  | { kind: 'staged'; uri: string; base64: string; mimeType: MimeType; isPdf: boolean }
  | { kind: 'analyzing'; uri: string; isPdf: boolean }
  | { kind: 'review'; extraction: BloodworkExtraction }
  | { kind: 'error'; message: string };

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function statusColor(s: BiomarkerStatus): string {
  switch (s) {
    case 'optimal':      return '#4CAF50';
    case 'sufficient':   return '#7ECEF4';
    case 'out_of_range': return '#E35B5B';
    default:             return '#888';
  }
}

export function BloodworkUploadScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { addBloodworkReport } = useNutrition();

  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  // Health-data consent gate — show the modal exactly once per device
  const [consentModalOpen, setConsentModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<null | 'image' | 'pdf'>(null);

  async function ensureConsent(next: 'image' | 'pdf') {
    const accepted = await AsyncStorage.getItem(HEALTH_CONSENT_KEY);
    if (accepted === 'true') {
      if (next === 'image') pickImage();
      else pickPdf();
      return;
    }
    setPendingAction(next);
    setConsentModalOpen(true);
  }

  async function acceptConsent() {
    await AsyncStorage.setItem(HEALTH_CONSENT_KEY, 'true');
    setConsentModalOpen(false);
    const next = pendingAction;
    setPendingAction(null);
    if (next === 'image') pickImage();
    else if (next === 'pdf') pickPdf();
  }

  async function pickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: false,
    });
    if (!r.canceled && r.assets[0]) {
      const m = await ImageManipulator.manipulateAsync(
        r.assets[0].uri,
        [{ resize: { width: AI_IMAGE_MAX_DIMENSION } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      if (!m.base64) {
        setPhase({ kind: 'error', message: 'Could not read image.' });
        return;
      }
      setPhase({ kind: 'staged', uri: m.uri, base64: m.base64, mimeType: 'image/jpeg', isPdf: false });
    }
  }

  async function pickPdf() {
    const r = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
    });
    if (r.canceled) return;
    try {
      const asset = r.assets?.[0];
      if (!asset) return;
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: 'base64',
      });
      const bytes = (base64.length * 3) / 4;
      if (bytes > 8 * 1024 * 1024) {
        setPhase({ kind: 'error', message: 'PDF too large (max 8 MB).' });
        return;
      }
      setPhase({ kind: 'staged', uri: asset.uri, base64, mimeType: 'application/pdf', isPdf: true });
    } catch (e: any) {
      setPhase({ kind: 'error', message: e?.message ?? 'Could not read PDF.' });
    }
  }

  async function analyze() {
    if (phase.kind !== 'staged') return;
    const { base64, mimeType, uri, isPdf } = phase;
    setPhase({ kind: 'analyzing', uri, isPdf });

    const token = await getCurrentIdToken();
    const result = await parseBloodwork(base64, mimeType, token ?? undefined);
    if (!result.ok) {
      const msg =
        result.error.code === 'no_auth'
          ? 'Please sign out and back in, then try again.'
          : result.error.code === 'no_network'
            ? 'No internet connection.'
            : result.error.code === 'rate_limit'
              ? result.error.message
              : 'Could not parse this report. Try a clearer photo or PDF.';
      setPhase({ kind: 'error', message: msg });
      return;
    }
    setPhase({ kind: 'review', extraction: result.data });
  }

  function save() {
    if (phase.kind !== 'review' || !user) return;
    const stored: StoredBiomarker[] = (phase.extraction.biomarkers ?? []).map((b) => {
      // Enrich with our fallback ranges if the AI didn't find them on the report
      const ref = lookupBiomarkerRef(b.name);
      return {
        name: b.name,
        displayName: b.displayName,
        value: b.value,
        unit: b.unit || ref?.unit || '',
        referenceLow: b.referenceLow ?? ref?.referenceLow,
        referenceHigh: b.referenceHigh ?? ref?.referenceHigh,
        status: b.status,
        category: (b.category as any) ?? ref?.category ?? 'Other',
      };
    });

    addBloodworkReport({
      memberId: user.id,
      testDate: phase.extraction.testDate ?? todayISO(),
      source: 'ai',
      labName: phase.extraction.labName,
      biomarkers: stored,
    });
    navigation.goBack();
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <SoundPressable
            onPress={() => navigation.goBack()}
            style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Ionicons name="close" size={22} color={colors.textPrimary} />
          </SoundPressable>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Upload labs</Text>
          <View style={styles.backBtn} />
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {phase.kind === 'idle' && (
            <FadeInView>
              <View style={[styles.intro, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="flask-outline" size={36} color={colors.gold} />
                <Text style={[styles.introTitle, { color: colors.textPrimary }]}>Upload lab report</Text>
                <Text style={[styles.introSub, { color: colors.textSecondary }]}>
                  PDF works best for accuracy. Photos of printed reports work if well-lit.
                  The AI identifies each biomarker, matches to reference ranges, and flags anything out of range.
                </Text>
              </View>
              <View style={styles.btnRow}>
                <SoundPressable onPress={() => ensureConsent('pdf')} style={[styles.bigBtn, { backgroundColor: colors.gold }]}>
                  <Ionicons name="document-attach" size={22} color="#000" />
                  <Text style={styles.bigBtnText}>Upload PDF</Text>
                </SoundPressable>
                <SoundPressable onPress={() => ensureConsent('image')} style={[styles.bigBtn, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
                  <Ionicons name="image" size={22} color={colors.textPrimary} />
                  <Text style={[styles.bigBtnText, { color: colors.textPrimary }]}>Pick photo</Text>
                </SoundPressable>
              </View>
            </FadeInView>
          )}

          {phase.kind === 'staged' && (
            <FadeInView>
              {phase.isPdf ? (
                <View style={[styles.pdfBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name="document-text" size={42} color={colors.gold} />
                  <Text style={[styles.pdfText, { color: colors.textPrimary }]}>PDF staged</Text>
                  <Text style={[styles.pdfSub, { color: colors.textMuted }]}>Ready to analyze</Text>
                </View>
              ) : (
                <Image source={{ uri: phase.uri }} style={styles.preview} />
              )}
              <SoundPressable
                activeOpacity={0.85}
                onPress={analyze}
                style={[styles.cta, { backgroundColor: colors.gold }]}
              >
                <Ionicons name="sparkles" size={20} color="#000" />
                <Text style={styles.ctaText}>Extract with AI</Text>
              </SoundPressable>
              <SoundPressable onPress={() => setPhase({ kind: 'idle' })} style={{ alignSelf: 'center', marginTop: spacing.md }}>
                <Text style={{ color: colors.textMuted, fontSize: 14, fontWeight: '600' }}>Choose different file</Text>
              </SoundPressable>
            </FadeInView>
          )}

          {phase.kind === 'analyzing' && (
            <FadeInView>
              <View style={[styles.analyzing, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <ActivityIndicator color={colors.gold} size="small" />
                <Text style={[styles.analyzingText, { color: colors.textPrimary }]}>Parsing biomarkers…</Text>
                <Text style={[styles.analyzingSub, { color: colors.textMuted }]}>
                  Lab reports take 20–40 seconds.
                </Text>
              </View>
            </FadeInView>
          )}

          {phase.kind === 'review' && (
            <FadeInView>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                FOUND {phase.extraction.biomarkers?.length ?? 0} BIOMARKERS
              </Text>
              {phase.extraction.testDate && (
                <Text style={[styles.reviewDate, { color: colors.textSecondary }]}>
                  Test date: {phase.extraction.testDate}
                </Text>
              )}
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {(phase.extraction.biomarkers ?? []).map((b, i) => (
                  <View key={i} style={[styles.reviewRow, { borderBottomColor: colors.border }]}>
                    <View style={[styles.statusDot, { backgroundColor: statusColor(b.status) }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.reviewName, { color: colors.textPrimary }]}>
                        {b.displayName || b.name}
                      </Text>
                      <Text style={[styles.reviewVal, { color: colors.textSecondary }]}>
                        {b.value} {b.unit}
                        {b.referenceLow != null && b.referenceHigh != null && (
                          <>  ·  ref {b.referenceLow}–{b.referenceHigh}</>
                        )}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
              <SoundPressable
                activeOpacity={0.85}
                onPress={save}
                style={[styles.cta, { backgroundColor: colors.gold }]}
              >
                <Ionicons name="checkmark" size={20} color="#000" />
                <Text style={styles.ctaText}>Save report</Text>
              </SoundPressable>
            </FadeInView>
          )}

          {phase.kind === 'error' && (
            <FadeInView>
              <View style={[styles.errorCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="alert-circle-outline" size={32} color={colors.gold} />
                <Text style={[styles.errorText, { color: colors.textPrimary }]}>{phase.message}</Text>
              </View>
              <SoundPressable
                activeOpacity={0.85}
                onPress={() => setPhase({ kind: 'idle' })}
                style={[styles.cta, { backgroundColor: colors.gold }]}
              >
                <Text style={styles.ctaText}>Try again</Text>
              </SoundPressable>
            </FadeInView>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <HealthDataConsentModal
        visible={consentModalOpen}
        onAccept={acceptConsent}
        onDecline={() => {
          setConsentModalOpen(false);
          setPendingAction(null);
        }}
        feature="bloodwork report"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: 0,
    paddingBottom: spacing.md,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: 0.5 },

  intro: {
    marginHorizontal: spacing.lg,
    padding: spacing.xl,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    gap: spacing.sm,
  },
  introTitle: { fontSize: 20, fontWeight: '900', marginTop: spacing.sm, letterSpacing: -0.2 },
  introSub: { fontSize: 13, fontWeight: '500', textAlign: 'center', lineHeight: 20 },

  btnRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  bigBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  bigBtnText: { color: '#000', fontSize: 14, fontWeight: '900', letterSpacing: 0.3 },

  preview: {
    marginHorizontal: spacing.lg,
    height: 280,
    borderRadius: borderRadius.lg,
    backgroundColor: '#000',
    resizeMode: 'contain',
  },
  pdfBadge: {
    marginHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    gap: 4,
  },
  pdfText: { fontSize: 17, fontWeight: '800', marginTop: spacing.sm },
  pdfSub: { fontSize: 12, fontWeight: '600' },

  analyzing: {
    marginHorizontal: spacing.lg,
    padding: spacing.xl,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    gap: spacing.sm,
  },
  analyzingText: { fontSize: 15, fontWeight: '800', marginTop: spacing.sm, letterSpacing: 0.3 },
  analyzingSub: { fontSize: 12, fontWeight: '600' },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  reviewDate: {
    fontSize: 12,
    fontWeight: '600',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  card: {
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  reviewName: { fontSize: 14, fontWeight: '800' },
  reviewVal: { fontSize: 12, fontWeight: '600', marginTop: 2 },

  errorCard: {
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorText: { fontSize: 14, fontWeight: '600', textAlign: 'center', lineHeight: 20 },

  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    paddingVertical: 16,
    borderRadius: borderRadius.md,
  },
  ctaText: { color: '#000', fontSize: 15, fontWeight: '900', letterSpacing: 0.3 },
});
