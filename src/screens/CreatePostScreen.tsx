import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, TextInput, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../context/ThemeContext';
import { typography, spacing, borderRadius } from '../theme';
import { createPost } from '../services/firebasePosts';

export type MediaOrientation = 'portrait' | 'landscape' | 'square';

export function CreatePostScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'photo' | 'video'>('photo');
  const [orientation, setOrientation] = useState<MediaOrientation>('portrait');
  const [aspectRatio, setAspectRatio] = useState<number>(1);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);

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

    let result;
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera access is required.');
        return;
      }
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
  };

  const handlePost = async () => {
    if (!mediaUri) return;
    setUploading(true);
    try {
      await createPost(mediaUri, mediaType, caption);
      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', 'Failed to create post. Please try again.');
      setUploading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>New Post</Text>
        <TouchableOpacity
          onPress={handlePost}
          disabled={!mediaUri || uploading}
          style={[styles.postButton, { backgroundColor: mediaUri ? colors.red : colors.surfaceSecondary }]}
        >
          {uploading ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Text style={[styles.postButtonText, { color: mediaUri ? '#FFF' : colors.textMuted }]}>Post</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Media Preview or Picker */}
      {mediaUri ? (
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

          <TouchableOpacity
            style={[styles.changeButton, { backgroundColor: colors.surface }]}
            onPress={() => setMediaUri(null)}
          >
            <Ionicons name="refresh-outline" size={18} color={colors.textPrimary} />
            <Text style={[styles.changeText, { color: colors.textPrimary }]}>Change</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.pickerContainer}>
          <TouchableOpacity
            style={[styles.pickerButton, { backgroundColor: colors.surface }]}
            onPress={() => pickMedia('library')}
          >
            <Ionicons name="images-outline" size={36} color={colors.gold} />
            <Text style={[styles.pickerLabel, { color: colors.textPrimary }]}>Photo / Video</Text>
            <Text style={[styles.pickerSub, { color: colors.textTertiary }]}>From library</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.pickerButton, { backgroundColor: colors.surface }]}
            onPress={() => pickMedia('camera')}
          >
            <Ionicons name="camera-outline" size={36} color={colors.gold} />
            <Text style={[styles.pickerLabel, { color: colors.textPrimary }]}>Camera</Text>
            <Text style={[styles.pickerSub, { color: colors.textTertiary }]}>Take a photo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.pickerButton, { backgroundColor: colors.surface }]}
            onPress={() => pickMedia('camera', true)}
          >
            <Ionicons name="videocam-outline" size={36} color={colors.gold} />
            <Text style={[styles.pickerLabel, { color: colors.textPrimary }]}>Video</Text>
            <Text style={[styles.pickerSub, { color: colors.textTertiary }]}>Record · 60s max</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Caption */}
      {mediaUri && (
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
    paddingVertical: 14,
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
});
