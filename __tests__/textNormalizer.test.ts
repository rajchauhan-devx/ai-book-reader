import {
  integerToWords,
  normalizeNarrationText,
} from '../src/services/textNormalizer';

describe('integerToWords', () => {
  it('converts single digits correctly', () => {
    expect(integerToWords(0)).toBe('zero');
    expect(integerToWords(5)).toBe('five');
    expect(integerToWords(9)).toBe('nine');
  });

  it('converts teens and tens correctly', () => {
    expect(integerToWords(11)).toBe('eleven');
    expect(integerToWords(15)).toBe('fifteen');
    expect(integerToWords(20)).toBe('twenty');
    expect(integerToWords(42)).toBe('forty-two');
    expect(integerToWords(99)).toBe('ninety-nine');
  });

  it('converts hundreds, thousands, and millions correctly', () => {
    expect(integerToWords(100)).toBe('one hundred');
    expect(integerToWords(350)).toBe('three hundred fifty');
    expect(integerToWords(1000)).toBe('one thousand');
    expect(integerToWords(2024)).toBe('two thousand twenty-four');
    expect(integerToWords(1000000)).toBe('one million');
  });
});

describe('normalizeNarrationText', () => {
  it('handles empty or blank input', () => {
    expect(normalizeNarrationText('')).toBe('');
    expect(normalizeNarrationText('   ')).toBe('');
  });

  it('expands titles and abbreviations', () => {
    expect(normalizeNarrationText('Mr. Darcy met Dr. Watson at St. Paul.')).toBe(
      'Mister Darcy met Doctor Watson at Saint Paul.',
    );
    expect(normalizeNarrationText('See ch. 4, p. 12, etc.')).toBe(
      'See chapter four, page twelve, etcetera.',
    );
  });

  it('expands currencies and percentages', () => {
    expect(normalizeNarrationText('The book costs $25.')).toBe(
      'The book costs twenty-five dollars.',
    );
    expect(normalizeNarrationText('Over 50% of people agreed.')).toBe(
      'Over fifty percent of people agreed.',
    );
  });

  it('expands 4-digit years appropriately', () => {
    expect(normalizeNarrationText('In 1984, the story began.')).toBe(
      'In nineteen eighty-four, the story began.',
    );
    expect(normalizeNarrationText('By 2026, technology advanced.')).toBe(
      'By twenty twenty-six, technology advanced.',
    );
  });

  it('converts symbols and pauses', () => {
    expect(normalizeNarrationText('Apples & oranges—both are good...')).toBe(
      'Apples and oranges, both are good,',
    );
  });

  it('expands ordinals', () => {
    expect(normalizeNarrationText('He finished in 1st place on his 2nd attempt.')).toBe(
      'He finished in first place on his second attempt.',
    );
  });
});
