import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, TextInput, ActivityIndicator, Alert } from 'react-native';
import { KeyboardAwareScrollView } from '../components';
import { SoundPressable } from '../components/SoundPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../context/ThemeContext';
import { typography, spacing, borderRadius } from '../theme';
import { createPost, createTextPost } from '../services/firebasePosts';

export type MediaOrientation = 'portrait' | 'landscape' | 'square';

type PostMode = 'photo' | 'text';

export function CreatePostScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [mode, setMode] = useState<PostMode>('photo');
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'photo' | 'video'>('photo');
  const [orientation, setOrientation] = useState<MediaOrientation>('portrait');
  const [aspectRatio, setAspectRatio] = useState<number>(1);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const TEXT_MAX = 280;
  const canPostText = mode === 'text' && caption.trim().length > 0;
  const canPostPhoto = mode === 'photo' && !!mediaUri;
  const canPost = canPostText || canPostPhoto;

  const detectOrientation = (width: number, height: number): MediaOrientation => {
    if (Math.abs(width - height) < 20) return 'square';
    return width > height ? 'landscape' : 'portrait';
  };

  const pickMedia = async (source: 'library' | 'camera', forceVideo = false) => {
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: forceVideo ? ['videos'] : ['images', 'videos'],
      allowsEditing: false,        // preserve native aspect ratio for portrait/landscape
      quality: 0.85,
      videoMaxDuration: 60,        // 60s cap for video posts
    };

    try {
      let result;
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Required', 'Camera access is required.');
          return;
        }
        // For video, the system also needs the microphone permission. iOS will
        // hard-crash launchCameraAsync if NSMicrophoneUsageDescription is
        // missing from the Info.plist — that's fixed in app.json now, but
        // request the perm explicitly here so the prompt is friendly.
        result = await ImagePicker.launchCameraAsync(options);
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Required', 'Photo library access is required.');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync(options);
      }

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setMediaUri(asset.uri);
        setMediaType(asset.type === 'video' ? 'video' : 'photo');
        const w = asset.width || 1;
        const h = asset.height || 1;
        setAspectRatio(w / h);
        setOrientation(detectOrientation(w, h));
      }
    } catch (err: any) {
      // Catch native ImagePicker rejections (camera unavailable, permission
      // edge cases, mic-not-authorized for video, etc.) so the app doesn't
      // crash — surface a friendly alert and stay on the New Post screen.
      Alert.alert(
        'Camera unavailable',
        err?.message || 'We couldn\'t open the camera. Try again, or pick from your library.',
      );
    }
  };

  const handlePost = async () => {
    const friendlyError = (err: any): { title: string; body: string } => {
      const code = err?.code || err?.message || '';
      if (code === 'not-signed-in') {
        return {
          title: "Couldn't post",
          body: "Sign out and sign back in — your account isn't fully connected to the server.",
        };
      }
      if (code === 'firebase-not-configured') {
        return {
          title: "Couldn't post",
          body: 'The community feed is not configured for this build.',
        };
      }
      if (code === 'permission-denied' || /permission/i.test(code)) {
        return {
          title: "Couldn't post",
          body: "You don't have permission to post yet — ask the dojo admin to verify your account.",
        };
      }
      return { title: 'Error', body: 'Failed to post. Please try again.' };
    };

    if (mode === 'text') {
      if (!caption.trim()) return;
      setUploading(true);
      try {
        const created = await createTextPost(caption);
        if (!created) throw new Error('post-failed');
        navigation.goBack();
      } catch (err) {
        const { title, body } = friendlyError(err);
        Alert.alert(title, body);
        setUploading(false);
      }
      return;
    }
    if (!mediaUri) return;
    setUploading(true);
    try {
      const created = await createPost(mediaUri, mediaType, caption);
      if (!created) throw new Error('post-failed');
      navigation.goBack();
    } catch (err) {
      const { title, body } = friendlyError(err);
      Alert.alert(title, body);
      setUploading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <SoundPressable onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={28} color={colors.textPrimary} />
        </SoundPressable>
        <Text style={[styles.title, { color: colors.textPrimary }]}>New Post</Text>
        <SoundPressable
          onPress={handlePost}
          disabled={!canPost || uploading}
          style={[styles.postButton, { backgroundColor: canPost ? colors.red : colors.surfaceSecondary }]}
        >
          {uploading ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Text style={[styles.postButtonText, { color: canPost ? '#FFF' : colors.textMuted }]}>Post</Text>
          )}
        </SoundPressable>
      </View>

      <KeyboardAwareScrollView>
      {/* Mode toggle — Photo vs Text */}
      <View style={[styles.modeToggle, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <SoundPressable
          style={[styles.modeOption, mode === 'photo' && { backgroundColor: colors.gold }]}
          onPress={() => setMode('photo')}
        >
          <Ionicons name="image-outline" size={16} color={mode === 'photo' ? '#000' : colors.textMuted} />
          <Text style={[styles.modeLabel, { color: mode === 'photo' ? '#000' : colors.textMuted }]}>Photo</Text>
        </SoundPressable>
        <SoundPressable
          style={[styles.modeOption, mode === 'text' && { backgroundColor: colors.gold }]}
          onPress={() => setMode('text')}
        >
          <Ionicons name="chatbox-outline" size={16} color={mode === 'text' ? '#000' : colors.textMuted} />
          <Text style={[styles.modeLabel, { color: mode === 'text' ? '#000' : colors.textMuted }]}>Text</Text>
        </SoundPressable>
      </View>

      {/* TEXT MODE */}
      {mode === 'text' && (
        <View style={styles.textModeWrap}>
          <TextInput
            style={[styles.textarea, { backgroundColor: colors.surface, color: colors.textPrimary }]}
            placeholder="What's on your mind?"
            placeholderTextColor={colors.textMuted}
            value={caption}
            onChangeText={setCaption}
            multiline
            maxLength={TEXT_MAX}
            autoFocus
          />
          <Text style={[styles.charCount, { color: caption.length > TEXT_MAX - 20 ? colors.red : colors.textMuted }]}>
            {caption.length}/{TEXT_MAX}
          </Text>
        </View>
      )}

      {/* PHOTO MODE — the block below only renders when mode === 'photo' */}
      {mode === 'photo' && (mediaUri ? (
        <View style={styles.previewContainer}>
          <View style={[styles.previewFrame, { backgroundColor: colors.surface, aspectRatio }]}>
            {mediaType === 'video' ? (
              <View style={[styles.videoPlaceholder, { backgroundColor: colors.backgroundElevated }]}>
                <Ionicons name="play-circle" size={64} color={colors.gold} />
                <Text style={[styles.videoLabel, { color: colors.textSecondary }]}>Video preview</Text>
              </View>
            ) : (
              <Image source={{ uri: mediaUri }} style={styles.preview} resizeMode="contain" />
            )}
          </View>

          {/* Orientation badge */}
          <View style={[styles.orientationBadge, { backgroundColor: colors.surface }]}>
            <Ionicons
              name={orientation === 'landscape' ? 'tablet-landscape-outline' : orientation === 'square' ? 'square-outline' : 'phone-portrait-outline'}
              size={14}
              color={colors.gold}
            />
            <Text style={[styles.orientationText, { color: colors.textSecondary }]}>
              {orientation.charAt(0).toUpperCase() + orientation.slice(1)} · {mediaType === 'video' ? 'Video' : 'Photo'}
            </Text>
          </View>

          <SoundPressable
            style={[styles.changeButton, { backgroundColor: colors.surface }]}
            onPress={() => setMediaUri(null)}
          >
            <Ionicons name="refresh-outline" size={18} color={colors.textPrimary} />
            <Text style={[styles.changeText, { color: colors.textPrimary }]}>Change</Text>
          </SoundPressable>
        </View>
      ) : (
        <View style={styles.pickerContainer}>
          <SoundPressable
            style={[styles.pickerButton, { backgroundColor: colors.surface }]}
            onPress={() => pickMedia('library')}
          >
            <Ionicons name="images-outline" size={36} color={colors.gold} />
            <Text style={[styles.pickerLabel, { color: colors.textPrimary }]}>Photo / Video</Text>
            <Text style={[styles.pickerSub, { color: colors.textTertiary }]}>From library</Text>
          </SoundPressable>
          <SoundPressable
            style={[styles.pickerButton, { backgroundColor: colors.surface }]}
            onPress={() => pickMedia('camera')}
          >
            <Ionicons name="camera-outline" size={36} color={colors.gold} />
            <Text style={[styles.pickerLabel, { color: colors.textPrimary }]}>Camera</Text>
            <Text style={[styles.pickerSub, { color: colors.textTertiary }]}>Take a photo</Text>
          </SoundPressable>
          <SoundPressable
            style={[styles.pickerButton, { backgroundColor: colors.surface }]}
            onPress={() => pickMedia('camera', true)}
          >
            <Ionicons name="videocam-outline" size={36} color={colors.gold} />
            <Text style={[styles.pickerLabel, { color: colors.textPrimary }]}>Video</Text>
            <Text style={[styles.pickerSub, { color: colors.textTertiary }]}>Record · 60s max</Text>
          </SoundPressable>
        </View>
      ))}

      {/* Caption (photo mode only) */}
      {mode === 'photo' && mediaUri && (
        <View style={styles.captionContainer}>
          <TextInput
            style={[styles.captionInput, { backgroundColor: colors.surface, color: colors.textPrimary }]}
            placeholder="Write a caption..."
            placeholderTextColor={colors.textMuted}
            value={caption}
            onChangeText={setCaption}
            multiline
            maxLength={500}
          />
          <Text style={[styles.charCount, { color: colors.textMuted }]}>{caption.length}/500</Text>
        </View>
      )}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 14,
  },
  title: { fontSize: 18, fontWeight: '700' },
  postButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 12,
    minWidth: 70,
    alignItems: 'center',
  },
  postButtonText: { fontSize: 14, fontWeight: '700' },
  previewContainer: { position: 'relative', paddingHorizontal: 20 },
  previewFrame: {
    width: '100%',
    maxHeight: 500,
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  preview: { width: '100%', height: '100%' },
  videoPlaceholder: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', gap: 8 },
  videoLabel: { fontSize: 13, fontWeight: '500' },
  orientationBadge: {
    position: 'absolute',
    top: 12,
    left: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  orientationText: { fontSize: 11, fontWeight: '600' },
  changeButton: {
    position: 'absolute',
    top: 12,
    right: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  changeText: { fontSize: 12, fontWeight: '600' },
  pickerContainer: {
    flexDirection: 'column',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  pickerButton: {
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  pickerLabel: { fontSize: 16, fontWeight: '700', flex: 1 },
  pickerSub: { fontSize: 12, fontWeight: '500' },
  captionContainer: { paddingHorizontal: 20, marginTop: 16 },
  captionInput: {
    borderRadius: 14,
    padding: 14,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  charCount: { fontSize: 11, fontWeight: '500', alignSelf: 'flex-end', marginTop: 6 },

  modeToggle: {
    flexDirection: 'row',
    marginHorizontal: 20,
    padding: 3,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 8,
  },
  modeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 999,
  },
  modeLabel: { fontSize: 13, fontWeight: '700' },

  textModeWrap: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  textarea: {
    borderRadius: 16,
    padding: 16,
    fontSize: 18,
    minHeight: 200,
    textAlignVertical: 'top',
    lineHeight: 24,
  },
});
