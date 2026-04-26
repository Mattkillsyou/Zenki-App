import { Alert, Platform } from 'react-native';

/**
 * Cross-platform alert. React Native's Alert.alert is a no-op on web (RN-Web
 * leaves it unimplemented), which silently breaks any code that relies on it
 * for error feedback. This wrapper falls back to window.alert on web so users
 * see the same message regardless of platform.
 */
export function showAlert(title: string, message?: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(message ? `${title}\n\n${message}` : title);
    }
    return;
  }
  Alert.alert(title, message);
}

/**
 * Cross-platform yes/no confirmation. Resolves true if the user confirmed.
 * On web uses window.confirm; on native shows an Alert with two buttons.
 */
export function confirmAlert(
  title: string,
  message: string,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
): Promise<boolean> {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      return Promise.resolve(window.confirm(`${title}\n\n${message}`));
    }
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}
