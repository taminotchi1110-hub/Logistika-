import {
  DEFAULT_WEIGHTS,
  PREMIUM_BONUS_POINTS,
  capacityFitScore,
  historyScore,
  priceFitScore,
  proximityScore,
  rankCandidates,
  ratingScore,
  reliabilityScore,
  resolveWeights,
  routeFitScore,
  scoreCandidate,
  type DriverCandidate,
  type LoadContext,
  type MatchWeights,
} from './match-score';

const load: LoadContext = {
  weightKg: 4000,
  volumeM3: 20,
  priceTiyin: 200_000_000,
  suggestedPriceTiyin: 200_000_000,
  maxRadiusKm: 200,
};

const candidate = (over: Partial<DriverCandidate> = {}): DriverCandidate => ({
  driverId: 'd1',
  vehicleId: 'v1',
  distanceToPickupKm: 15,
  routeMatch: 'EXACT',
  capacityKg: 5000,
  volumeM3: 25,
  ratingAvg: 4.5,
  ratingCount: 10,
  completedOrders: 10,
  onTimeRate: 0.9,
  responseRate: 0.8,
  cancelRate90d: 0.05,
  isPremium: false,
  ...over,
});

describe('proximityScore', () => {
  it('10 km gacha toʻliq ball beradi', () => {
    expect(proximityScore(0, 200)).toBe(1);
    expect(proximityScore(10, 200)).toBe(1);
  });

  it('masofa oshgani sari pasayadi', () => {
    const near = proximityScore(20, 200);
    const far = proximityScore(150, 200);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
  });

  it('radius chegarasida nolga tushadi', () => {
    expect(proximityScore(200, 200)).toBe(0);
    expect(proximityScore(500, 200)).toBe(0);
  });

  it('joylashuv nomaʼlum boʻlsa past, lekin nol emas', () => {
    const unknown = proximityScore(null, 200);
    expect(unknown).toBeGreaterThan(0);
    expect(unknown).toBeLessThan(1);
  });
});

describe('routeFitScore', () => {
  it('doimiy toʻliq yoʻnalish eng yuqori', () => {
    expect(routeFitScore('REGULAR_EXACT')).toBe(1);
  });

  it('tartib kuchlidan zaifga', () => {
    const order = [
      routeFitScore('REGULAR_EXACT'),
      routeFitScore('EXACT'),
      routeFitScore('FROM_ANY'),
      routeFitScore('FROM_ONLY'),
      routeFitScore('TO_ONLY'),
      routeFitScore('HOME_REGION'),
      routeFitScore('NONE'),
    ];
    const sorted = [...order].sort((a, b) => b - a);
    expect(order).toEqual(sorted);
  });
});

describe('capacityFitScore', () => {
  it('quvvatdan yaxshi foydalanilsa toʻliq ball', () => {
    expect(capacityFitScore(load, candidate({ capacityKg: 5000 }))).toBe(1);
  });

  it('juda katta transport past ball oladi', () => {
    const big = capacityFitScore(load, candidate({ capacityKg: 40_000, volumeM3: 90 }));
    const right = capacityFitScore(load, candidate({ capacityKg: 5000, volumeM3: 25 }));
    expect(big).toBeLessThan(right);
  });

  it('hajm ham hisobga olinadi — ikkalasining kichigi', () => {
    // Ogʻirlik boʻyicha zoʻr, hajm boʻyicha juda katta
    const score = capacityFitScore(load, candidate({ capacityKg: 5000, volumeM3: 120 }));
    expect(score).toBeLessThan(1);
  });

  it('sigʻmasa nol', () => {
    expect(capacityFitScore(load, candidate({ capacityKg: 1000, volumeM3: null }))).toBe(0);
  });

  it('hajm koʻrsatilmagan boʻlsa faqat ogʻirlik boʻyicha', () => {
    const withoutVolume: LoadContext = { ...load, volumeM3: null };
    expect(capacityFitScore(withoutVolume, candidate({ volumeM3: 999 }))).toBe(1);
  });
});

describe('ratingScore', () => {
  it('tajribali yuqori reyting yangi haydovchidan yuqori', () => {
    const proven = ratingScore(4.8, 200);
    const newbie = ratingScore(5, 1);
    expect(proven).toBeGreaterThan(newbie);
  });

  it('reytingsiz haydovchi neytral qiymat oladi', () => {
    const none = ratingScore(0, 0);
    expect(none).toBeCloseTo(4.3 / 5, 5);
  });

  it('0..1 oraligʻidan chiqmaydi', () => {
    expect(ratingScore(5, 1000)).toBeLessThanOrEqual(1);
    expect(ratingScore(0, 1000)).toBeGreaterThanOrEqual(0);
  });
});

