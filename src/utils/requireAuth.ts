import { Alert } from 'react-native';

/**
 * Account-action gate. Returns true if the user may proceed (signed in).
 * For guests (user == null) it shows a prompt that routes to the sign-in
 * screen and returns false so the caller aborts the account action.
 * Browsing is never gated — only call this on checkout / book / post / DM.
 *
 * Added for App Store Review 5.1.1(v): guests may browse the Store and
 * private-class booking without an account; only the account-based action
 * (checkout, booking, posting, messaging) requires sign-in.
 */
export function requireAuth<T>(
  user: T,
  navigation: any,
  action = 'continue',
): user is NonNullable<T> {
  if (user) return true;
  Alert.alert(
    'Sign in to continue',
    `Create a free account or sign in to ${action}. You can keep browsing without one.`,
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Sign In', onPress: () => navigation.navigate('SignIn') },
    ],
  );
  return false;
}
