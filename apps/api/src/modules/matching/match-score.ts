/**
 * Match Score — yuk va haydovchi mosligini 0..100 ball bilan baholaydi.
 *
 * NEGA SOF FUNKSIYA: bu platformaning eng muhim biznes mantig'i. U bazaga
 * ham, tarmoqqa ham tegmaydi — shuning uchun to'liq unit-test qilinadi va
 * kelajakda ML modelga almashtirilganda interfeys o'zgarmaydi.
 *
 * OG'IRLIKLAR `platform_settings` da (`matching.weights`) saqlanadi va
 * admin panelidan o'zgartiriladi — kodni qayta yig'ish shart emas. Har bir
 * natijada `weightsVersion` yoziladi, shuning uchun eski natijalar qaysi
 * og'irliklar bilan hisoblanganini keyin ham bilib olamiz (ML uchun muhim).
 */

/** Ballning tarkibiy qismlari — hammasi 0..1 oralig'ida. */
export interface ScoreComponents {
  /** Haydovchi olish nuqtasiga qanchalik yaqin. */
  proximity: number;
  /** Yuk haydovchining doimiy yo'nalishiga tushadimi. */
  routeFit: number;
  /** Transport quvvati yukka qanchalik mos (juda katta fura ham yomon). */
  capacityFit: number;
  /** Reyting (yangi haydovchilar uchun tekislangan). */
  rating: number;
  /** Narx haydovchi uchun jozibalimi. */
  priceFit: number;
  /** Ishonchlilik: vaqtida yetkazish, javob berish, bekor qilmaslik. */
  reliability: number;
  /** Tajriba: yakunlangan buyurtmalar soni. */
  history: number;
}

/**
 * Ogʻirliklar kalitlari — ScoreComponents bilan bir xil (camelCase).
 *
 * MUHIM: bazada ham AYNAN shu kalitlar saqlanadi. Kysely'ning
 * `CamelCasePlugin` faqat ustun nomlarini emas, JSONB QIYMATI ICHIDAGI
 * kalitlarni ham camelCase ga oʻgiradi. Shuning uchun bazada `route_fit`
 * saqlansa, kod uni `undefined` deb oʻqiydi va barcha ballar 0 boʻlib
 * qoladi. Aynan shu xato bir marta sodir boʻlgan — batafsil:
 * docs/05-database.md §5.6 va migratsiya 0002.
 */
export type MatchWeights = Record<keyof ScoreComponents, number>;

export const DEFAULT_WEIGHTS: MatchWeights = {
  proximity: 0.28,
  routeFit: 0.2,
  capacityFit: 0.14,
  rating: 0.14,
  priceFit: 0.1,
  reliability: 0.08,
  history: 0.06,
};

/**
 * Og'irliklar versiyasi. O'zgartirilganda YANGI qiymat qo'yiladi —
 * `load_matches.weights_version` orqali eski natijalarni ajratamiz.
 */
export const WEIGHTS_VERSION = 'v1';

/** Premium haydovchiga qo'shiladigan ball (monetizatsiya: "matchingda ustuvorlik"). */
export const PREMIUM_BONUS_POINTS = 3;

/**
 * Reyting uchun Bayes tekislash: bitta 5★ olgan yangi haydovchi 200 ta
 * buyurtmada 4.8 ball to'plagan haydovchidan yuqori turmasligi kerak.
 */
const RATING_PRIOR_MEAN = 4.3;
const RATING_PRIOR_WEIGHT = 5;

/** Ishonchlilik ko'rsatkichlari yangi haydovchida 0 bo'ladi — neytralga tortamiz. */
const RELIABILITY_PRIOR = 0.6;
const RELIABILITY_PRIOR_WEIGHT = 5;

/** Shu songa yetgan haydovchi tajriba bo'yicha maksimal ball oladi. */
const EXPERIENCE_FULL_AT = 50;

/** Bu masofagacha yaqinlik bo'yicha jarima yo'q. */
const PROXIMITY_FREE_KM = 10;

/** Joylashuvi noma'lum haydovchi — past, lekin nolga teng emas. */
const PROXIMITY_UNKNOWN = 0.35;

