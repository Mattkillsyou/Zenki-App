import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
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
import { FadeInView, KeyboardAwareScrollView, HealthKitBadge } from '../components';
import { extractDexa, DexaExtraction } from '../services/aiVision';
import { getCurrentIdToken } from '../services/firebaseAuth';
import { AI_IMAGE_MAX_DIMENSION } from '../config/api';

type MimeType = 'image/jpeg' | 'image/png' | 'application/pdf';

type Phase =
  | { kind: 'idle' }
  | { kind: 'staged'; uri: string; base64: string; mimeType: MimeType; isPdf: boolean }
  | { kind: 'analyzing'; uri: string; isPdf: boolean }
  | { kind: 'review'; uri: string; isPdf: boolean; extraction: DexaExtraction }
  | { kind: 'error'; message: string };

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export function DexaUploadScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { addDexaScan } = useNutrition();

  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [editing, setEditing] = useState<Partial<DexaExtraction> & { notes?: string }>({});

  // Guard against double-tap: expo-document-picker / expo-image-picker
  // throw "concurrent picking in progress" if launched twice in flight.
  const [isPicking, setIsPicking] = useState(false);

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
    if (isPicking) return;
    setIsPicking(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        // iOS won't re-prompt once denied — surface a helpful message and a
        // jump to Settings so users aren't staring at an unresponsive button.
        Alert.alert(
          'Photo access needed',
          'Zenki needs access to your photos to upload a DEXA scan. Open Settings to enable it.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ],
        );
        return;
      }
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
        allowsEditing: false,
      });
      if (r.canceled || !r.assets[0]) return;
      const manipulated = await ImageManipulator.manipulateAsync(
        r.assets[0].uri,
        [{ resize: { width: AI_IMAGE_MAX_DIMENSION } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      if (!manipulated.base64) {
        setPhase({ kind: 'error', message: 'Could not read image.' });
        return;
      }
      setPhase({
        kind: 'staged',
        uri: manipulated.uri,
        base64: manipulated.base64,
        mimeType: 'image/jpeg',
        isPdf: false,
      });
    } catch (err: any) {
      Alert.alert('Could not open picker', err?.message || 'Please try again.');
    } finally {
      setIsPicking(false);
    }
  }

  async function pickPdf() {
    if (isPicking) return;
    setIsPicking(true);
    try {
      const r = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });
      if (r.canceled) return;
      const asset = r.assets?.[0];
      if (!asset) {
        Alert.alert('No file chosen', 'Pick a PDF to continue.');
        return;
      }
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: 'base64',
      });
      // Enforce 8 MB ceiling matching the Cloud Function
      const bytes = (base64.length * 3) / 4;
      if (bytes > 8 * 1024 * 1024) {
        setPhase({ kind: 'error', message: 'PDF too large (max 8 MB).' });
        return;
      }
      setPhase({
        kind: 'staged',
        uri: asset.uri,
        base64,
        mimeType: 'application/pdf',
        isPdf: true,
      });
    } catch (e: any) {
      // Surface failures explicitly so the button never feels broken.
      Alert.alert('Could not open PDF picker', e?.message ?? 'Please try again.');
      setPhase({ kind: 'error', message: e?.message ?? 'Could not read PDF.' });
    } finally {
      setIsPicking(false);
    }
  }

  async function analyze() {
    if (phase.kind !== 'staged') return;
    const { base64, mimeType, uri, isPdf } = phase;
    setPhase({ kind: 'analyzing', uri, isPdf });

    const token = await getCurrentIdToken();
    const result = await extractDexa(base64, mimeType, token ?? undefined);
    if (!result.ok) {
      const msg =
        result.error.code === 'no_auth'
          ? 'Please sign out and back in, then try again.'
          : result.error.code === 'no_network'
            ? 'No internet connection.'
            : result.error.code === 'rate_limit'
              ? result.error.message
              : 'Could not parse this report. Try a clearer photo or enter values manually.';
      setPhase({ kind: 'error', message: msg });
      return;
    }
    setEditing(result.data);
    setPhase({ kind: 'review', uri, isPdf, extraction: result.data });
  }

  function save() {
    if (phase.kind !== 'review' || !user) return;
    const e = editing;
    addDexaScan({
      memberId: user.id,
      source: 'ai',
      scanDate: e.scanDate ?? todayISO(),
      totalBodyFatPct: e.totalBodyFatPct,
      fatMassKg: e.fatMassKg,
      leanMassKg: e.leanMassKg,
      bmc: e.bmc,
      vatCm2: e.vatCm2,
      fmi: e.fmi,
      ffmi: e.ffmi,
      androidGynoidRatio: e.androidGynoidRatio,
      arms: e.regional?.arms,
      legs: e.regional?.legs,
      trunk: e.regional?.trunk,
      notes: e.notes,
    });
    navigation.goBack();
  }

  function setField<K extends keyof DexaExtraction>(key: K, text: string) {
    const n = parseFloat(text);
    setEditing((prev) => ({
      ...prev,
      [key]: text === '' ? undefined : Number.isFinite(n) ? n : prev[key],
    }));
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <SoundPressable
          onPress={() => navigation.goBack()}
          style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="close" size={22} color={colors.textPrimary} />
        </SoundPressable>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Upload DEXA</Text>
        <View style={styles.backBtn} />
      </View>

      <KeyboardAwareScrollView contentContainerStyle={{ paddingBottom: 120 }}>
          <HealthKitBadge style={{ marginHorizontal: spacing.lg, marginBottom: spacing.md }} />
          {/* Idle */}
          {phase.kind === 'idle' && (
            <FadeInView>
              <View style={[styles.intro, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="body-outline" size={36} color={colors.gold} />
                <Text style={[styles.introTitle, { color: colors.textPrimary }]}>Upload your scan</Text>
                <Text style={[styles.introSub, { color: colors.textSecondary }]}>
                  PDF works best. Photos of printed reports also work if well-lit and crop-tight.
                  The AI extracts body fat %, lean mass, VAT, regional breakdown, and more.
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

          {/* Staged */}
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

          {/* Analyzing */}
          {phase.kind === 'analyzing' && (
            <FadeInView>
              <View style={[styles.analyzing, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <ActivityIndicator color={colors.gold} size="small" />
                <Text style={[styles.analyzingText, { color: colors.textPrimary }]}>Extracting metrics…</Text>
                <Text style={[styles.analyzingSub, { color: colors.textMuted }]}>
                  DEXA reports take 15–30 seconds to parse.
                </Text>
              </View>
            </FadeInView>
          )}

          {/* Review — editable fields */}
          {phase.kind === 'review' && (
            <FadeInView>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>REVIEW & EDIT</Text>
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <EditRow label="Scan date"       value={String(editing.scanDate ?? '')}   onChange={(v) => setEditing((p) => ({ ...p, scanDate: v }))} hint="YYYY-MM-DD" colors={colors} />
                <EditRow label="Body fat %"      value={numStr(editing.totalBodyFatPct)}  onChange={(v) => setField('totalBodyFatPct', v)} keyboard="decimal-pad" colors={colors} />
                <EditRow label="Fat mass (kg)"   value={numStr(editing.fatMassKg)}        onChange={(v) => setField('fatMassKg', v)}       keyboard="decimal-pad" colors={colors} />
                <EditRow label="Lean mass (kg)"  value={numStr(editing.leanMassKg)}       onChange={(v) => setField('leanMassKg', v)}      keyboard="decimal-pad" colors={colors} />
                <EditRow label="Bone (kg)"       value={numStr(editing.bmc)}              onChange={(v) => setField('bmc', v)}             keyboard="decimal-pad" colors={colors} />
                <EditRow label="VAT (cm²)"       value={numStr(editing.vatCm2)}           onChange={(v) => setField('vatCm2', v)}          keyboard="decimal-pad" colors={colors} />
                <EditRow label="FMI"             value={numStr(editing.fmi)}              onChange={(v) => setField('fmi', v)}             keyboard="decimal-pad" colors={colors} />
                <EditRow label="FFMI"            value={numStr(editing.ffmi)}             onChange={(v) => setField('ffmi', v)}            keyboard="decimal-pad" colors={colors} />
                <EditRow label="A/G ratio"       value={numStr(editing.androidGynoidRatio)} onChange={(v) => setField('androidGynoidRatio', v)} keyboard="decimal-pad" colors={colors} />
              </View>

              <SoundPressable
                activeOpacity={0.85}
                onPress={save}
                style={[styles.cta, { backgroundColor: colors.gold }]}
              >
                <Ionicons name="checkmark" size={20} color="#000" />
                <Text style={styles.ctaText}>Save scan</Text>
              </SoundPressable>
            </FadeInView>
          )}

          {/* Error */}
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
      </KeyboardAwareScrollView>

      <HealthDataConsentModal
        visible={consentModalOpen}
        onAccept={acceptConsent}
        onDecline={() => {
          setConsentModalOpen(false);
          setPendingAction(null);
        }}
        feature="DEXA scan"
      />
    </SafeAreaView>
  );
}

function numStr(v: number | undefined): string {
  return v == null ? '' : String(v);
}

function EditRow({
  label,
  value,
  onChange,
  colors,
  hint,
  keyboard = 'default',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  colors: any;
  hint?: string;
  keyboard?: 'default' | 'decimal-pad';
}) {
  return (
    <View style={[styles.editRow, { borderBottomColor: colors.border }]}>
      <Text style={[styles.editLabel, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={hint ?? '—'}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboard as any}
        style={[styles.editInput, { color: colors.textPrimary, borderColor: colors.border }]}
      />
    </View>
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
    marginTop: spacing.md,
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
  card: {
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  editLabel: { fontSize: 13, fontWeight: '600' },
  editInput: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
    minWidth: 100,
  },

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
