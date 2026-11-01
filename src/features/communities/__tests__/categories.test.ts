import { validateCommunity, type CommunityFormValues } from '../CommunityForm';
import { DEFAULT_COMMUNITY_CATEGORIES } from '../categories';

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));

describe('DEFAULT_COMMUNITY_CATEGORIES', () => {
  it('contains the canonical initial community categories', () => {
    const slugs = DEFAULT_COMMUNITY_CATEGORIES.map((c) => c.slug);
    expect(slugs).toContain('technology');
    expect(slugs).toContain('education');
    expect(slugs).toContain('business-entrepreneurship');
    expect(slugs).toContain('arts-creativity');
    expect(slugs).toContain('gaming');
    expect(slugs).toContain('sports-fitness');
    expect(slugs).toContain('lifestyle');
    expect(slugs).toContain('entertainment');
    expect(slugs).toContain('faith-religion');
    expect(slugs).toContain('social-community');
    expect(slugs).toContain('other');
  });

  it('has valid non-empty names and slugs for all categories', () => {
    for (const cat of DEFAULT_COMMUNITY_CATEGORIES) {
      expect(cat.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(cat.name.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('validateCommunity', () => {
  const validValues: CommunityFormValues = {
    name: 'Tech Builders',
    description: 'A community for developers and designers.',
    category: 'technology',
    visibility: 'public',
    joinPolicy: 'open',
  };

  it('passes validation when all fields including category are valid', () => {
    const errors = validateCommunity(validValues);
    expect(errors.name).toBeNull();
    expect(errors.description).toBeNull();
    expect(errors.category).toBeNull();
  });

  it('fails with "Choose a category." when category is null', () => {
    const errors = validateCommunity({ ...validValues, category: null });
    expect(errors.category).toBe('Choose a category.');
  });

  it('fails with "Choose a category." when category is empty string', () => {
    const errors = validateCommunity({ ...validValues, category: '' });
    expect(errors.category).toBe('Choose a category.');
  });

  it('validates name constraints', () => {
    expect(validateCommunity({ ...validValues, name: '' }).name).toBe('Give your community a name.');
    expect(validateCommunity({ ...validValues, name: 'ab' }).name).toBe('Use at least 3 characters.');
    expect(validateCommunity({ ...validValues, name: 'a'.repeat(81) }).name).toBe('Keep it under 80 characters.');
  });

  it('validates description constraints', () => {
    expect(validateCommunity({ ...validValues, description: '' }).description).toBe('Say what the community is about.');
    expect(validateCommunity({ ...validValues, description: 'a'.repeat(1001) }).description).toBe('Keep it under 1000 characters.');
  });

  it.each([
    ['Technology', 'technology'],
    ['Education', 'education'],
    ['Business & Entrepreneurship', 'business-entrepreneurship'],
    ['Other', 'other'],
  ])('satisfies category validation for %s (%s)', (_, slug) => {
    const errors = validateCommunity({ ...validValues, category: slug });
    expect(errors.category).toBeNull();
  });
});
