import { generateSlug } from './slug.util';

describe('generateSlug', () => {
  it('should generate 11 base62 characters', () => {
    expect(generateSlug()).toMatch(/^[0-9A-Za-z]{11}$/);
  });

  it('should not repeat across many generations', () => {
    const slugs = new Set(Array.from({ length: 10000 }, generateSlug));

    expect(slugs.size).toBe(10000);
  });
});
