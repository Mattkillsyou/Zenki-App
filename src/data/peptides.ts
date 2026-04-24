/**
 * Local database of common peptides, GLP-1s, and research compounds.
 * Used by drugSearch.ts to provide instant matches before RxNorm fallback.
 *
 * NOT medical advice — this is a reference list with default route/unit only.
 * Doses are user-supplied.
 */

import { DrugSearchResult, MedicationCategory } from '../types/medication';

interface PeptideRecord extends DrugSearchResult {
  /** Optional aliases for fuzzy matching */
  aliases?: string[];
  /** Brief description for display */
  description?: string;
}

export const PEPTIDE_DATABASE: PeptideRecord[] = [
  // ─── Healing & recovery peptides ───
  {
    externalId: 'pep_bpc157',
    name: 'BPC-157',
    category: 'peptide',
    defaultRoute: 'subcutaneous',
    defaultDoseUnit: 'mcg',
    aliases: ['Body Protection Compound', 'PL 14736'],
    description: 'Pentadecapeptide for tissue repair and gut health',
  },
  {
    externalId: 'pep_tb500',
    name: 'TB-500',
    category: 'peptide',
    defaultRoute: 'subcutaneous',
    defaultDoseUnit: 'mg',
    aliases: ['Thymosin Beta-4', 'TB4'],
    description: 'Synthetic fragment of thymosin beta-4 for healing',
  },
  {
    externalId: 'pep_ghkcu',
    name: 'GHK-Cu',
    category: 'peptide',
    defaultRoute: 'subcutaneous',
    defaultDoseUnit: 'mg',
    aliases: ['Copper Peptide', 'GHK Copper'],
    description: 'Skin and tissue regeneration peptide',
  },

  // ─── Growth hormone secretagogues ───
  {
    externalId: 'pep_ipamorelin',
    name: 'Ipamorelin',
    category: 'peptide',
    defaultRoute: 'subcutaneous',
    defaultDoseUnit: 'mcg',
    description: 'Selective GH secretagogue',
  },
  {
    externalId: 'pep_cjc1295',
    name: 'CJC-1295',
    category: 'peptide',
    defaultRoute: 'subcutaneous',
    defaultDoseUnit: 'mcg',
    aliases: ['CJC-1295 No DAC', 'CJC-1295 DAC', 'Modified GRF'],
    description: 'GHRH analog, often paired with Ipamorelin',
  },
  {
    externalId: 'pep_sermorelin',
    name: 'Sermorelin',
    category: 'peptide',
    defaultRoute: 'subcutaneous',
    defaultDoseUnit: 'mcg',
    description: 'GHRH 1-29, stimulates pituitary GH release',
  },
  {
    externalId: 'pep_tesamorelin',
    name: 'Tesamorelin',
    category: 'peptide',
    defaultRoute: 'subcutaneous',
    defaultDoseUnit: 'mg',
    aliases: ['Egrifta'],
    description: 'GHRH analog for visceral fat reduction',
  },
  {
    externalId: 'pep_hexarelin',
    name: 'Hexarelin',
    category: 'peptide',
    defaultRoute: 'subcutaneous',
    defaultDoseUnit: 'mcg',
    description: 'Potent GH secretagogue',
  },
  {
    externalId: 'pep_ghrp2',
    name: 'GHRP-2',
    category: 'peptide',
    defaultRoute: 'subcutaneous',
    defaultDoseUnit: 'mcg',
    description: 'Growth hormone-releasing peptide 2',
  },
  {
    externalId: 'pep_ghrp6',
    name: 'GHRP-6',
    category: 'peptide',
    defaultRoute: 'subcutaneous',
    defaultDoseUnit: 'mcg',
    description: 'Growth hormone-releasing peptide 6',
  },
  {
    externalId: 'pep_mk677',
    name: 'MK-677',
    category: 'peptide',
    defaultRoute: 'oral',
    defaultDoseUnit: 'mg',
    aliases: ['Ibutamoren', 'Nutrabol'],
    description: 'Oral GH secretagogue',
  },

  // ─── GLP-1 / metabolic peptides ───
  {
    externalId: 'pep_semaglutide',
    name: 'Semaglutide',
    category: 'peptide',
    defaultRoute: 'subcutaneous',
    defaultDoseUnit: 'mg',
    aliases: ['Ozempic', 'Wegovy', 'Rybelsus'],
    description: 'GLP-1 agonist for weight loss / T2D',
  },
  {
    externalId: 'pep_tirzepatide',
    name: 'Tirzepatide',
    category: 'peptide',
    defaultRoute: 'subcutaneous',
    defaultDoseUnit: 'mg',
    aliases: ['Mounjaro', 'Zepbound'],
    description: 'Dual GIP/GLP-1 agonist',
  },
  {
    externalId: 'pep_retatrutide',
    name: 'Retatrutide',
    category: 'peptide',
    defaultRoute: 'subcutaneous',
    defaultDoseUnit: 'mg',
    description: 'Triple GLP-1/GIP/glucagon agonist',
  },
  {
    externalId: 'pep_liraglutide',
    name: 'Liraglutide',
    category: 'peptide',
    defaultRoute: 'subcutaneous',
    defaultDoseUnit: 'mg',
    aliases: ['Saxenda', 'Victoza'],
    description: 'GLP-1 agonist',
  },
  {
    externalId: 'pep_aod9604',
    name: 'AOD-9604',
    category: 'peptide',
    defaultRoute: 'subcutaneous',
    defaultDoseUnit: 'mcg',
    description: 'Modified fragment of hGH for fat loss',
  },

  // ─── Sexual health / neuropeptides ───
  {
    externalId: 'pep_pt141',
    name: 'PT-141',
    category: 'peptide',
    defaultRoute: 'subcutaneous',
    defaultDoseUnit: 'mg',
    aliases: ['Bremelanotide', 'Vyleesi'],
    description: 'Melanocortin agonist for sexual function',
  },
  {
    externalId: 'pep_kisspeptin',
    name: 'Kisspeptin-10',
    category: 'peptide',
    defaultRoute: 'subcutaneous',
    defaultDoseUnit: 'mcg',
    description: 'Stimulates GnRH and LH release',
  },

  // ─── Cognitive / nootropic peptides ───
  {
    externalId: 'pep_selank',
    name: 'Selank',
    category: 'peptide',
    defaultRoute: 'intranasal',
    defaultDoseUnit: 'mg',
    description: 'Anxiolytic neuropeptide',
  },
  {
    externalId: 'pep_semax',
    name: 'Semax',
    category: 'peptide',
    defaultRoute: 'intranasal',
    defaultDoseUnit: 'mg',
    description: 'Nootropic ACTH fragment',
  },
  {
    externalId: 'pep_dsip',
    name: 'DSIP',
    category: 'peptide',
    defaultRoute: 'subcutaneous',
    defaultDoseUnit: 'mg',
    aliases: ['Delta Sleep Inducing Peptide'],
    description: 'Sleep-modulating peptide',
  },
  {
    externalId: 'pep_dihexa',
    name: 'Dihexa',
    category: 'peptide',
    defaultRoute: 'oral',
    defaultDoseUnit: 'mg',
    description: 'Angiotensin IV analog, BDNF mimetic',
  },
  {
    externalId: 'pep_cerebrolysin',
    name: 'Cerebrolysin',
    category: 'peptide',
    defaultRoute: 'intramuscular',
    defaultDoseUnit: 'ml',
    description: 'Neurotrophic peptide complex',
  },

  // ─── Immune / anti-inflammatory ───
  {
    externalId: 'pep_thymosinalpha1',
    name: 'Thymosin Alpha-1',
    category: 'peptide',
    defaultRoute: 'subcutaneous',
    defaultDoseUnit: 'mg',
    aliases: ['Tα1', 'Zadaxin'],
    description: 'Immunomodulatory peptide',
  },
  {
    externalId: 'pep_kpv',
    name: 'KPV',
    category: 'peptide',
    defaultRoute: 'subcutaneous',
    defaultDoseUnit: 'mg',
    description: 'Anti-inflammatory tripeptide',
  },
  {
    externalId: 'pep_lalanyl',
    name: 'L-Alanyl-L-Glutamine',
    category: 'peptide',
    defaultRoute: 'oral',
    defaultDoseUnit: 'g',
    aliases: ['Sustamine'],
    description: 'Stable glutamine dipeptide',
  },

  // ─── Cosmetic / hair ───
  {
    externalId: 'pep_melanotan2',
    name: 'Melanotan II',
    category: 'peptide',
    defaultRoute: 'subcutaneous',
    defaultDoseUnit: 'mg',
    aliases: ['MT-II'],
    description: 'Melanocortin agonist for tanning',
  },
];

/**
 * Search peptides by name (fuzzy substring match against name + aliases).
 */
export function searchPeptides(query: string): DrugSearchResult[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const matches: { record: PeptideRecord; score: number }[] = [];

  for (const p of PEPTIDE_DATABASE) {
    const nameLower = p.name.toLowerCase();
    let score = 0;

    if (nameLower === q) score = 100;
    else if (nameLower.startsWith(q)) score = 80;
    else if (nameLower.includes(q)) score = 60;

    for (const alias of p.aliases ?? []) {
      const aliasLower = alias.toLowerCase();
      if (aliasLower === q) score = Math.max(score, 90);
      else if (aliasLower.startsWith(q)) score = Math.max(score, 70);
      else if (aliasLower.includes(q)) score = Math.max(score, 50);
    }

    if (score > 0) matches.push({ record: p, score });
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.map((m) => ({
    externalId: m.record.externalId,
    name: m.record.name,
    brandName: m.record.aliases?.[0],
    category: m.record.category as MedicationCategory,
    defaultRoute: m.record.defaultRoute,
    defaultDoseUnit: m.record.defaultDoseUnit,
  }));
}
