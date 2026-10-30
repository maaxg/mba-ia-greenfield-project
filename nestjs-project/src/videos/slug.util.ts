import { randomInt } from 'node:crypto';
import { SLUG_LENGTH } from './videos.constants';

const BASE62_ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export function generateSlug(): string {
  let slug = '';
  for (let i = 0; i < SLUG_LENGTH; i++) {
    slug += BASE62_ALPHABET[randomInt(BASE62_ALPHABET.length)];
  }
  return slug;
}
