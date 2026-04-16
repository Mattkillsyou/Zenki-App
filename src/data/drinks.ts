import { DrinkDefinition } from '../types/drinks';

export const DRINK_DEFINITIONS: DrinkDefinition[] = [
  { type: 'water', label: 'Water', icon: 'water-outline', color: '#2196F3', price: 2.00 },
  { type: 'protein', label: 'Protein Shake', icon: 'nutrition-outline', color: '#E8B828', price: 5.00 },
  { type: 'electrolytes', label: 'Electrolytes', icon: 'flash-outline', color: '#4CAF50', price: 3.00 },
  { type: 'bcaa', label: 'BCAA', icon: 'beaker-outline', color: '#9C27B0', price: 4.00 },
  { type: 'coffee', label: 'Coffee', icon: 'cafe-outline', color: '#795548', price: 3.00 },
  { type: 'energy', label: 'Energy Drink', icon: 'battery-charging-outline', color: '#FF5722', price: 4.00 },
  { type: 'kombucha', label: 'Kombucha', icon: 'leaf-outline', color: '#00897B', price: 4.50 },
  { type: 'juice', label: 'Cold-Pressed Juice', icon: 'wine-outline', color: '#FF9800', price: 5.50 },
  { type: 'tea', label: 'Matcha Tea', icon: 'cafe', color: '#689F38', price: 3.50 },
];
