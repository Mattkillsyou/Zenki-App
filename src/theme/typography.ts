import { TextStyle } from 'react-native';

// Premium type scale — clear hierarchy with weight AND size contrast
// No uppercase on headings (reduces readability), only on labels/badges
export const typography: Record<string, TextStyle> = {
  // Display — hero moments, onboarding
  heroTitle: {
    fontSize: 34,
    fontWeight: '700',
    lineHeight: 40,
    letterSpacing: -0.5,
  },

  // Page title — top-level screen headings (Schedule, Store, Profile, etc.)
  pageTitle: {
    fontSize: 30,
    fontWeight: '700',
    lineHeight: 36,
    letterSpacing: -0.5,
  },

  // Section title — in-page section headings
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
    letterSpacing: -0.3,
  },

  // Card title — card headers, list item titles
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 24,
    letterSpacing: -0.1,
  },

  // Subheading — supporting headings
  subheading: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
  },

  // Body — default reading text
  body: {
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 24,
  },

  // Body small — secondary content
  bodySmall: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 20,
  },

  // Caption — timestamps, metadata
  caption: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
    letterSpacing: 0.2,
  },

  // Label — form labels, section markers
  label: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 16,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },

  // Button text
  button: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    letterSpacing: 0.2,
  },
};