describe('priceFitScore', () => {
  it('tavsiyadan yuqori narx — toʻliq ball', () => {
    expect(priceFitScore({ ...load, priceTiyin: 240_000_000 })).toBe(1);
  });

  it('juda past narx — nol', () => {
    expect(priceFitScore({ ...load, priceTiyin: 100_000_000 })).toBe(0);
  });

  it('kelishuv asosida — neytraldan yuqori', () => {
    expect(priceFitScore({ ...load, priceTiyin: null })).toBeGreaterThan(0.5);
  });

  it('tavsiya narx nomaʼlum boʻlsa neytral', () => {
    expect(priceFitScore({ ...load, suggestedPriceTiyin: null })).toBe(0.6);
  });
});

describe('reliabilityScore', () => {
  it('yangi haydovchi neytralga yaqin', () => {
    const fresh = reliabilityScore(
      candidate({ completedOrders: 0, onTimeRate: 0, responseRate: 0, cancelRate90d: 0 }),
    );
    expect(fresh).toBeGreaterThan(0.4);
    expect(fresh).toBeLessThan(0.7);
  });

  it('koʻp bekor qilgan haydovchi past ball oladi', () => {
    const good = reliabilityScore(candidate({ completedOrders: 100, cancelRate90d: 0 }));
    const bad = reliabilityScore(candidate({ completedOrders: 100, cancelRate90d: 0.5 }));
    expect(bad).toBeLessThan(good);
  });
});

describe('historyScore', () => {
  it('buyurtmasiz haydovchi nol', () => {
    expect(historyScore(0)).toBe(0);
  });

  it('50 buyurtmada toʻliq ball', () => {
    expect(historyScore(50)).toBeCloseTo(1, 5);
  });

  it('logarifmik — dastlabki buyurtmalar koʻproq beradi', () => {
    const firstFive = historyScore(5) - historyScore(0);
    const lastFive = historyScore(50) - historyScore(45);
    expect(firstFive).toBeGreaterThan(lastFive);
  });
});

