/**
 * Offline English text normalization for speech synthesis.
 * Converts symbols, numbers, currencies, and common abbreviations into spoken words
 * to optimize TTS pronunciation and avoid tokenization artifacts.
 */

const ONES = [
  '',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];

const TENS = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
];

const ORDINALS: Record<string, string> = {
  '1st': 'first',
  '2nd': 'second',
  '3rd': 'third',
  '4th': 'fourth',
  '5th': 'fifth',
  '6th': 'sixth',
  '7th': 'seventh',
  '8th': 'eighth',
  '9th': 'ninth',
  '10th': 'tenth',
  '11th': 'eleventh',
  '12th': 'twelfth',
  '13th': 'thirteenth',
  '20th': 'twentieth',
  '21st': 'twenty-first',
  '22nd': 'twenty-second',
  '30th': 'thirtieth',
  '50th': 'fiftieth',
  '100th': 'hundredth',
};

const ABBREVIATIONS: [RegExp, string][] = [
  [/\bMr\.(?=\s|$)/gi, 'Mister'],
  [/\bMrs\.(?=\s|$)/gi, 'Missus'],
  [/\bMs\.(?=\s|$)/gi, 'Miss'],
  [/\bDr\.(?=\s|$)/gi, 'Doctor'],
  [/\bProf\.(?=\s|$)/gi, 'Professor'],
  [/\bSt\.(?=\s+[A-Z])/g, 'Saint'],
  [/\bCapt\.(?=\s|$)/gi, 'Captain'],
  [/\bCol\.(?=\s|$)/gi, 'Colonel'],
  [/\bGen\.(?=\s|$)/gi, 'General'],
  [/\bLt\.(?=\s|$)/gi, 'Lieutenant'],
  [/\bSgt\.(?=\s|$)/gi, 'Sergeant'],
  [/\bRev\.(?=\s|$)/gi, 'Reverend'],
  [/\bJr\.(?=\s|[.,]|$)/gi, 'Junior'],
  [/\bSr\.(?=\s|[.,]|$)/gi, 'Senior'],
  [/\bchap\.\s*(\d+)/gi, 'chapter $1'],
  [/\bch\.\s*(\d+)/gi, 'chapter $1'],
  [/\bvol\.\s*(\d+)/gi, 'volume $1'],
  [/\bsec\.\s*(\d+)/gi, 'section $1'],
  [/\bpp\.\s*(\d+)/gi, 'pages $1'],
  [/\bp\.\s*(\d+)/gi, 'page $1'],
  [/\bvs\.(?=\s|$)/gi, 'versus'],
  [/\betc\.(?=[,;])/gi, 'etcetera'],
  [/\betc\./gi, 'etcetera.'],
  [/\be\.g\.,?\s*/gi, 'for example, '],
  [/\bi\.e\.,?\s*/gi, 'that is, '],
  [/\bapprox\.(?=\s|$)/gi, 'approximately'],
  [/\bdept\.(?=\s|$)/gi, 'department'],
];

/**
 * Converts a positive integer (< 1,000,000,000) to English words.
 */
