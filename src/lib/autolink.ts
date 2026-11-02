/**
 * Autolink tokenizer for parsing URLs, email addresses, and phone numbers in text.
 */

export type TokenType = 'text' | 'url' | 'email' | 'phone';

export interface TextToken {
  type: TokenType;
  value: string;
  href?: string;
}

// URL regex matching http, https, and www. links
const URL_REGEX = /(?:https?:\/\/|www\.)[^\s<>"'`{}|\\^]+/i;

// Email regex
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i;

// Phone number regexes:
// 1. International with +: +1 (555) 123-4567 or +44 20 7946 0919
// 2. Parenthesized area code: (555) 123-4567
// 3. Dash/dot separated 10-digit: 555-123-4567
const PHONE_REGEX = /(?:\+\d{1,4}[-.\s]?(?:\(?\d{1,4}\)?[-.\s]?)?\d{1,4}[-.\s]?\d{1,9}|\(\d{2,4}\)[-.\s]?\d{3,4}[-.\s]?\d{3,4}|\b\d{3}[-.]\d{3}[-.]\d{4}\b)/;

// Combined pattern to locate next candidate
const COMBINED_REGEX = new RegExp(
  `(${URL_REGEX.source})|(${EMAIL_REGEX.source})|(${PHONE_REGEX.source})`,
  'i',
);

// Trailing punctuation characters that are often not part of a URL or email
const TRAILING_PUNCTUATION = /[.,;:!?)\]}>"']+$/;

function pushToken(tokens: TextToken[], token: TextToken) {
  if (token.type === 'text' && tokens.length > 0 && tokens[tokens.length - 1].type === 'text') {
    tokens[tokens.length - 1].value += token.value;
  } else {
    tokens.push(token);
  }
}

/**
 * Splits plain text into structured tokens for rendering clickable links.
 */
export function tokenizeText(input: string): TextToken[] {
  if (!input) return [];

  const tokens: TextToken[] = [];
  let remaining = input;

  while (remaining.length > 0) {
    const match = COMBINED_REGEX.exec(remaining);
    if (!match) {
      pushToken(tokens, { type: 'text', value: remaining });
      break;
    }

    const matchIndex = match.index;
    if (matchIndex > 0) {
      pushToken(tokens, { type: 'text', value: remaining.slice(0, matchIndex) });
    }

    let matchedText = match[0];
    let trailing = '';

    // If matched a URL or email, strip trailing punctuation
    const punctMatch = matchedText.match(TRAILING_PUNCTUATION);
    if (punctMatch && !matchedText.endsWith(')')) {
      trailing = punctMatch[0];
      matchedText = matchedText.slice(0, -trailing.length);
    }

    if (match[1]) {
      // URL
      const href = matchedText.startsWith('www.') ? `https://${matchedText}` : matchedText;
      pushToken(tokens, { type: 'url', value: matchedText, href });
    } else if (match[2]) {
      // Email
      pushToken(tokens, { type: 'email', value: matchedText, href: `mailto:${matchedText}` });
    } else if (match[3]) {
      // Phone
      const digitsOnly = matchedText.replace(/[^\d+]/g, '');
      pushToken(tokens, { type: 'phone', value: matchedText, href: `tel:${digitsOnly}` });
    }

    if (trailing) {
      pushToken(tokens, { type: 'text', value: trailing });
    }

    remaining = remaining.slice(matchIndex + match[0].length);
  }

  return tokens;
}
