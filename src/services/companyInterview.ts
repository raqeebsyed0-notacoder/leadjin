/**
 * companyInterview.ts -- interview state machine and card builder (F2).
 *
 * Turns a website, a CR number, or five answers into an editable company card
 * with a source flag per field.
 *
 * Contracts:
 * - nextQuestion(state) returns ONE question per call; on questions that
 *   carry choices the choices property comes first. One question at a time.
 * - The five questions are sector, city, size, what they sell (sells), who
 *   they sell to (sells_to).
 * - no website is a first-class answer: accepted verbatim, never an error,
 *   and produces website: null.
 * - buildCard(answers, sources) returns { company, cr, website, sector,
 *   city, size, sells, sells_to, field_sources }; every field carries a
 *   source tag and an inferred field is never labelled stated.
 * - validateCard(card) refuses a card whose field_sources has a field
 *   without a source.
 *
 * No network calls -- pure state machine and record assembly.
 */
export type SourceTag = 'stated' | 'website' | 'cr' | 'inferred';

/** The five interview questions, in the order they are asked. */
export type QuestionId =
  | 'sector'
  | 'city'
  | 'size'
  | 'sells'
  | 'sells_to'
  | 'website'
  | 'cr';

/** A multiple-choice option. Order = presentation order; the first is the default. */
export interface Choice {
  label: string;
  value: string;
}

/**
 * A single interview question.
 * choices is the first property on purpose: multiple choice options come
 * before the rest of the question payload (secondary spacing in the UI).
 */
export interface Question {
  choices: Choice[];
  id: QuestionId;
  label: string;
  hint?: string;
}

/**
 * The complete set of answers the card carries. The five question fields are
 * the interview; company / cr / website are the input fields.
 */
export interface InterviewAnswers {
  company: string | null;
  cr: string | null;
  website: string | null;
  sector: string | null;
  city: string | null;
  size: string | null;
  sells: string | null;
  sells_to: string | null;
}

/**
 * The source tag a field carries, from the contract:
 * stated (the user supplied it), website (from the site), cr (from the
 * CR number), inferred (derived, never labelled stated).
 */
export interface SourceMap {
  company: SourceTag;
  cr: SourceTag;
  website: SourceTag;
  sector: SourceTag;
  city: SourceTag;
  size: SourceTag;
  sells: SourceTag;
  sells_to: SourceTag;
}

/**
 * The completed company card: every field plus a source tag for every field.
 * field_sources is what makes a field auditable -- an inferred field is
 * never labelled stated.
 */
export interface CompanyCard {
  company: string | null;
  cr: string | null;
  website: string | null;
  sector: string | null;
  city: string | null;
  size: string | null;
  sells: string | null;
  sells_to: string | null;
  field_sources: SourceMap;
}

/** Every card field that must carry a source tag. */
export type FieldKey =
  | 'company'
  | 'cr'
  | 'website'
  | QuestionId;

export type NextQuestion =
  | { done: false; question: Question }
  | { done: true; card: CompanyCard };

/**
 * The mutable interview state. current is the question the machine is on;
 * null means no more questions in this path (the card is finished).
 */
export interface InterviewState {
  mode: 'website' | 'cr' | 'answers';
  company: string | null;
  cr: string | null;
  website: string | null; // the URL, or the literal no website -> null
  answers: InterviewAnswers;
  sources: SourceMap;
  current: QuestionId | null;
}

/** Options used to create a fresh interview state. */
export interface InterviewOptions {
  mode: 'website' | 'cr' | 'answers';
  /** Website URL, or the literal no website. */
  website?: string | null;
  cr?: string | null;
  company?: string | null;
}

/**
 * The questions of the interview, in the order they are asked.
 * Multiple-choice options come first (the choices property is declared
 * before id so it stays first in the returned object).
 */
export const QUESTIONS: Record<QuestionId, Question> = {
  sector: {
    choices: [
      { label: 'Technology', value: 'technology' },
      { label: 'Finance and banking', value: 'finance' },
      { label: 'Retail and commerce', value: 'retail' },
      { label: 'Manufacturing', value: 'manufacturing' },
      { label: 'Healthcare', value: 'healthcare' },
      { label: 'Energy and utilities', value: 'energy' },
      { label: 'Tourism and hospitality', value: 'tourism' },
      { label: 'Construction', value: 'construction' },
      { label: 'Education', value: 'education' },
      { label: 'Other', value: 'other' },
    ],
    id: 'sector',
    label: 'Which sector does the company operate in?',
  },
  city: {
    choices: [
      { label: 'Riyadh', value: 'riyadh' },
      { label: 'Makkah', value: 'makkah' },
      { label: 'Madinah', value: 'madinah' },
      { label: 'Dammam', value: 'dammam' },
      { label: 'Jeddah', value: 'jeddah' },
      { label: 'Other', value: 'other' },
    ],
    id: 'city',
    label: 'In which city is the company registered?',
  },
  size: {
    choices: [
      { label: '1 to 10', value: '1-10' },
      { label: '11 to 50', value: '11-50' },
      { label: '51 to 200', value: '51-200' },
      { label: '201 to 500', value: '201-500' },
      { label: '501 to 1000', value: '501-1000' },
      { label: 'More than 1000', value: '1000+' },
    ],
    id: 'size',
    label: 'How many employees does the company have?',
  },
  sells: {
    choices: [
      { label: 'Consumers (B2C)', value: 'b2c' },
      { label: 'Businesses (B2B)', value: 'b2b' },
      { label: 'Government and public sector', value: 'b2g' },
      { label: 'Other organisations', value: 'other' },
    ],
    id: 'sells',
    label: 'What do they sell?',
  },
  sells_to: {
    choices: [
      { label: 'Consumers (B2C)', value: 'b2c' },
      { label: 'Businesses (B2B)', value: 'b2b' },
      { label: 'Other companies', value: 'b2b' },
      { label: 'Government', value: 'b2g' },
      { label: 'Retail end users', value: 'retail' },
      { label: 'Other', value: 'other' },
    ],
    id: 'sells_to',
    label: 'Who do they sell to?',
  },
  website: {
    choices: [],
    id: 'website',
    label: "What is the company's website?",
    hint: 'Type the full URL, or choose "no website" if the company has none.',
  },
  cr: {
    choices: [],
    id: 'cr',
    label: "What is the company's CR number?",
    hint: 'The commercial register (CR) number on the company\'s licence.',
  },
};

