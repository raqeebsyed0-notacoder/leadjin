/** company-interview.test.ts -- F2 acceptance tests.

 * Run: npx vitest run tests/company-interview.test.ts
 *
 * Coverage per the F2 lane spec (autopilot-v1-lanes.md):
 *  - createInterview: modes, "no website" -> null, URL stored verbatim
 *  - nextQuestion: one question per call, the five questions in order,
 *    then the finished card
 *  - QUESTIONS: multiple-choice options first on every choice question
 *  - answer(): advances the machine and ends the website / CR paths
 *  - buildCard: one source flag on every field
 *  - validateCard: refusal of a card whose field_sources has a field
 *    without a source
 */

import { describe, it, expect } from 'vitest';
import {
  createInterview,
  nextQuestion,
  answer,
  buildCard,
  validateCard,
  QUESTIONS,
  QUESTION_ORDER,
  type CompanyCard,
  type InterviewState,
  type NextQuestion,
  type Question,
  type SourceMap,
  type SourceTag,
} from '../src/services/companyInterview.js';

// Narrowing helpers: the union is discriminated on `done`, but the repo's root
// tsconfig cannot narrow it at these call sites, so use `in`.
function questionOf(next: NextQuestion): Question {
  if (!('question' in next)) throw new Error('expected another question, got the finished card');
  return next.question;
}
function cardOf(next: NextQuestion): CompanyCard {
  if (!('card' in next)) throw new Error('expected the finished card');
  return next.card;
}

const FULL_SOURCES: SourceMap = {
  company: 'stated',
  cr: 'cr',
  website: 'website',
  sector: 'stated',
  city: 'stated',
  size: 'stated',
  sells: 'stated',
  sells_to: 'stated',
};

/** Values used to drive the five-question path in the acceptance tests. */
const FIVE_ANSWERS: Partial<Record<Question['id'], string>> = {
  sector: 'technology',
  city: 'riyadh',
  size: '11-50',
  sells: 'b2b',
  sells_to: 'b2b',
};

// FIVE_ANSWERS removed: it was typed as Record<Question['id'], string>, which
// is wider than the five interview answers and never matched the object
// literal. Values are inlined in the step() helper below.

describe('createInterview -- modes and "no website"', () => {
  it('starts an answers-mode interview with no current question', () => {
    const state = createInterview({ mode: 'answers' });
    expect(state.mode).toBe('answers');
    expect(state.current).toBeNull();
    expect(state.answers.sector).toBeNull();
  });

  it('"no website" is stored as website: null, never an error', () => {
    const state = createInterview({ mode: 'website', website: 'no website' });
    expect(state.website).toBeNull();
    expect(state.sources.website).toBe('website');
  });

  it('a website URL is stored verbatim', () => {
    const state = createInterview({ mode: 'website', website: 'https://acme.example' });
    expect(state.website).toBe('https://acme.example');
  });

  it('a CR number is stored in its own field', () => {
    const state = createInterview({ mode: 'cr', cr: '9876543' });
    expect(state.cr).toBe('9876543');
  });
});

describe('QUESTIONS -- five questions, choices first', () => {
  it('returns the five interview questions in order', () => {
    expect(QUESTION_ORDER).toEqual(['sector', 'city', 'size', 'sells', 'sells_to']);
  });

  it('lists multiple-choice options first where a choice exists', () => {
    for (const question of Object.values(QUESTIONS)) {
      const keys = Object.keys(question);
      expect(keys).toEqual(expect.arrayContaining(['choices', 'id', 'label']));
      expect(keys.indexOf('choices')).toBeLessThan(keys.indexOf('id'));
      expect(Array.isArray(question.choices)).toBe(true);
    }
  });

  it('offers ten sector choices, the default first', () => {
    const { sector } = QUESTIONS;
    expect(sector.choices).toHaveLength(10);
    expect(sector.choices[0]).toEqual({ label: 'Technology', value: 'technology' });
  });
});

