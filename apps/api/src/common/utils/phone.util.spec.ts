import { isValidUzPhone, maskPhone, normalizeUzPhone } from './phone.util';

describe('normalizeUzPhone', () => {
  it.each([
    ['+998901234567', '+998901234567'],
    ['998901234567', '+998901234567'],
    ['901234567', '+998901234567'],
    ['8901234567', '+998901234567'],
    ['+998 90 123 45 67', '+998901234567'],
    ['+998 (90) 123-45-67', '+998901234567'],
    ['90 123 45 67', '+998901234567'],
    ['  +998-90-123-45-67  ', '+998901234567'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeUzPhone(input)).toBe(expected);
  });

  it.each([
    ['', 'boʻsh qator'],
    ['12345', 'juda qisqa'],
    ['+9989012345678', 'juda uzun'],
    ['+79001234567', 'boshqa mamlakat kodi'],
    ['+998121234567', 'mavjud boʻlmagan operator kodi'],
    ['abcdefghi', 'raqam emas'],
  ])('%s → null (%s)', (input) => {
    expect(normalizeUzPhone(input)).toBeNull();
  });

  it('barcha amaldagi operator kodlarini qabul qiladi', () => {
    for (const prefix of [
      '20',
      '33',
      '50',
      '55',
      '77',
      '88',
      '90',
      '91',
      '93',
      '94',
      '95',
      '97',
      '98',
      '99',
    ]) {
      expect(normalizeUzPhone(`${prefix}1234567`)).toBe(`+998${prefix}1234567`);
    }
  });
});

describe('isValidUzPhone', () => {
  it('toʻgʻri raqamda true', () => {
    expect(isValidUzPhone('901234567')).toBe(true);
  });

  it('notoʻgʻri raqamda false', () => {
    expect(isValidUzPhone('+12025550123')).toBe(false);
  });
});

describe('maskPhone', () => {
  it('operator kodi va oxirgi ikki raqamni qoldiradi', () => {
    expect(maskPhone('+998901234567')).toBe('+998 90 *** ** 67');
  });

  it('turli formatdagi kirishda ham bir xil natija beradi', () => {
    expect(maskPhone('90 123 45 67')).toBe(maskPhone('+998901234567'));
  });

  it('notoʻgʻri raqamni umuman oshkor qilmaydi', () => {
    expect(maskPhone('nonsense')).toBe('***');
  });

  it('toʻliq raqamning oʻrta qismini hech qachon koʻrsatmaydi', () => {
    const masked = maskPhone('+998901234567');
    expect(masked).not.toContain('1234');
    expect(masked).not.toContain('12345');
  });
});
