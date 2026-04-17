/**
 * Environment configuration — reads from Expo constants or falls back to defaults.
 * Sensitive values should be set in app.config.js extra field or EAS secrets.
 */

import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};

/** Google OAuth Client ID for calendar integration */
export const GOOGLE_CLIENT_ID: string =
  extra.GOOGLE_CLIENT_ID || process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '';

/** Google Apps Script URL for Sheets integration */
export const GOOGLE_SHEETS_SCRIPT_URL: string =
  extra.GOOGLE_SHEETS_SCRIPT_URL || process.env.EXPO_PUBLIC_SHEETS_URL || '';

/** USDA FoodData Central API key */
export const USDA_API_KEY: string =
  extra.USDA_API_KEY || process.env.EXPO_PUBLIC_USDA_API_KEY || '';