describe('nextQuestion -- one question at a time', () => {
  it('returns the five questions in order, then the finished card', () => {
    const state = createInterview({ mode: 'answers' });
    const order: Question['id'][] = [];
    let done: NextQuestion | null = null;

    for (let i = 0; i < 6; i += 1) {
      const next = nextQuestion(state);
      if (!next.done) {
        const q = questionOf(next);
        order.push(q.id);
        // Drive the machine: an answer advances it to the next question.
        answer(state, q.id, FIVE_ANSWERS[q.id] as string, 'stated');
      } else {
        done = next;
      }
    }

    expect(order).toEqual(['sector', 'city', 'size', 'sells', 'sells_to']);
    expect(done).not.toBeNull();
    expect(cardOf(done!).field_sources.sector).toBe('stated');
  });

  it('advances one question at a time when answer() follows each', () => {
    const state = createInterview({ mode: 'answers' });

    const step = (field: Question['id'], value: string) => {
      answer(state, field, value, 'stated');
      const next = nextQuestion(state);
      if (!next.done) {
        return questionOf(next).id;
      }
      return null as never;
    };

    expect(step('sector', 'technology')).toBe('city');
    expect(step('city', 'riyadh')).toBe('size');
    expect(step('size', '11-50')).toBe('sells');
    expect(step('sells', 'b2b')).toBe('sells_to');
    answer(state, 'sells_to', 'b2b', 'stated');
    const done = nextQuestion(state);
    expect(done.done).toBe(true);
  });

  it('"no website" completes the website path with website: null', () => {
    const state = createInterview({ mode: 'website' });

    const first = nextQuestion(state);
    if (!first.done) {
      expect(questionOf(first).id).toBe('website');
    }

    answer(state, 'website', 'no website', 'stated');
    const finished = nextQuestion(state);
    if (finished.done) {
      expect(finished.card.website).toBeNull();
      expect(finished.card.field_sources.website).toBe('stated');
    }
  });

  it('the CR path ends with the CR number in the card', () => {
    const state = createInterview({ mode: 'cr' });

    const first = nextQuestion(state);
    if (!first.done) {
      expect(questionOf(first).id).toBe('cr');
    }

    answer(state, 'cr', '9876543', 'cr');
    const finished = nextQuestion(state);
    if (finished.done) {
      expect(finished.card.cr).toBe('9876543');
      expect(finished.card.field_sources.cr).toBe('inferred');
    }
  });
});

describe('buildCard -- one source flag on every field', () => {
  it('returns every card field with the supplied source tags', () => {
    const card = buildCard(
      {
        company: 'Acme Corporation',
        cr: '1234567',
        website: 'https://acme.example',
        sector: 'technology',
        city: 'riyadh',
        size: '11-50',
        sells: 'b2b',
        sells_to: 'b2b',
      },
      FULL_SOURCES,
    );

    expect(card.company).toBe('Acme Corporation');
    expect(card.cr).toBe('1234567');
    expect(card.website).toBe('https://acme.example');
    expect(card.sector).toBe('technology');
    expect(card.city).toBe('riyadh');
    expect(card.size).toBe('11-50');
    expect(card.sells).toBe('b2b');
    expect(card.sells_to).toBe('b2b');
    expect(card.field_sources).toEqual(FULL_SOURCES);
    expect(validatedFieldSources(card)).toEqual(FULL_SOURCES);
  });

  it('keeps an inferred tag -- never relabels it stated', () => {
    const card = buildCard(
      {
        company: 'Acme Corporation',
        cr: '1234567',
        website: 'https://acme.example',
        sector: 'technology',
        city: 'riyadh',
        size: '11-50',
        sells: 'b2b',
        sells_to: 'b2b',
      },
      { ...FULL_SOURCES, sector: 'inferred' },
    );
    expect(card.field_sources.sector).toBe('inferred');
  });
});

describe('validateCard -- refusal of an unsourced card', () => {
  const completeCard = buildCard(
    {
      company: 'Acme Corporation',
      cr: '1234567',
      website: 'https://acme.example',
      sector: 'technology',
      city: 'riyadh',
      size: '11-50',
      sells: 'b2b',
      sells_to: 'b2b',
    },
    FULL_SOURCES,
  );

  it('accepts a card that has a source on every field', () => {
    expect(validateCard(completeCard)).toBe(true);
  });

  it('refuses a card whose field_sources has a field without a source', () => {
    const incomplete = {
      company: 'stated',
      cr: 'cr',
      website: 'website',
      city: 'stated',
      size: 'stated',
      sells: 'stated',
      sells_to: 'stated',
      // sector deliberately omitted -- buildCard spreads whatever sources it
      // is given, so the assembled card has no source for sector.
    } as unknown as SourceMap;

    const card = buildCard(
      {
        company: 'Acme Corporation',
        cr: '1234567',
        website: 'https://acme.example',
        sector: 'technology',
        city: 'riyadh',
        size: '11-50',
        sells: 'b2b',
        sells_to: 'b2b',
      },
      incomplete,
    );
    expect(validateCard(card)).toBe(false);
  });

  it('refuses a card whose field_sources has a field with a non-string source', () => {
    const card = {
      company: 'Acme Corporation',
      cr: '1234567',
      website: 'https://acme.example',
      sector: 'technology',
      city: 'riyadh',
      size: '11-50',
      sells: 'b2b',
      sells_to: 'b2b',
      field_sources: {
        ...FULL_SOURCES,
        // sell deliberately tagged with the wrong type
        sells: null as unknown as SourceTag,
      },
    };
    expect(validateCard(card)).toBe(false);
  });
});

/** Helper used to assert the auditability rule on a built card. */
function validatedFieldSources(card: CompanyCard): SourceMap {
  expect(validateCard(card)).toBe(true);
  return card.field_sources;
}
