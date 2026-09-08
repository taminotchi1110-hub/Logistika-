import {
  decodePolyline,
  encodePolyline,
  haversineKm,
  simplify,
  trackLengthKm,
  type LatLng,
} from './polyline';

describe('encodePolyline / decodePolyline', () => {
  it('Google hujjatidagi namunaga mos keladi', () => {
    // https://developers.google.com/maps/documentation/utilities/polylinealgorithm
    const points: LatLng[] = [
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ];
    expect(encodePolyline(points)).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  });

  it('kodlash va dekodlash aylanasi maʼlumotni saqlaydi', () => {
    const points: LatLng[] = [
      { lat: 41.3111, lng: 69.2797 },
      { lat: 41.2995, lng: 69.2401 },
      { lat: 39.6542, lng: 66.9597 },
    ];

    const back = decodePolyline(encodePolyline(points));

    expect(back).toHaveLength(3);
    back.forEach((point, index) => {
      expect(point.lat).toBeCloseTo(points[index].lat, 4);
      expect(point.lng).toBeCloseTo(points[index].lng, 4);
    });
  });

  it('boʻsh roʻyxat — boʻsh satr', () => {
    expect(encodePolyline([])).toBe('');
    expect(decodePolyline('')).toEqual([]);
  });

  it('bitta nuqta', () => {
    const back = decodePolyline(encodePolyline([{ lat: 41.3111, lng: 69.2797 }]));
    expect(back).toHaveLength(1);
    expect(back[0].lat).toBeCloseTo(41.3111, 4);
  });

  it('manfiy koordinatalar ham toʻgʻri', () => {
    const back = decodePolyline(encodePolyline([{ lat: -33.8688, lng: 151.2093 }]));
    expect(back[0].lat).toBeCloseTo(-33.8688, 4);
    expect(back[0].lng).toBeCloseTo(151.2093, 4);
  });
});

describe('simplify', () => {
  it('bir joyda turgan nuqtalarni tashlaydi', () => {
    // Svetoforda turgan mashina: 5 ta deyarli bir xil nuqta
    const stuck: LatLng[] = [
      { lat: 41.3111, lng: 69.2797 },
      { lat: 41.31111, lng: 69.27971 },
      { lat: 41.31112, lng: 69.27972 },
      { lat: 41.31111, lng: 69.27971 },
      { lat: 41.3111, lng: 69.2797 },
    ];
    expect(simplify(stuck)).toHaveLength(2); // birinchi va oxirgi
  });

  it('haqiqiy harakatni saqlaydi', () => {
    const moving: LatLng[] = [
      { lat: 41.3, lng: 69.2 },
      { lat: 41.4, lng: 69.3 },
      { lat: 41.5, lng: 69.4 },
    ];
    expect(simplify(moving)).toHaveLength(3);
  });

  it('ikkitadan kam nuqtani oʻzgartirmaydi', () => {
    expect(simplify([])).toEqual([]);
    expect(simplify([{ lat: 1, lng: 2 }])).toHaveLength(1);
  });

  it('birinchi va oxirgi nuqta doim qoladi', () => {
    const points: LatLng[] = Array.from({ length: 20 }, () => ({
      lat: 41.3111,
      lng: 69.2797,
    }));
    points[19] = { lat: 41.9, lng: 69.9 };

    const result = simplify(points);
    expect(result[0]).toEqual(points[0]);
    expect(result[result.length - 1]).toEqual(points[19]);
  });
});

describe('haversineKm', () => {
  it('Toshkent — Samarqand taxminan 270 km', () => {
    const distance = haversineKm({ lat: 41.3111, lng: 69.2797 }, { lat: 39.6542, lng: 66.9597 });
    expect(distance).toBeGreaterThan(250);
    expect(distance).toBeLessThan(290);
  });

  it('bir xil nuqta — nol', () => {
    expect(haversineKm({ lat: 41.3, lng: 69.2 }, { lat: 41.3, lng: 69.2 })).toBe(0);
  });

  it('simmetrik', () => {
    const a = { lat: 41.3, lng: 69.2 };
    const b = { lat: 39.6, lng: 66.9 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 9);
  });
});

describe('trackLengthKm', () => {
  it('bosqichlar yigʻindisi', () => {
    const a = { lat: 41.3, lng: 69.2 };
    const b = { lat: 41.4, lng: 69.3 };
    const c = { lat: 41.5, lng: 69.4 };

    expect(trackLengthKm([a, b, c])).toBeCloseTo(haversineKm(a, b) + haversineKm(b, c), 6);
  });

  it('bitta yoki nol nuqta — nol', () => {
    expect(trackLengthKm([])).toBe(0);
    expect(trackLengthKm([{ lat: 41, lng: 69 }])).toBe(0);
  });
});