/** Quvvatdan shu ulushdan ko'p foydalanilsa — to'liq ball. */
const CAPACITY_IDEAL_UTILIZATION = 0.6;

export interface DriverCandidate {
  driverId: string;
  vehicleId: string;

  /** Olish nuqtasigacha masofa (km). Joylashuv noma'lum bo'lsa `null`. */
  distanceToPickupKm: number | null;

  /** Yo'nalish mosligi — `routeFitScore()` bilan oldindan hisoblanadi. */
  routeMatch: RouteMatchKind;

  /** Transport quvvati (tirkama bilan, kg) va hajmi (m³). */
  capacityKg: number;
  volumeM3: number | null;

  ratingAvg: number;
  ratingCount: number;
  completedOrders: number;

  onTimeRate: number;
  responseRate: number;
  cancelRate90d: number;

  isPremium: boolean;
}

export interface LoadContext {
  weightKg: number;
  volumeM3: number | null;
  /** E'lon narxi (tiyin). "Kelishuv asosida" bo'lsa `null`. */
  priceTiyin: number | null;
  /** Tarif bo'yicha tavsiya narx — narx jozibadorligini shunga solishtiramiz. */
  suggestedPriceTiyin: number | null;
  /** Qidiruv radiusining eng katta qadami (km). */
  maxRadiusKm: number;
}

/** Yo'nalish mosligining turlari — eng kuchlisidan eng zaifiga. */
export type RouteMatchKind =
  | 'REGULAR_EXACT' // doimiy yo'nalish, qayerdan va qayerga to'liq mos
  | 'EXACT' // qayerdan va qayerga mos
  | 'FROM_ANY' // qayerdan mos, "istalgan joyga"
  | 'FROM_ONLY' // faqat jo'nash viloyati mos
  | 'TO_ONLY' // faqat yetkazish viloyati mos
  | 'HOME_REGION' // yo'nalish yo'q, lekin bazasi shu viloyatda
  | 'NONE';

