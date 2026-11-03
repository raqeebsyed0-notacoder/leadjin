/**
 * Arabic Name Transliteration Engine
 *
 * Generates email permutations from Arabic names for the Saudi market.
 * Handles common transliteration variants, honorific stripping, and
 * compound-name decomposition (Al-, Abu, Bin, Ibn prefixes).
 *
 * Pure TypeScript — no external dependencies.
 */

// ---------------------------------------------------------------------------
// Common Arabic → English transliteration variants
// ---------------------------------------------------------------------------

export const COMMON_TRANSLITERATIONS: Record<string, string[]> = {
  // Prophet's name variants (most common in KSA)
  mohammed: ['mohammed', 'muhammad', 'mohamed', 'mohamad', 'mohammad'],
  ahmed: ['ahmed', 'ahmad'],
  abdulaziz: ['abdulaziz', 'abdul-aziz', 'abd-alaziz', 'abdulazez'],
  abdullah: ['abdullah', 'abdallah', 'abd-allah'],
  abdulrahman: ['abdulrahman', 'abdul-rahman', 'abdulrehman', 'abdelrahman'],
  abdulmajeed: ['abdulmajeed', 'abdulmajid', 'abdul-majeed'],
  abdulmalik: ['abdulmalik', 'abdul-malik', 'abdelmalek'],
  abdulkarim: ['abdulkarim', 'abdul-karim', 'abdelkarim'],
  abdullatif: ['abdullatif', 'abdul-latif', 'abdellatif'],
  khalid: ['khalid', 'khaled'],
  saleh: ['saleh', 'salih', 'salah'],
  salman: ['salman', 'salmaan'],
  faisal: ['faisal', 'faysal', 'feisal'],
  turki: ['turki', 'turkey'],
  saud: ['saud', 'saoud'],
  nasser: ['nasser', 'nasir', 'nasr'],
  fahd: ['fahd', 'fahad', 'fahed'],
  sultan: ['sultan', 'soltan'],
  omar: ['omar', 'umar'],
  othman: ['othman', 'osman', 'uthman'],
  ibrahim: ['ibrahim', 'ebrahim'],
  youssef: ['youssef', 'yousef', 'yusuf', 'yosef', 'yusef'],
  hassan: ['hassan', 'hasan'],
  hussein: ['hussein', 'husain', 'hussain'],
  ali: ['ali', 'aly'],
  waleed: ['waleed', 'walid'],
  rashed: ['rashed', 'rashid', 'rasheed'],
  saeed: ['saeed', 'said', 'saeid'],
  hamad: ['hamad', 'hammad'],
  badr: ['badr', 'bader'],
  tariq: ['tariq', 'tarek', 'tareq'],
  majed: ['majed', 'majid', 'majeed'],
  bandar: ['bandar', 'bander'],
  ziad: ['ziad', 'ziyad', 'zyad'],
  hani: ['hani', 'hany'],
  rami: ['rami', 'ramy'],
  nora: ['nora', 'noura', 'norah', 'nourah'],
  fatima: ['fatima', 'fatimah', 'fatma'],
  aisha: ['aisha', 'aysha', 'aishah'],
  sara: ['sara', 'sarah'],
  layla: ['layla', 'laila', 'leila'],
  maha: ['maha', 'mahaa'],
  haya: ['haya', 'hayaa'],
  reem: ['reem', 'rim', 'reema'],
  dalal: ['dalal', 'dallal'],
  mona: ['mona', 'mouna', 'muna'],
};

// ---------------------------------------------------------------------------
// Honorifics to strip (Arabic & English)
// ---------------------------------------------------------------------------

const HONORIFICS = /^(dr\.?|eng\.?|engr\.?|sh\.?|sheikh\.?|mr\.?|mrs\.?|ms\.?|prof\.?|hh\.?|hrh\.?|prince\.?|princess\.?|م\.?|د\.?|المهندس\.?|الشيخ\.?)\s+/i;

// ---------------------------------------------------------------------------
// Arabic prefix detection
// ---------------------------------------------------------------------------

