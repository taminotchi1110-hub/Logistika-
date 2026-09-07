import { formatPlate, isValidPlate, normalizePlate } from './plate.util';

describe('normalizePlate', () => {
  it.each([
    ['01A123BC', '01A123BC'],
    ['01 A 123 BC', '01A123BC'],
    ['01-a-123-bc', '01A123BC'],
    ['  01a123bc  ', '01A123BC'],
    ['01123ABC', '01123ABC'],
    ['30 A 777 AA', '30A777AA'],
    ['95X500KM', '95X500KM'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePlate(input)).toBe(expected);
  });

  it('kirill harflarini lotinga oʻgiradi (klaviatura xatosi)', () => {
    expect(normalizePlate('01А123ВС')).toBe('01A123BC');
  });

  it.each([
    ['', 'boʻsh'],
    ['ABC123', 'hudud kodi yoʻq'],
    ['991A123BC', 'hudud kodi 3 xonali'],
    ['00A123BC', 'mavjud boʻlmagan hudud kodi'],
    ['01A12BC', 'raqamlar yetishmaydi'],
    ['01A123B', 'harflar yetishmaydi'],
    ['01A123BCD', 'ortiqcha harf'],
  ])('%s → null (%s)', (input) => {
    expect(normalizePlate(input)).toBeNull();
  });
});

describe('isValidPlate', () => {
  it('toʻgʻri raqamda true', () => {
    expect(isValidPlate('01 A 123 BC')).toBe(true);
  });

  it('notoʻgʻri raqamda false', () => {
    expect(isValidPlate('XYZ')).toBe(false);
  });
});

describe('formatPlate', () => {
  it('yangi namunani ajratib koʻrsatadi', () => {
    expect(formatPlate('01A123BC')).toBe('01 A 123 BC');
  });

  it('eski namunani ajratib koʻrsatadi', () => {
    expect(formatPlate('01123ABC')).toBe('01 123 ABC');
  });

  it('notoʻgʻri raqamni oʻzgartirmaydi', () => {
    expect(formatPlate('XYZ')).toBe('XYZ');
  });
});
