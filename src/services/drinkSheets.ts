import { DrinkEntry } from '../types/drinks';
import { DRINK_DEFINITIONS } from '../data/drinks';

// Google Apps Script URL for the Drinks spreadsheet
// Apps Script handler should support `action: 'append' | 'markPaid'`.
const DRINKS_SHEET_URL = '';

export async function pushDrinkEntry(entry: DrinkEntry, memberName: string): Promise<boolean> {
  const def = DRINK_DEFINITIONS.find((d) => d.type === entry.type);
  const payload = {
    action: 'append' as const,
    entryId: entry.id,
    memberName,
    date: entry.date,
    time: new Date(entry.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
    drink: def?.label || entry.type,
    price: entry.price.toFixed(2),
    status: entry.paid ? 'PAID' : 'UNPAID',
    paidAt: entry.paidAt || '',
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

/**
 * Mark a batch of previously-logged drink entries as PAID in the sheet.
 * Apps Script should look up rows by entryId and update status + paidAt.
 */
export async function markDrinksPaid(entryIds: string[], memberName: string, paidAt: string): Promise<boolean> {
  const payload = {
    action: 'markPaid' as const,
    entryIds,
    memberName,
    paidAt,
  };

  if (!DRINKS_SHEET_URL) {
    console.log('[DrinkSheets] No URL configured — markPaid logged locally:', payload);
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
    console.error('[DrinkSheets] markPaid failed:', error);
    return false;
  }
}