const ARABIC_PREFIXES = ['al-', 'al ', 'el-', 'el '];
const PATRONYMIC_PREFIXES = ['bin', 'ibn', 'abu', 'bint', 'um', 'umm'];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Lowercases and strips diacritics / non-ASCII decoration */
function sanitize(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritics
    .replace(/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g, '') // strip Arabic script
    .replace(/[''`]/g, '') // strip apostrophes
    .trim();
}

/** Remove honorific prefix from a name string */
function stripHonorifics(name: string): string {
  return name.replace(HONORIFICS, '').trim();
}

/** Check whether a token is a patronymic prefix */
function isPatronymicPrefix(token: string): boolean {
  return PATRONYMIC_PREFIXES.includes(token.toLowerCase());
}

/** Check whether a token starts with Al-/El- */
function isAlPrefix(token: string): boolean {
  const lower = token.toLowerCase();
  return ARABIC_PREFIXES.some((p) => lower.startsWith(p));
}

/** Strip the "al-" / "el-" from a token, returning the root */
function stripAlPrefix(token: string): string {
  const lower = token.toLowerCase();
  for (const p of ARABIC_PREFIXES) {
    if (lower.startsWith(p)) {
      return lower.slice(p.length);
    }
  }
  return lower;
}

/** Return all known transliteration variants for a name token */
function getVariants(token: string): string[] {
  const lower = token.toLowerCase();
  for (const [_key, variants] of Object.entries(COMMON_TRANSLITERATIONS)) {
    if (variants.includes(lower)) {
      return variants;
    }
  }
  return [lower];
}

/** Deduplicate while preserving order */
function unique(arr: string[]): string[] {
  const seen = new Set<string>();
  return arr.filter((v) => {
    if (seen.has(v)) return false;
    seen.add(v);
    return true;
  });
}

// ---------------------------------------------------------------------------
// normalizeArabicName
// ---------------------------------------------------------------------------

export interface NormalizedName {
  firstName: string;
  lastName: string;
  /** All lower-case "first.last"-style slug variants */
  variants: string[];
}

/**
 * Parses an Arabic full name into first/last and generates transliteration
 * slug variants suitable for email local-part construction.
 */
export function normalizeArabicName(name: string): NormalizedName {
  const cleaned = sanitize(stripHonorifics(name));
  const tokens = cleaned.split(/[\s-]+/).filter(Boolean);

  if (tokens.length === 0) {
    return { firstName: '', lastName: '', variants: [] };
  }

  if (tokens.length === 1) {
    const firstVariants = getVariants(tokens[0]);
    return {
      firstName: tokens[0],
      lastName: '',
      variants: unique(firstVariants),
    };
  }

  // -----------------------------------------------------------------------
  // Split into firstName tokens and lastName tokens
  // -----------------------------------------------------------------------
  let firstTokens: string[] = [tokens[0]];
  let lastTokens: string[] = [];
  let i = 1;

  // Absorb patronymic chains: "Mohammed Bin Salman Bin Abdulaziz"
  while (i < tokens.length - 1 && isPatronymicPrefix(tokens[i])) {
    // Skip the prefix token; the next token is part of the last-name chain
    i++;
    if (i < tokens.length) {
      lastTokens.push(tokens[i]);
      i++;
    }
  }

  // Remaining tokens go to last name
  while (i < tokens.length) {
    lastTokens.push(tokens[i]);
    i++;
  }

  // If we only got patronymic-linked tokens and nothing else, treat last
  // collected token as last name
  if (lastTokens.length === 0 && tokens.length >= 2) {
    lastTokens = [tokens[tokens.length - 1]];
  }

  const firstName = firstTokens[0];
  // For last name, reconstruct compound: "al-rashid" stays together
  const lastName = lastTokens.join('');

  // -----------------------------------------------------------------------
  // Generate slug variants
  // -----------------------------------------------------------------------
  const firstVariants = getVariants(firstName);
  const lastRaw = lastTokens.join('');
  const lastStripped = lastTokens.map(stripAlPrefix).join('');
  const lastWithAl = lastTokens
    .map((t) => (isAlPrefix(t) ? t.replace(/[\s-]/g, '') : t))
    .join('');

  // Build unique last-name forms
  const lastForms = unique([lastRaw, lastWithAl, lastStripped].filter(Boolean));

  // Build unique last-name variant lists (transliteration expansion)
  const expandedLastForms: string[] = [];
  for (const lf of lastForms) {
    expandedLastForms.push(...getVariants(lf));
  }
  const allLastForms = unique([...lastForms, ...expandedLastForms]);

  // Combine
  const slugs: string[] = [];
  for (const fv of firstVariants) {
    for (const lv of allLastForms) {
      slugs.push(`${fv}.${lv}`);
    }
    // Initial-based
    if (allLastForms.length > 0) {
      for (const lv of allLastForms) {
        slugs.push(`${fv[0]}.${lv}`);
        slugs.push(`${fv[0]}${lv}`);
      }
    }
  }

  // Also add "al-" hyphenated forms explicitly
  if (lastTokens.some(isAlPrefix)) {
    for (const fv of firstVariants) {
      const hyphenated = lastTokens.join('-').replace(/\s/g, '');
      slugs.push(`${fv}.${hyphenated}`);
    }
  }

  return {
    firstName,
    lastName,
    variants: unique(slugs),
  };
}

// ---------------------------------------------------------------------------
// Email pattern templates (priority order for KSA corporate)
// ---------------------------------------------------------------------------

type PatternFn = (first: string, last: string, domain: string) => string;

const EMAIL_PATTERNS: PatternFn[] = [
  // 1. first.last@domain  — most common in KSA corporate
  (f, l, d) => `${f}.${l}@${d}`,
  // 2. flast@domain
  (f, l, d) => `${f[0]}${l}@${d}`,
  // 3. first@domain
  (f, _l, d) => `${f}@${d}`,
  // 4. firstl@domain
  (f, l, d) => `${f}${l[0]}@${d}`,
  // 5. first_last@domain
  (f, l, d) => `${f}_${l}@${d}`,
  // 6. f.last@domain
  (f, l, d) => `${f[0]}.${l}@${d}`,
  // 7. last.first@domain  — some Saudi companies
  (f, l, d) => `${l}.${f}@${d}`,
];

// ---------------------------------------------------------------------------
// generateEmailPermutations
// ---------------------------------------------------------------------------

/**
 * Generates ranked email permutations for a person at a given domain.
 *
 * The first 5-7 entries are the highest-confidence guesses (primary
 * transliteration + top patterns). Remaining entries cover variant
 * spellings crossed with all patterns.
 *
 * @param fullName  Person's full name (Arabic or already transliterated)
 * @param domain    Company email domain (e.g. "aramco.com")
 * @returns         Deduplicated list of email addresses, most likely first
 */
export function generateEmailPermutations(
  fullName: string,
  domain: string,
): string[] {
  const normalizedDomain = domain.toLowerCase().replace(/^@/, '').trim();
  const { firstName, lastName, variants } = normalizeArabicName(fullName);

  if (!firstName) return [];

  // If there's no last name, only generate first-name patterns
  if (!lastName) {
    const firstVariants = getVariants(firstName);
    const emails: string[] = [];
    for (const fv of firstVariants) {
      emails.push(`${fv}@${normalizedDomain}`);
    }
    return unique(emails);
  }

  // ----- Fast path: primary spelling, all patterns -----
  const fastPath: string[] = [];
  const primaryFirst = firstName;
  const primaryLast = lastName;

  for (const pattern of EMAIL_PATTERNS) {
    try {
      fastPath.push(pattern(primaryFirst, primaryLast, normalizedDomain));
    } catch {
      // Pattern might fail if first/last is too short — skip gracefully
    }
  }

  // Also add with stripped "al-" for the primary spelling
  const strippedLast = stripAlPrefix(primaryLast);
  if (strippedLast !== primaryLast) {
    for (const pattern of EMAIL_PATTERNS) {
      try {
        fastPath.push(pattern(primaryFirst, strippedLast, normalizedDomain));
      } catch {
        // skip
      }
    }
  }

  // ----- Slow path: variant spellings × all patterns -----
  const slowPath: string[] = [];
  const firstVariants = getVariants(firstName);
  const lastVariants = unique([
    primaryLast,
    strippedLast,
    ...getVariants(primaryLast),
    ...getVariants(strippedLast),
  ]);

  for (const fv of firstVariants) {
    for (const lv of lastVariants) {
      for (const pattern of EMAIL_PATTERNS) {
        try {
          slowPath.push(pattern(fv, lv, normalizedDomain));
        } catch {
          // skip
        }
      }
    }
  }

  // Merge: fast path first, then remaining slow-path entries
  return unique([...fastPath, ...slowPath]);
}
