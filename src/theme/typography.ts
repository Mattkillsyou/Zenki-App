import { TextStyle } from 'react-native';

// Premium type scale — clear hierarchy with weight AND size contrast
// Centered by default across the app; specific rows (label/value) override
// with textAlign: 'left' where needed.
export const typography: Record<string, TextStyle> = {
  // Display — hero moments, onboarding
  heroTitle: {
    fontSize: 34,
    fontWeight: '700',
    lineHeight: 40,
    letterSpacing: -0.5,
    textAlign: 'center',
  },

  // Page title — top-level screen headings (Schedule, Store, Profile, etc.)
  pageTitle: {
    fontSize: 30,
    fontWeight: '700',
    lineHeight: 36,
    letterSpacing: -0.5,
    textAlign: 'center',
  },

  // Section title — in-page section headings
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
    letterSpacing: -0.3,
    textAlign: 'center',
  },

  // Card title — card headers, list item titles
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 24,
    letterSpacing: -0.1,
    textAlign: 'center',
  },

  // Subheading — supporting headings
  subheading: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
    textAlign: 'center',
  },

  // Body — default reading text
  body: {
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 24,
    textAlign: 'center',
  },

  // Body small — secondary content
  bodySmall: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 20,
    textAlign: 'center',
  },

  // Caption — timestamps, metadata
  caption: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
    letterSpacing: 0.2,
    textAlign: 'center',
  },

  // Label — form labels, section markers
  label: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 16,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    textAlign: 'center',
  },

  // Button text
  button: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
};
