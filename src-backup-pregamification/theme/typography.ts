import { TextStyle } from 'react-native';

export const typography: Record<string, TextStyle> = {
  heroTitle: {
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 1.5,
    lineHeight: 42,
    textTransform: 'uppercase',
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 1,
    lineHeight: 30,
    textTransform: 'uppercase',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
  },
  body: {
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 22,
  },
  bodySmall: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    lineHeight: 16,
    textTransform: 'uppercase',
  },
  button: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
    lineHeight: 20,
    textTransform: 'uppercase',
  },
};