const ROUTE_FIT_SCORE: Record<RouteMatchKind, number> = {
  REGULAR_EXACT: 1,
  EXACT: 0.9,
  FROM_ANY: 0.75,
  FROM_ONLY: 0.55,
  TO_ONLY: 0.45,
  HOME_REGION: 0.4,
  NONE: 0.15,
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * Yaqinlik: 10 km gacha to'liq ball, keyin radiusning oxirigacha chiziqli
 * pasayadi. Radiusdan tashqarida 0 (lekin hard filter bunday haydovchini
 * odatda umuman qaytarmaydi).
 */
export function proximityScore(distanceKm: number | null, maxRadiusKm: number): number {
  if (distanceKm === null) return PROXIMITY_UNKNOWN;
  if (distanceKm <= PROXIMITY_FREE_KM) return 1;
  if (maxRadiusKm <= PROXIMITY_FREE_KM) return 0;

  return clamp01(1 - (distanceKm - PROXIMITY_FREE_KM) / (maxRadiusKm - PROXIMITY_FREE_KM));
}

export function routeFitScore(match: RouteMatchKind): number {
  return ROUTE_FIT_SCORE[match];
}

/**
 * Quvvat mosligi.
 *
 * NEGA "KATTA TRANSPORT — YOMON": 500 kg yukni 20 tonnalik furada
 * tashish ikkala tomon uchun ham zarar. Haydovchi yoqilg'iga ko'p
 * sarflaydi, mijoz esa kichik mashina narxidan qimmatga tushadi.
 * Shuning uchun quvvatdan foydalanish ulushi past bo'lsa ball tushadi.
 *
 * Hajm ko'rsatilgan bo'lsa — og'irlik va hajm ballarining KICHIGI olinadi:
 * ikkalasi ham mos bo'lishi shart.
 */
export function capacityFitScore(load: LoadContext, candidate: DriverCandidate): number {
  const byWeight = utilizationScore(load.weightKg, candidate.capacityKg);

  if (load.volumeM3 === null || candidate.volumeM3 === null || candidate.volumeM3 <= 0) {
    return byWeight;
  }

  return Math.min(byWeight, utilizationScore(load.volumeM3, candidate.volumeM3));
}

function utilizationScore(needed: number, available: number): number {
  if (available <= 0) return 0;

  const utilization = needed / available;
  if (utilization > 1) return 0; // sig'maydi — hard filter buni ushlashi kerak
  if (utilization >= CAPACITY_IDEAL_UTILIZATION) return 1;

  // 0% → 0.5, 60% → 1.0 (chiziqli)
  return 0.5 + (utilization / CAPACITY_IDEAL_UTILIZATION) * 0.5;
}

/** Bayes tekislangan reyting, 0..1 ga keltirilgan. */
export function ratingScore(ratingAvg: number, ratingCount: number): number {
  const smoothed =
    (ratingAvg * ratingCount + RATING_PRIOR_MEAN * RATING_PRIOR_WEIGHT) /
    (ratingCount + RATING_PRIOR_WEIGHT);

  return clamp01(smoothed / 5);
}

/**
 * Narx jozibadorligi.
 *
 * Tavsiya narxdan yuqori e'lonlar haydovchi uchun jozibaliroq. Bu ball
 * barcha nomzodlar uchun bir xil — ya'ni tartibga ta'sir qilmaydi, lekin
 * umumiy ballga ta'sir qiladi. Bu ataylab: past narxli e'lon
 * `matching.min_score_for_push` chegarasidan o'tmasligi va bekorga
 * push yubormasligi kerak.
 */
export function priceFitScore(load: LoadContext): number {
  // "Kelishuv asosida" — haydovchi o'z narxini taklif qiladi, cheklov yo'q
  if (load.priceTiyin === null) return 0.7;
  if (load.suggestedPriceTiyin === null || load.suggestedPriceTiyin <= 0) return 0.6;

  const ratio = load.priceTiyin / load.suggestedPriceTiyin;

  if (ratio >= 1.1) return 1;
  if (ratio <= 0.6) return 0;

  // 0.6 → 0, 1.1 → 1 (chiziqli)
  return clamp01((ratio - 0.6) / 0.5);
}

/**
 * Ishonchlilik. Yangi haydovchida barcha ko'rsatkich 0 bo'ladi —
 * shuning uchun tajribasi oshgani sari haqiqiy qiymatlarga o'tamiz.
 */
export function reliabilityScore(candidate: DriverCandidate): number {
  const raw =
    candidate.onTimeRate * 0.5 +
    candidate.responseRate * 0.3 +
    (1 - candidate.cancelRate90d) * 0.2;

  const weight = candidate.completedOrders;
  const smoothed =
    (raw * weight + RELIABILITY_PRIOR * RELIABILITY_PRIOR_WEIGHT) /
    (weight + RELIABILITY_PRIOR_WEIGHT);

  return clamp01(smoothed);
}

/** Tajriba: logarifmik — 5 dan 10 ga o'sish 45 dan 50 ga o'sishdan muhimroq. */
export function historyScore(completedOrders: number): number {
  if (completedOrders <= 0) return 0;

  return clamp01(Math.log10(1 + completedOrders) / Math.log10(1 + EXPERIENCE_FULL_AT));
}

export interface ScoredCandidate {
  driverId: string;
  vehicleId: string;
  /** 0.00 .. 100.00 */
  score: number;
  components: ScoreComponents;
  distanceToPickupKm: number | null;
  weightsVersion: string;
  /** Foydalanuvchiga ko'rsatiladigan sabablar ("Sizning yo'nalishingiz"). */
  reasons: string[];
}

/**
 * Og'irliklarni tozalaydi: yetishmagan yoki son bo'lmagan kalit o'rniga
 * standart qiymat qo'yiladi.
 *
 * NEGA: og'irliklar admin panelidan yoki bazadan keladi. Bitta kalit
 * yozilmay qolsa `undefined` bilan ko'paytirish NaN beradi va BARCHA
 * ballar 0 bo'lib qoladi — matching jimgina ishlamay qo'yadi. Bir marta
 * aynan shunday bo'lgan (migratsiya 0002). Endi noto'g'ri sozlama
 * eng yomoni bitta komponentni standart holatga qaytaradi, xolos.
 */
export function resolveWeights(weights: Partial<MatchWeights> | null | undefined): MatchWeights {
  const resolved = { ...DEFAULT_WEIGHTS };

  for (const key of Object.keys(DEFAULT_WEIGHTS) as (keyof MatchWeights)[]) {
    const value = weights?.[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      resolved[key] = value;
    }
  }

  return resolved;
}

/** Bitta nomzodni baholaydi. */
export function scoreCandidate(
  load: LoadContext,
  candidate: DriverCandidate,
  rawWeights: Partial<MatchWeights> = DEFAULT_WEIGHTS,
): ScoredCandidate {
  const weights = resolveWeights(rawWeights);

  const components: ScoreComponents = {
    proximity: proximityScore(candidate.distanceToPickupKm, load.maxRadiusKm),
    routeFit: routeFitScore(candidate.routeMatch),
    capacityFit: capacityFitScore(load, candidate),
    rating: ratingScore(candidate.ratingAvg, candidate.ratingCount),
    priceFit: priceFitScore(load),
    reliability: reliabilityScore(candidate),
    history: historyScore(candidate.completedOrders),
  };

  const weighted =
    components.proximity * weights.proximity +
    components.routeFit * weights.routeFit +
    components.capacityFit * weights.capacityFit +
    components.rating * weights.rating +
    components.priceFit * weights.priceFit +
    components.reliability * weights.reliability +
    components.history * weights.history;

  const totalWeight =
    weights.proximity +
    weights.routeFit +
    weights.capacityFit +
    weights.rating +
    weights.priceFit +
    weights.reliability +
    weights.history;

  // Og'irliklar yig'indisi 1 bo'lmasa ham natija 0..100 bo'lib qolsin —
  // admin panelidan noto'g'ri qiymat kiritilishi mumkin
  const normalized = totalWeight > 0 ? weighted / totalWeight : 0;
  const bonus = candidate.isPremium ? PREMIUM_BONUS_POINTS : 0;
  const score = Math.min(100, Math.round((normalized * 100 + bonus) * 100) / 100);

  return {
    driverId: candidate.driverId,
    vehicleId: candidate.vehicleId,
    score,
    components,
    distanceToPickupKm: candidate.distanceToPickupKm,
    weightsVersion: WEIGHTS_VERSION,
    reasons: buildReasons(candidate, components),
  };
}

/** Barcha nomzodlarni baholab, ball bo'yicha tartiblaydi. */
export function rankCandidates(
  load: LoadContext,
  candidates: DriverCandidate[],
  weights: Partial<MatchWeights> = DEFAULT_WEIGHTS,
): ScoredCandidate[] {
  return candidates
    .map((candidate) => scoreCandidate(load, candidate, weights))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Teng ballda yaqinrog'i oldinda; masofasi noma'lum bo'lganlar oxirida
      const da = a.distanceToPickupKm ?? Number.POSITIVE_INFINITY;
      const db = b.distanceToPickupKm ?? Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
      // Barqaror tartib — bir xil kirishda natija ham bir xil bo'lsin
      return a.driverId.localeCompare(b.driverId);
    });
}