export function integerToWords(num: number): string {
  if (num === 0) return 'zero';
  if (num < 0) return `negative ${integerToWords(Math.abs(num))}`;

  function convertHundreds(n: number): string {
    let str = '';
    if (n >= 100) {
      str += `${ONES[Math.floor(n / 100)]} hundred`;
      n %= 100;
      if (n > 0) str += ' ';
    }
    if (n >= 20) {
      str += TENS[Math.floor(n / 10)];
      const rem = n % 10;
      if (rem > 0) str += `-${ONES[rem]}`;
    } else if (n > 0) {
      str += ONES[n];
    }
    return str;
  }

  let result = '';
  const billions = Math.floor(num / 1_000_000_000);
  const millions = Math.floor((num % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((num % 1_000_000) / 1_000);
  const remainder = num % 1_000;

  if (billions > 0) {
    result += `${convertHundreds(billions)} billion `;
  }
  if (millions > 0) {
    result += `${convertHundreds(millions)} million `;
  }
  if (thousands > 0) {
    result += `${convertHundreds(thousands)} thousand `;
  }
  if (remainder > 0) {
    result += convertHundreds(remainder);
  }

  return result.trim();
}

/**
 * Converts a 4-digit year (1000-2099) to spoken form.
 * e.g., 1984 -> "nineteen eighty-four", 2026 -> "twenty twenty-six"
 */
function yearToWords(year: number): string {
  if (year >= 2000 && year <= 2009) {
    return `two thousand ${year === 2000 ? '' : ONES[year - 2000]}`.trim();
  }
  const century = Math.floor(year / 100);
  const decade = year % 100;
  const centuryWord = integerToWords(century);
  if (decade === 0) {
    return `${centuryWord} hundred`;
  }
  if (decade < 10) {
    return `${centuryWord} oh-${ONES[decade]}`;
  }
  return `${centuryWord} ${integerToWords(decade)}`;
}

/**
 * Expands numeric tokens, currencies, and decimals.
 */
function normalizeNumbersAndCurrencies(text: string): string {
  let result = text;

  // Currencies: $100 -> one hundred dollars, $100.50 -> one hundred dollars and fifty cents
  result = result.replace(/\$([0-9]+(?:\.[0-9]{1,2})?)/g, (_, val) => {
    const num = parseFloat(val);
    if (isNaN(num)) return val;
    if (Number.isInteger(num)) {
      const words = integerToWords(num);
      return `${words} dollar${num === 1 ? '' : 's'}`;
    }
    const [dollars, cents] = val.split('.');
    const dWords = integerToWords(parseInt(dollars, 10));
    const cNum = parseInt(cents.padEnd(2, '0'), 10);
    const cWords = integerToWords(cNum);
    return `${dWords} dollar${dollars === '1' ? '' : 's'} and ${cWords} cent${cNum === 1 ? '' : 's'}`;
  });

  result = result.replace(/£([0-9]+(?:\.[0-9]{1,2})?)/g, (_, val) => {
    const num = parseInt(val, 10);
    return isNaN(num) ? val : `${integerToWords(num)} pound${num === 1 ? '' : 's'}`;
  });

  result = result.replace(/€([0-9]+(?:\.[0-9]{1,2})?)/g, (_, val) => {
    const num = parseInt(val, 10);
    return isNaN(num) ? val : `${integerToWords(num)} euro${num === 1 ? '' : 's'}`;
  });

  // Percentages: 50% -> fifty percent
  result = result.replace(/([0-9]+(?:\.[0-9]+)?)\s*%/g, (_, val) => {
    const num = parseFloat(val);
    if (isNaN(num)) return val;
    return `${Number.isInteger(num) ? integerToWords(num) : val} percent`;
  });

  // Ordinals: 1st, 2nd, 3rd, etc.
  result = result.replace(/\b([0-9]+(?:st|nd|rd|th))\b/gi, (match, val) => {
    const lower = val.toLowerCase();
    return ORDINALS[lower] ?? match;
  });

  // Years: standalone 4-digit numbers from 1000 to 2099
  result = result.replace(/\b(1[0-9]{3}|20[0-9]{2})\b/g, (_, yearStr) => {
    const year = parseInt(yearStr, 10);
    return yearToWords(year);
  });

  // Decimals: 3.14 -> three point one four
  result = result.replace(/\b([0-9]+)\.([0-9]+)\b/g, (_, whole, dec) => {
    const wholeWords = integerToWords(parseInt(whole, 10));
    const decWords = dec
      .split('')
      .map((d: string) => ONES[parseInt(d, 10)] || 'zero')
      .join(' ');
    return `${wholeWords} point ${decWords}`;
  });

  // Standard integers (up to 9 digits): 42 -> forty-two
  result = result.replace(/\b([0-9]{1,9})\b/g, (_, numStr) => {
    const num = parseInt(numStr, 10);
    return integerToWords(num);
  });

  return result;
}

/**
 * Normalizes text for speech generation:
 * - Expands abbreviations and titles
 * - Expands currencies, numbers, and ordinals
 * - Converts symbols (&, @, +, =)
 * - Normalizes em-dashes and ellipses into speech pauses
 * - Cleans multiple whitespace
 */
export function normalizeNarrationText(text: string): string {
  if (!text || typeof text !== 'string') return '';

  // Strip null bytes and non-printable control characters
  // eslint-disable-next-line no-control-regex
  let normalized = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ').trim();
  if (!normalized) return '';

  // Expand abbreviations
  for (const [pattern, replacement] of ABBREVIATIONS) {
    normalized = normalized.replace(pattern, replacement);
  }

  // Common symbols
  normalized = normalized.replace(/&/g, ' and ');
  normalized = normalized.replace(/@/g, ' at ');
  normalized = normalized.replace(/\+/g, ' plus ');
  normalized = normalized.replace(/[=]/g, ' equals ');

  // Pause translation: em-dashes, en-dashes, ellipses
  normalized = normalized.replace(/[\u2014\u2013]|--+/g, ', ');
  normalized = normalized.replace(/\.{3,}|\u2026/g, ', ');

  // Strip unwanted formatting chars (markdown asterisks, underscores, brackets)
  normalized = normalized.replace(/[*_~`#[\]]/g, ' ');

  // Normalize numbers, currencies, decimals
  normalized = normalizeNumbersAndCurrencies(normalized);

  // Apply ligature and spacing fixes
  normalized = fixLigatureSplits(normalized);

  return normalized.replace(/[ \t]+/g, ' ').trim();
}

export function fixLigatureSplits(rawText: string): string {
  if (!rawText) return '';
  let text = rawText;

  // Strip soft hyphens and invisible zero-width markers
  text = text.replace(/\u00AD/g, '')
    .replace(/\u200B/g, '')
    .replace(/\uFEFF/g, '')
    .replace(/\u00A0/g, ' ');

  // De-hyphenate words broken by line-break or spaced hyphens: e.g. "in- formation" -> "information"
  text = text.replace(/(\b[A-Za-z]{2,})-(?:[ \t]*\r?\n[ \t]*|[ \t]+)([a-z]{2,}\b)/g, (_, prefix, suffix) => {
    if (/^(self|well|half|all|ex|non|anti)$/i.test(prefix)) {
      return `${prefix}-${suffix}`;
    }
    return `${prefix}${suffix}`;
  });

  // Contraction single-l ligature drops: "We'l" -> "We'll", "I'l" -> "I'll", etc.
  text = text.replace(/\b(we|i|you|he|she|they|it|who|that|there|what)['’]l\b/gi, (match, pronoun) => {
    return `${pronoun}'ll`;
  });

  // Common words where 'll' was reduced to single 'l'
  text = text.replace(/\bcal\b(?=[ \t]+[A-Za-z]|[,.!?;:]|$)/gi, match => {
    return match[0] === match[0].toUpperCase() ? 'Call' : 'call';
  });
  text = text.replace(/\bstil\b/gi, match => match[0] === match[0].toUpperCase() ? 'Still' : 'still');
  text = text.replace(/\bsmal\b/gi, match => match[0] === match[0].toUpperCase() ? 'Small' : 'small');
  text = text.replace(/\btal\b/gi, match => match[0] === match[0].toUpperCase() ? 'Tall' : 'tall');
  text = text.replace(/\byel\b/gi, match => match[0] === match[0].toUpperCase() ? 'Yell' : 'yell');
  text = text.replace(/\bfal\b/gi, match => match[0] === match[0].toUpperCase() ? 'Fall' : 'fall');
  text = text.replace(/\bwal\b/gi, match => match[0] === match[0].toUpperCase() ? 'Wall' : 'wall');
  text = text.replace(/\bbal\b/gi, match => match[0] === match[0].toUpperCase() ? 'Ball' : 'ball');
  text = text.replace(/\btel\b/gi, match => match[0] === match[0].toUpperCase() ? 'Tell' : 'tell');
  text = text.replace(/\bpul\b/gi, match => match[0] === match[0].toUpperCase() ? 'Pull' : 'pull');
  text = text.replace(/\bkil\b/gi, match => match[0] === match[0].toUpperCase() ? 'Kill' : 'kill');
  text = text.replace(/\bwel\b(?=[ \t]*,|[ \t]+(?:done|known|said|thought|off|being|as|to))/gi, match =>
    match[0] === match[0].toUpperCase() ? 'Well' : 'well'
  );
  text = text.replace(/(?<=\b(?:as|very|how)[ \t]+)wel\b/gi, match =>
    match[0] === match[0].toUpperCase() ? 'Well' : 'well'
  );
  text = text.replace(/\bal\b(?=[ \t]+(?:of|the|right|day|night|over|about|around|alone|along|together|clear))/gi, match =>
    match[0] === match[0].toUpperCase() ? 'All' : 'all'
  );
  text = text.replace(/(?<=\b(?:at|with|in)[ \t]+)al\b/gi, match =>
    match[0] === match[0].toUpperCase() ? 'All' : 'all'
  );

  // Fix EPUB/OCR ligature splits (e.g., "fil ed" -> "filled", "stal ion" -> "stallion")
  text = text.replace(/\bFinal y\b/g, 'Finally');
  text = text.replace(/\bfinal y\b/g, 'finally');
  text = text.replace(/\bmarshmal ow(s)?\b/gi, 'marshmallow$1');
  text = text.replace(/\bstal ion(s)?\b/gi, 'stallion$1');
  text = text.replace(/\bhil\s+([,.\!?;:])/g, 'hill$1');
  text = text.replace(/\bhil\b(?!\s*([a-zA-Z]))/g, 'hill');
  text = text.replace(/\b(fil|yel|cal|kil|pul|rol|bel|dwi|stil|spe|sme|spi|dri|chi|gri|thr|swel|fulfi) (ed|ing|er|est)\b/gi, '$1l$2');
  text = text.replace(/\b([a-zA-Z]{3,}) (ly)\b/gi, '$1$2');

  // Common ff, fi, fl, ffi, ffl ligature dropouts frequently found in PDFs
  text = text.replace(/\bof fice(s|r|rs)?\b/gi, 'office$1');
  text = text.replace(/\bof fer(s|ed|ing)?\b/gi, 'offer$1');
  text = text.replace(/\bof ficial(s|ly)?\b/gi, 'official$1');
  text = text.replace(/\bof fspring\b/gi, 'offspring');
  text = text.replace(/\bof fense(s)?\b/gi, 'offense$1');
  text = text.replace(/\bef fect(s|ive|ively)?\b/gi, 'effect$1');
  text = text.replace(/\bef fort(s|less)?\b/gi, 'effort$1');
  text = text.replace(/\baf ter(wards|noon|noons)?\b/gi, 'after$1');
  text = text.replace(/\baf fair(s)?\b/gi, 'affair$1');
  text = text.replace(/\baf ford(able|s|ed|ing)?\b/gi, 'afford$1');
  text = text.replace(/\baf fect(s|ed|ing)?\b/gi, 'affect$1');
  text = text.replace(/\bdif fer(ent|ently|ence|ences|s|ed|ing)?\b/gi, 'differ$1');
  text = text.replace(/\bdif ficult(y|ies)?\b/gi, 'difficult$1');
  text = text.replace(/\bsuf fer(s|ed|ing|ings)?\b/gi, 'suffer$1');
  text = text.replace(/\btra ffic\b/gi, 'traffic');
  text = text.replace(/\bstaf f(s)?\b/gi, 'staff$1');
  text = text.replace(/\bclif f(s)?\b/gi, 'cliff$1');
  text = text.replace(/\bstif f(ly|en|ness)?\b/gi, 'stiff$1');
  text = text.replace(/\bcon flict(s|ed|ing)?\b/gi, 'conflict$1');
  text = text.replace(/\bcon firm(s|ed|ing|ation)?\b/gi, 'confirm$1');
  text = text.replace(/\bcon fident(ly|ce)?\b/gi, 'confident$1');
  text = text.replace(/\bcon fuse(s|d|ing|ion)?\b/gi, 'confuse$1');
  text = text.replace(/\bcon fession(s)?\b/gi, 'confession$1');
  text = text.replace(/\bin fluence(s|d)?\b/gi, 'influence$1');
  text = text.replace(/\bin form(s|ed|ing|ation)?\b/gi, 'inform$1');
  text = text.replace(/\bre flect(s|ed|ing|ion|ions)?\b/gi, 'reflect$1');
  text = text.replace(/\bpro fessor(s)?\b/gi, 'professor$1');
  text = text.replace(/\bde fine(s|d)?\b/gi, 'define$1');
  text = text.replace(/\bde finite(ly)?\b/gi, 'definite$1');
  text = text.replace(/\bfi nd(s|ing)?\b/gi, 'find$1');
  text = text.replace(/\bfi rst(ly)?\b/gi, 'first$1');
  text = text.replace(/\bfi ve\b/gi, 'five');
  text = text.replace(/\bfi re(s|d|ing)?\b/gi, 'fire$1');
  text = text.replace(/\bfi nal(ly|s)?\b/gi, 'final$1');
  text = text.replace(/\bfi gure(s|d)?\b/gi, 'figure$1');
  text = text.replace(/\bfl ow(s|ed|ing)?\b/gi, 'flow$1');
  text = text.replace(/\bfl y(ing)?\b/gi, 'fly$1');
  text = text.replace(/\bfl ight(s)?\b/gi, 'flight$1');
  text = text.replace(/\bfl ame(s)?\b/gi, 'flame$1');
  text = text.replace(/\bfl ash(es|ed|ing)?\b/gi, 'flash$1');
  text = text.replace(/\bfl oor(s)?\b/gi, 'floor$1');

  // Spaces before punctuation
  text = text.replace(/\s+([,.\!?;:])/g, '$1');

  // Spaces inside quotation marks: “ word ” -> “word”
  text = text.replace(/([“"‘])\s+/g, '$1');
  text = text.replace(/\s+([”"’])/g, '$1');

  // Collapse multiple consecutive spaces
  text = text.replace(/[ \t]+/g, ' ');

  return text.trim();
}

export const normalizeForNarration = normalizeNarrationText;


