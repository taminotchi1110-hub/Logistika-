import {
  estimateDurationMin,
  estimateRoadKm,
  haversineKm,
  isValidCoordinate,
  isWithinUzbekistan,
} from './geo.util';

const TASHKENT = { lat: 41.2995, lng: 69.2401 };
const SAMARKAND = { lat: 39.6542, lng: 66.9597 };
const NUKUS = { lat: 42.4531, lng: 59.6103 };

describe('haversineKm', () => {
  it('Toshkent–Samarqand ~270 km toʻgʻri chiziq', () => {
    const distance = haversineKm(TASHKENT, SAMARKAND);
    expect(distance).toBeGreaterThan(260);
    expect(distance).toBeLessThan(285);
  });

  it('Toshkent–Nukus ~800 km toʻgʻri chiziq', () => {
    const distance = haversineKm(TASHKENT, NUKUS);
    expect(distance).toBeGreaterThan(760);
    expect(distance).toBeLessThan(840);
  });

  it('bir xil nuqta uchun 0', () => {
    expect(haversineKm(TASHKENT, TASHKENT)).toBeCloseTo(0, 6);
  });

  it('simmetrik: A→B va B→A bir xil', () => {
    expect(haversineKm(TASHKENT, SAMARKAND)).toBeCloseTo(haversineKm(SAMARKAND, TASHKENT), 9);
  });
});

describe('estimateRoadKm', () => {
  it('yoʻl masofasi toʻgʻri chiziqdan har doim uzun', () => {
    for (const straight of [3, 12, 45, 270, 800]) {
      expect(estimateRoadKm(straight)).toBeGreaterThan(straight);
    }
  });

  it('shahar ichida koeffitsient kattaroq (koʻchalar toʻri)', () => {
    const cityRatio = estimateRoadKm(10) / 10;
    const intercityRatio = estimateRoadKm(300) / 300;
    expect(cityRatio).toBeGreaterThan(intercityRatio);
  });

  it('Toshkent–Samarqand real yoʻl (~308 km) atrofida chiqadi', () => {
    const estimated = estimateRoadKm(haversineKm(TASHKENT, SAMARKAND));
    expect(estimated).toBeGreaterThan(300);
    expect(estimated).toBeLessThan(360);
  });
});

describe('estimateDurationMin', () => {
  it('uzoq masofada oʻrtacha tezlik yuqoriroq', () => {
    const cityMinPerKm = estimateDurationMin(10) / 10;
    const highwayMinPerKm = estimateDurationMin(300) / 300;
    expect(cityMinPerKm).toBeGreaterThan(highwayMinPerKm);
  });

  it('308 km uchun 4–6 soat oraligʻida', () => {
    const minutes = estimateDurationMin(308);
    expect(minutes).toBeGreaterThan(240);
    expect(minutes).toBeLessThan(360);
  });
});

describe('koordinata tekshiruvi', () => {
  it('Oʻzbekiston ichidagi nuqtalarni taniydi', () => {
    expect(isWithinUzbekistan(TASHKENT)).toBe(true);
    expect(isWithinUzbekistan(NUKUS)).toBe(true);
  });

  it('chet eldagi nuqtani rad etadi', () => {
    expect(isWithinUzbekistan({ lat: 55.75, lng: 37.61 })).toBe(false); // Moskva
    expect(isWithinUzbekistan({ lat: 0, lng: 0 })).toBe(false);
  });

  it('notoʻgʻri koordinatani rad etadi', () => {
    expect(isValidCoordinate({ lat: 91, lng: 0 })).toBe(false);
    expect(isValidCoordinate({ lat: 0, lng: 181 })).toBe(false);
    expect(isValidCoordinate({ lat: Number.NaN, lng: 0 })).toBe(false);
  });
});
