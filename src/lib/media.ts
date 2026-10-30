import * as ImagePicker from 'expo-image-picker';
import { Alert, Linking } from 'react-native';

/** Asks only when the user picks a source, and explains how to fix a denied permission. */
async function ensure(kind: 'library' | 'camera') {
  const perm = kind === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (perm.granted) return true;
  Alert.alert(
    kind === 'camera' ? 'Camera access is off' : 'Photo access is off',
    `Turn on ${kind === 'camera' ? 'camera' : 'photo'} access for Kinnoc in Settings to share images.`,
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Open Settings', onPress: () => void Linking.openSettings() },
    ],
  );
  return false;
}

/** One photo, cropped square in the system editor (profile photos). Returns its local URI, or null if cancelled. */
export async function pickSquareImage(source: 'library' | 'camera'): Promise<string | null> {
  if (!(await ensure(source))) return null;
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8, allowsEditing: true, aspect: [1, 1] };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  return result.canceled ? null : (result.assets[0]?.uri ?? null);
}

/** Returns local URIs of the chosen photos, or [] if cancelled. */
export async function pickImages(source: 'library' | 'camera', limit = 4): Promise<string[]> {
  if (!(await ensure(source))) return [];
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 0.8,
    allowsMultipleSelection: source === 'library' && limit > 1,
    selectionLimit: limit,
  };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return [];
  return result.assets.slice(0, limit).map((a) => a.uri);
}
