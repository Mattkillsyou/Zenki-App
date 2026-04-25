import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ActivityIndicator,
  ScrollView,
  Alert,
  Platform} from 'react-native';
import { SoundPressable } from '../components/SoundPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useNutrition } from '../context/NutritionContext';
import { spacing, borderRadius } from '../theme';
import { FadeInView } from '../components';
import { recognizeFood, RecognizedFood } from '../services/aiVision';
import { getCurrentIdToken } from '../services/firebaseAuth';
import { AI_IMAGE_MAX_DIMENSION } from '../config/api';

type Phase =
  | { kind: 'idle' }
  | { kind: 'captured'; uri: string; base64: string }
  | { kind: 'analyzing'; uri: string }
  | { kind: 'results'; uri: string; foods: RecognizedFood[]; selected: Set<number> }
  | { kind: 'error'; uri?: string; message: string };

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export function PhotoFoodScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { addMacroEntry } = useNutrition();

  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  // ── Capture / pick ──
  async function pickFromLibrary() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photo library access needed', 'Enable it in Settings to pick a food photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      await processAsset(result.assets[0].uri);
    }
  }

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera access needed', 'Enable it in Settings to take a food photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      await processAsset(result.assets[0].uri);
    }
  }

  /** Downscale + compress + encode to base64 */
  async function processAsset(uri: string) {
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: AI_IMAGE_MAX_DIMENSION } }],
        { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      if (!manipulated.base64) {
        setPhase({ kind: 'error', message: 'Could not read the image.' });
        return;
      }
      setPhase({ kind: 'captured', uri: manipulated.uri, base64: manipulated.base64 });
    } catch (e: any) {
      setPhase({ kind: 'error', message: e?.message ?? 'Could not process image.' });
    }
  }

  async function analyze() {
    if (phase.kind !== 'captured') return;
    const { base64, uri } = phase;
    setPhase({ kind: 'analyzing', uri });

    const token = await getCurrentIdToken();
    const result = await recognizeFood(base64, 'image/jpeg', token ?? undefined);
    if (!result.ok) {
      const msg =
        result.error.code === 'no_auth'
          ? 'Please sign out and back in, then try again.'
          : result.error.code === 'no_network'
            ? 'No internet connection. Try again when reconnected.'
            : result.error.code === 'rate_limit'
              ? result.error.message
              : 'The AI couldn\'t analyze this photo. Try another or log manually.';
      setPhase({ kind: 'error', uri, message: msg });
      return;
    }
    setPhase({
      kind: 'results',
      uri,
      foods: result.data.foods,
      selected: new Set(result.data.foods.map((_, i) => i)), // all pre-selected
    });
  }

  function toggleSelection(idx: number) {
    if (phase.kind !== 'results') return;
    const next = new Set(phase.selected);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setPhase({ ...phase, selected: next });
  }

  function logSelected() {
    if (phase.kind !== 'results' || !user) return;
    const toLog = phase.foods.filter((_, i) => phase.selected.has(i));
    if (toLog.length === 0) {
      Alert.alert('Nothing selected', 'Pick at least one item or go back and retake.');
      return;
    }
    const today = todayISO();
    for (const f of toLog) {
      addMacroEntry({
        memberId: user.id,
        date: today,
        name: f.name,
        calories: f.macros.calories,
        protein: f.macros.protein,
        carbs: f.macros.carbs,
        fat: f.macros.fat,
      });
    }
    navigation.goBack();
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <SoundPressable
          onPress={() => navigation.goBack()}
          style={[styles.headerBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="close" size={22} color={colors.textPrimary} />
        </SoundPressable>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Photo logging</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        {/* Idle — pick/capture */}
        {phase.kind === 'idle' && (
          <FadeInView>
            <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="sparkles" size={36} color={colors.gold} />
              <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>AI food recognition</Text>
              <Text style={[styles.heroSub, { color: colors.textSecondary }]}>
                Take or upload a photo of your meal. The AI identifies the foods and estimates macros. Review before logging.
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.md }}>
              <SoundPressable
                activeOpacity={0.85}
                onPress={takePhoto}
                style={[styles.bigBtn, { backgroundColor: colors.gold }]}
              >
                <Ionicons name="camera" size={26} color="#000" />
                <Text style={styles.bigBtnText}>Take photo</Text>
              </SoundPressable>
              <SoundPressable
                activeOpacity={0.85}
                onPress={pickFromLibrary}
                style={[styles.bigBtn, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}
              >
                <Ionicons name="images" size={26} color={colors.textPrimary} />
                <Text style={[styles.bigBtnText, { color: colors.textPrimary }]}>Pick photo</Text>
              </SoundPressable>
            </View>
          </FadeInView>
        )}

        {/* Captured — preview + analyze */}
        {phase.kind === 'captured' && (
          <FadeInView>
            <Image source={{ uri: phase.uri }} style={styles.preview} />
            <SoundPressable
              activeOpacity={0.85}
              onPress={analyze}
              style={[styles.cta, { backgroundColor: colors.gold }]}
            >
              <Ionicons name="sparkles" size={20} color="#000" />
              <Text style={styles.ctaText}>Analyze with AI</Text>
            </SoundPressable>
            <SoundPressable
              onPress={() => setPhase({ kind: 'idle' })}
              style={{ alignSelf: 'center', marginTop: spacing.md }}
            >
              <Text style={{ color: colors.textMuted, fontSize: 14, fontWeight: '600' }}>Retake</Text>
            </SoundPressable>
          </FadeInView>
        )}

        {/* Analyzing */}
        {phase.kind === 'analyzing' && (
          <FadeInView>
            <Image source={{ uri: phase.uri }} style={styles.preview} />
            <View style={[styles.analyzing, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <ActivityIndicator size="small" color={colors.gold} />
              <Text style={[styles.analyzingText, { color: colors.textPrimary }]}>Identifying foods…</Text>
              <Text style={[styles.analyzingSub, { color: colors.textMuted }]}>
                Usually takes 5–10 seconds.
              </Text>
            </View>
          </FadeInView>
        )}

        {/* Results */}
        {phase.kind === 'results' && (
          <FadeInView>
            <Image source={{ uri: phase.uri }} style={styles.previewSmall} />
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
              IDENTIFIED FOODS · tap to toggle
            </Text>
            {phase.foods.map((f, i) => {
              const selected = phase.selected.has(i);
              return (
                <SoundPressable
                  key={i}
                  activeOpacity={0.85}
                  onPress={() => toggleSelection(i)}
                  style={[
                    styles.foodRow,
                    {
                      backgroundColor: colors.surface,
                      borderColor: selected ? colors.gold : colors.border,
                      borderWidth: selected ? 2 : 1,
                      opacity: selected ? 1 : 0.5,
                    },
                  ]}
                >
                  <Ionicons
                    name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                    size={24}
                    color={selected ? colors.gold : colors.textMuted}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.foodName, { color: colors.textPrimary }]} numberOfLines={2}>
                      {f.name}
                    </Text>
                    <Text style={[styles.foodMeta, { color: colors.textSecondary }]}>
                      {f.estimatedGrams}g · confidence: {f.confidence}
                    </Text>
                    <Text style={[styles.foodMacros, { color: colors.textSecondary }]}>
                      {f.macros.calories} cal · {f.macros.protein}p · {f.macros.carbs}c · {f.macros.fat}f
                    </Text>
                  </View>
                </SoundPressable>
              );
            })}
            <SoundPressable
              activeOpacity={0.85}
              onPress={logSelected}
              style={[styles.cta, { backgroundColor: colors.gold }]}
            >
              <Ionicons name="add-circle" size={20} color="#000" />
              <Text style={styles.ctaText}>Log {phase.selected.size} item{phase.selected.size === 1 ? '' : 's'}</Text>
            </SoundPressable>
          </FadeInView>
        )}

        {/* Error */}
        {phase.kind === 'error' && (
          <FadeInView>
            {phase.uri && <Image source={{ uri: phase.uri }} style={styles.previewSmall} />}
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
    paddingVertical: spacing.md,
  },
  headerBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: 0.5 },

  hero: {
    marginHorizontal: spacing.lg,
    padding: spacing.xl,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    gap: spacing.sm,
  },
  heroTitle: { fontSize: 20, fontWeight: '900', marginTop: spacing.sm, letterSpacing: -0.2 },
  heroSub: { fontSize: 14, fontWeight: '500', textAlign: 'center', lineHeight: 20 },

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
    height: 320,
    borderRadius: borderRadius.lg,
    backgroundColor: '#000',
    resizeMode: 'cover',
  },
  previewSmall: {
    marginHorizontal: spacing.lg,
    height: 160,
    borderRadius: borderRadius.lg,
    backgroundColor: '#000',
    resizeMode: 'cover',
  },

  analyzing: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
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
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
  },
  foodName: { fontSize: 15, fontWeight: '800' },
  foodMeta: { fontSize: 11, fontWeight: '600', marginTop: 2, letterSpacing: 0.2 },
  foodMacros: { fontSize: 12, fontWeight: '600', marginTop: 4, letterSpacing: 0.2 },

  errorCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
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