/**
 * Ball nima uchun yuqori bo'lganini tushuntiradi.
 *
 * NEGA KERAK: "93%" raqamining o'zi ishonch uygotmaydi. Haydovchi
 * "Sizga 12 km, doimiy yo'nalishingiz" deb ko'rsa, tavsiyaga ishonadi.
 */
function buildReasons(candidate: DriverCandidate, components: ScoreComponents): string[] {
  const reasons: string[] = [];

  if (candidate.distanceToPickupKm !== null && candidate.distanceToPickupKm <= 25) {
    reasons.push(`Sizga ${Math.round(candidate.distanceToPickupKm)} km`);
  }
  if (candidate.routeMatch === 'REGULAR_EXACT') {
    reasons.push('Doimiy yoʻnalishingiz');
  } else if (candidate.routeMatch === 'EXACT' || candidate.routeMatch === 'FROM_ANY') {
    reasons.push('Yoʻnalishingizga mos');
  }
  if (components.capacityFit >= 0.95) {
    reasons.push('Transportingizga toʻliq mos');
  }
  if (candidate.ratingCount >= 5 && candidate.ratingAvg >= 4.5) {
    reasons.push(`Reytingingiz ${candidate.ratingAvg.toFixed(1)}`);
  }
  if (candidate.isPremium) {
    reasons.push('Premium');
  }

  return reasons;
}
