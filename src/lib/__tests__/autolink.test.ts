import { tokenizeText } from '../autolink';

describe('tokenizeText', () => {
  it('returns empty array for empty string', () => {
    expect(tokenizeText('')).toEqual([]);
  });

  it('returns single text token when no links are present', () => {
    expect(tokenizeText('Hello world, how are you?')).toEqual([
      { type: 'text', value: 'Hello world, how are you?' },
    ]);
  });

  it('parses URLs with trailing punctuation properly stripped', () => {
    const tokens = tokenizeText('Visit https://web.kinnoc.app/community/caleb. It is great!');
    expect(tokens).toEqual([
      { type: 'text', value: 'Visit ' },
      { type: 'url', value: 'https://web.kinnoc.app/community/caleb', href: 'https://web.kinnoc.app/community/caleb' },
      { type: 'text', value: '. It is great!' },
    ]);
  });

  it('parses www. URLs and prepends https:// to href', () => {
    const tokens = tokenizeText('Go to www.kinnoc.app now');
    expect(tokens).toEqual([
      { type: 'text', value: 'Go to ' },
      { type: 'url', value: 'www.kinnoc.app', href: 'https://www.kinnoc.app' },
      { type: 'text', value: ' now' },
    ]);
  });

  it('parses email addresses', () => {
    const tokens = tokenizeText('Email us at support@kinnoc.app for help.');
    expect(tokens).toEqual([
      { type: 'text', value: 'Email us at ' },
      { type: 'email', value: 'support@kinnoc.app', href: 'mailto:support@kinnoc.app' },
      { type: 'text', value: ' for help.' },
    ]);
  });

  it('parses international phone numbers', () => {
    const tokens = tokenizeText('Call +1 (555) 123-4567 or reach out.');
    expect(tokens).toEqual([
      { type: 'text', value: 'Call ' },
      { type: 'phone', value: '+1 (555) 123-4567', href: 'tel:+15551234567' },
      { type: 'text', value: ' or reach out.' },
    ]);
  });

  it('does not falsely match dates as phone numbers', () => {
    const tokens = tokenizeText('The event date is 2026-11-02.');
    expect(tokens).toEqual([
      { type: 'text', value: 'The event date is 2026-11-02.' },
    ]);
  });
});

