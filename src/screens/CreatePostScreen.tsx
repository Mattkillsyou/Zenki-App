import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../context/ThemeContext';
import { typography, spacing, borderRadius } from '../theme';
import { createPost } from '../services/firebasePosts';

export function CreatePostScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'photo' | 'video'>('photo');
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);

  const pickMedia = async (source: 'library' | 'camera') => {
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images', 'videos'],
      allowsEditing: true,
      quality: 0.8,
    };

    let result;
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera access is required to take photos.');
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
      setMediaUri(result.assets[0].uri);
      setMediaType(result.assets[0].type === 'video' ? 'video' : 'photo');
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
          <Image source={{ uri: mediaUri }} style={styles.preview} resizeMode="cover" />
          <TouchableOpacity
            style={[styles.changeButton, { backgroundColor: colors.surface }]}
            onPress={() => setMediaUri(null)}
          >
            <Ionicons name="refresh-outline" size={20} color={colors.textPrimary} />
            <Text style={[styles.changeText, { color: colors.textPrimary }]}>Change</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.pickerContainer}>
          <TouchableOpacity
            style={[styles.pickerButton, { backgroundColor: colors.surface }]}
            onPress={() => pickMedia('library')}
          >
            <Ionicons name="images-outline" size={40} color={colors.gold} />
            <Text style={[styles.pickerLabel, { color: colors.textPrimary }]}>Photo Library</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.pickerButton, { backgroundColor: colors.surface }]}
            onPress={() => pickMedia('camera')}
          >
            <Ionicons name="camera-outline" size={40} color={colors.gold} />
            <Text style={[styles.pickerLabel, { color: colors.textPrimary }]}>Take Photo</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Caption */}
      {mediaUri && (
        <View style={styles.captionContainer}>
          <TextInput
            style={[styles.captionInput, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
            placeholder="Write a caption..."
            placeholderTextColor={colors.textMuted}
            value={caption}
            onChangeText={setCaption}
            multiline
            maxLength={500}
          />
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: { ...typography.cardTitle, fontSize: 18 },
  postButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    minWidth: 70,
    alignItems: 'center',
  },
  postButtonText: { ...typography.button, fontSize: 14 },
  previewContainer: { position: 'relative' },
  preview: { width: '100%', aspectRatio: 1 },
  changeButton: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  changeText: { ...typography.label, fontSize: 11 },
  pickerContainer: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxl,
  },
  pickerButton: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  pickerLabel: { ...typography.label, fontSize: 11 },
  captionContainer: { paddingHorizontal: spacing.lg, marginTop: spacing.md },
  captionInput: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
    borderWidth: 1,
  },
});
