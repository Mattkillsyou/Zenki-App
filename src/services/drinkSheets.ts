import { DrinkEntry } from '../types/drinks';
import { DRINK_DEFINITIONS } from '../data/drinks';

// Google Apps Script URL for the Drinks spreadsheet
// After deploying the Apps Script, paste the URL here
const DRINKS_SHEET_URL = '';

export async function pushDrinkEntry(entry: DrinkEntry, memberName: string): Promise<boolean> {
  const def = DRINK_DEFINITIONS.find((d) => d.type === entry.type);
  const payload = {
    memberName,
    date: entry.date,
    time: new Date(entry.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
    drink: def?.label || entry.type,
    price: entry.price.toFixed(2),
    month: entry.date.slice(0, 7),
  };

  if (!DRINKS_SHEET_URL) {
    console.log('[DrinkSheets] No URL configured — entry logged locally:', payload);
    return true;
  }

  try {
    const response = await fetch(DRINKS_SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return response.ok;
  } catch (error) {
    console.error('[DrinkSheets] Sync failed:', error);
    return false;
  }
}