describe('scoreCandidate', () => {
  it('ball 0..100 oraligʻida', () => {
    const result = scoreCandidate(load, candidate());
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('ideal nomzod deyarli 100 ball oladi', () => {
    const perfect = scoreCandidate(
      load,
      candidate({
        distanceToPickupKm: 2,
        routeMatch: 'REGULAR_EXACT',
        capacityKg: 5000,
        volumeM3: 25,
        ratingAvg: 5,
        ratingCount: 300,
        completedOrders: 300,
        onTimeRate: 1,
        responseRate: 1,
        cancelRate90d: 0,
      }),
    );
    expect(perfect.score).toBeGreaterThan(95);
  });

  it('premium bonus qoʻshadi, lekin 100 dan oshirmaydi', () => {
    const base = candidate({ distanceToPickupKm: 40, routeMatch: 'FROM_ONLY' });
    const plain = scoreCandidate(load, base);
    const premium = scoreCandidate(load, { ...base, isPremium: true });

    expect(premium.score - plain.score).toBeCloseTo(PREMIUM_BONUS_POINTS, 1);

    const best = candidate({
      distanceToPickupKm: 0,
      routeMatch: 'REGULAR_EXACT',
      ratingAvg: 5,
      ratingCount: 500,
      completedOrders: 500,
      onTimeRate: 1,
      responseRate: 1,
      cancelRate90d: 0,
      isPremium: true,
    });
    expect(scoreCandidate({ ...load, priceTiyin: 300_000_000 }, best).score).toBe(100);
  });

  it('ogʻirliklar yigʻindisi 1 boʻlmasa ham 0..100 dan chiqmaydi', () => {
    const broken: MatchWeights = { ...DEFAULT_WEIGHTS, proximity: 10 };
    const result = scoreCandidate(load, candidate(), broken);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('barcha ogʻirliklar nol boʻlsa yiqilmaydi', () => {
    const zero: MatchWeights = {
      proximity: 0,
      routeFit: 0,
      capacityFit: 0,
      rating: 0,
      priceFit: 0,
      reliability: 0,
      history: 0,
    };
    expect(scoreCandidate(load, candidate(), zero).score).toBe(0);
  });

  // Aynan shu xato bir marta sodir bo'lgan: bazadagi `route_fit` kaliti
  // `routeFit` ga aylanib, kod uni topa olmagan va BARCHA ballar 0 bo'lgan
  it('yetishmagan ogʻirlik butun ballni yoʻqotmaydi', () => {
    const partial = { proximity: 0.28 } as Partial<MatchWeights>;
    const result = scoreCandidate(load, candidate(), partial);
    expect(result.score).toBeGreaterThan(0);
  });

  it('notoʻgʻri turdagi ogʻirlik eʼtiborsiz qoldiriladi', () => {
    const broken = { routeFit: 'juda-muhim' } as unknown as Partial<MatchWeights>;
    expect(scoreCandidate(load, candidate(), broken).score).toBeGreaterThan(0);
  });
});

describe('resolveWeights', () => {
  it('boʻsh sozlamada standart qiymatlar', () => {
    expect(resolveWeights(undefined)).toEqual(DEFAULT_WEIGHTS);
    expect(resolveWeights({})).toEqual(DEFAULT_WEIGHTS);
  });

  it('berilgan qiymat ustun turadi', () => {
    expect(resolveWeights({ proximity: 0.5 }).proximity).toBe(0.5);
  });

  it('nol — haqiqiy qiymat, standartga qaytmaydi', () => {
    expect(resolveWeights({ proximity: 0 }).proximity).toBe(0);
  });

  it('manfiy va NaN qiymatlar rad etiladi', () => {
    expect(resolveWeights({ proximity: -1 }).proximity).toBe(DEFAULT_WEIGHTS.proximity);
    expect(resolveWeights({ rating: Number.NaN }).rating).toBe(DEFAULT_WEIGHTS.rating);
  });

  it('sabablarni tushuntiradi', () => {
    const result = scoreCandidate(
      load,
      candidate({ distanceToPickupKm: 12, routeMatch: 'REGULAR_EXACT' }),
    );
    expect(result.reasons).toContain('REGULAR_ROUTE');
    // Masofa parametr sifatida — matnni mobil ilova oʻz tilida yasaydi
    expect(result.reasons).toContain('NEAR_PICKUP:12');
    // Tayyor jumla QAYTMASLIGI kerak: u faqat oʻzbekcha boʻlardi
    expect(result.reasons.every((reason) => /^[A-Z_]+(:[\d.]+)?$/.test(reason))).toBe(true);
  });

  it('versiya yoziladi', () => {
    expect(scoreCandidate(load, candidate()).weightsVersion).toBe('v1');
  });
});

describe('rankCandidates', () => {
  it('ball boʻyicha kamayish tartibida', () => {
    const ranked = rankCandidates(load, [
      candidate({ driverId: 'uzoq', distanceToPickupKm: 180, routeMatch: 'NONE' }),
      candidate({ driverId: 'yaqin', distanceToPickupKm: 5, routeMatch: 'REGULAR_EXACT' }),
      candidate({ driverId: 'ortacha', distanceToPickupKm: 60, routeMatch: 'FROM_ONLY' }),
    ]);

    expect(ranked.map((r) => r.driverId)).toEqual(['yaqin', 'ortacha', 'uzoq']);
  });

  it('teng ballda yaqinrogʻi oldinda', () => {
    const base = { routeMatch: 'EXACT' as const, ratingCount: 0, completedOrders: 0 };
    const ranked = rankCandidates(load, [
      candidate({ driverId: 'b', distanceToPickupKm: 10, ...base }),
      candidate({ driverId: 'a', distanceToPickupKm: 5, ...base }),
    ]);
    expect(ranked[0].driverId).toBe('a');
  });

  it('bir xil kirishda natija barqaror', () => {
    const input = [
      candidate({ driverId: 'x' }),
      candidate({ driverId: 'y' }),
      candidate({ driverId: 'z' }),
    ];
    const first = rankCandidates(load, input).map((r) => r.driverId);
    const second = rankCandidates(load, [...input].reverse()).map((r) => r.driverId);
    expect(first).toEqual(second);
  });

  it('boʻsh roʻyxatda boʻsh natija', () => {
    expect(rankCandidates(load, [])).toEqual([]);
  });
});