/** Question order for the five-question path. */
export const QUESTION_ORDER: readonly QuestionId[] = [
  'sector',
  'city',
  'size',
  'sells',
  'sells_to',
];

/** The source-input questions: a website URL (or "no website"), then a CR number. */

/** The first question of the website-input path: does the company have a website? */
export const WEBSITE_QUESTION: Question = {
  choices: [],
  id: 'website',
  label: "What is the company's website?",
  hint: 'Type the full URL, or choose "no website" if the company has none.',
};

/** The first question of the CR-input path: what is the company's CR number? */
export const CR_QUESTION: Question = {
  choices: [],
  id: 'cr',
  label: "What is the company's CR number?",
  hint: 'The commercial register (CR) number on the company\'s licence.',
};

/**
 * Fresh interview state for the chosen input mode.
 * no website is stored as website: null at the source level.
 */
export function createInterview(options: InterviewOptions): InterviewState {
  const website: string | null =
    options.website === 'no website' ? null : options.website ?? null;

  return {
    mode: options.mode,
    company: options.company ?? null,
    cr: options.cr ?? null,
    website,
    answers: {
      company: options.company ?? null,
      cr: options.cr ?? null,
      website,
      sector: null,
      city: null,
      size: null,
      sells: null,
      sells_to: null,
    },
    sources: {
      company: options.company ? 'stated' : 'inferred',
      cr: options.cr ? 'cr' : 'inferred',
      website: options.website ? 'website' : 'stated',
      sector: 'stated',
      city: 'stated',
      size: 'stated',
      sells: 'stated',
      sells_to: 'stated',
    },
    current: null,
  };
}

/**
 * One question per call. Returns the finished card when the path is complete.
 * A no website answer is never an error; it simply records website: null.
 */
export function nextQuestion(state: InterviewState): NextQuestion {
  switch (state.mode) {
    case 'answers': {
      if (state.current === null && questionsDone(state)) {
        return { done: true, card: buildCard(state.answers, state.sources) };
      }
      if (state.current === null) {
        state.current = QUESTION_ORDER[0];
      }
      return { done: false, question: QUESTIONS[state.current] };
    }
    case 'website': {
      // The website path ends once the user has answered the website question.
      if (state.current === 'website') {
        return { done: true, card: buildCard(state.answers, state.sources) };
      }
      return { done: false, question: WEBSITE_QUESTION };
    }
    case 'cr': {
      // The CR path ends once the user has answered the CR question.
      if (state.current === 'cr') {
        return { done: true, card: buildCard(state.answers, state.sources) };
      }
      return { done: false, question: CR_QUESTION };
    }
  }
}

/**
 * Records an answer and advances the machine to the next question.
 * field is one of the five interview questions, or website or cr.
 */
export function answer(
  state: InterviewState,
  field: QuestionId | 'website' | 'cr',
  value: string,
  source: SourceTag,
): void {
  if (field === 'website') {
    state.website = value === 'no website' ? null : value;
    state.answers.website = state.website;
    state.current = 'website';
  } else if (field === 'cr') {
    state.cr = value;
    state.answers.cr = value;
    state.current = 'cr';
  } else {
    state.answers[field] = value;
    state.sources[field] = source;
    // Advance to the next interview question (or finish the path).
    const index = QUESTION_ORDER.indexOf(field);
    state.current = index === QUESTION_ORDER.length - 1 ? null : QUESTION_ORDER[index + 1];
  }
}

/**
 * Builds the card from the collected answers and their source tags.
 * field_sources is the source tag per field; no field is left without one.
 */
export function buildCard(
  answers: InterviewAnswers,
  sources: SourceMap,
): CompanyCard {
  return {
    company: answers.company,
    cr: answers.cr,
    website: answers.website,
    sector: answers.sector,
    city: answers.city,
    size: answers.size,
    sells: answers.sells,
    sells_to: answers.sells_to,
    field_sources: { ...sources },
  };
}

/**
 * Refuses a card whose field_sources has a field without a source.
 * Every card field must carry one of the four allowed tags.
 */
export function validateCard(card: CompanyCard): boolean {
  const required: FieldKey[] = [
    'company',
    'cr',
    'website',
    'sector',
    'city',
    'size',
    'sells',
    'sells_to',
  ];
  return required.every((field) => typeof card.field_sources[field] === 'string');
}

// --- internal helpers ---------------------------------------------------

function questionsDone(state: InterviewState): boolean {
  const answers = state.answers;
  return (
    answers.sector !== null &&
    answers.city !== null &&
    answers.size !== null &&
    answers.sells !== null &&
    answers.sells_to !== null
  );
}
