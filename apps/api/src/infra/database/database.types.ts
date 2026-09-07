/**
 * Kysely uchun ma'lumotlar bazasi tiplari.
 *
 * MUHIM: bu fayl `db/migrations/*.sql` ning TS aksi. SQL — yagona haqiqat manbai,
 * bu yerda esa faqat kod ishlatadigan jadvallar tavsiflanadi. Har bir modul
 * o'z jadvallarini shu faylga qo'shib boradi (2-bosqichda: auth + spravochnik).
 *
 * `CamelCasePlugin` yoqilgan, shuning uchun bu yerda kamel-case yoziladi,
 * SQL'ga esa snake_case bo'lib tushadi: `createdAt` → `created_at`.
 */
import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

/** Bazada avtomatik to'ladigan, hech qachon qo'lda yozilmaydigan timestamp. */
type CreatedAt = ColumnType<Date, Date | string | undefined, never>;
/** Trigger yangilaydigan timestamp — INSERT/UPDATE'da ixtiyoriy. */
type UpdatedAt = ColumnType<Date, Date | string | undefined, Date | string | undefined>;

// ---------------------------------------------------------------- enumlar
export type UserRole = 'SHIPPER' | 'DRIVER' | 'BOTH';
export type UserStatus = 'PENDING_PROFILE' | 'ACTIVE' | 'SUSPENDED' | 'BANNED' | 'DELETED';
export type VerificationStatus = 'NOT_SUBMITTED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
export type DriverAvailability = 'AVAILABLE' | 'BUSY' | 'OFFLINE';
export type LangCode = 'uz' | 'ru' | 'en';

// ---------------------------------------------------------------- users
export interface UsersTable {
  id: Generated<string>;
  phone: string;
  phoneVerifiedAt: Date | null;
  role: Generated<UserRole>;
  status: Generated<UserStatus>;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  birthDate: ColumnType<Date, Date | string | null, Date | string | null> | null;
  avatarKey: string | null;
  lang: Generated<LangCode>;
  email: string | null;
  passportNumberEnc: Buffer | null;
  pinflEnc: Buffer | null;
  ratingAvg: Generated<string>; // NUMERIC → pg drayveri string qaytaradi (aniqlik yo'qolmasin)
  ratingCount: Generated<number>;
  completedOrders: Generated<number>;
  cancelledOrders: Generated<number>;
  tokenVersion: Generated<number>;
  referralCode: string | null;
  referredBy: string | null;
  lastSeenAt: Date | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
  deletedAt: Date | null;
}

// ---------------------------------------------------------------- otp
export interface OtpRequestsTable {
  id: Generated<string>; // BIGSERIAL → pg drayveri bigint'ni string qaytaradi
  phone: string;
  codeHash: string;
  purpose: Generated<string>;
  attempts: Generated<number>;
  consumedAt: Date | null;
  ip: string | null;
  expiresAt: Date | string;
  createdAt: CreatedAt;
}

// ---------------------------------------------------------------- sessiyalar
export interface UserSessionsTable {
  id: Generated<string>;
  userId: string;
  refreshTokenHash: string;
  deviceId: string | null;
  platform: string | null;
  appVersion: string | null;
  ip: string | null;
  userAgent: string | null;
  revokedAt: Date | null;
  replacedBy: string | null;
  expiresAt: Date | string;
  createdAt: CreatedAt;
  lastUsedAt: Date | null;
}

// ---------------------------------------------------------------- qurilmalar
export interface DevicesTable {
  id: Generated<string>;
  userId: string;
  fcmToken: string;
  deviceId: string;
  platform: string;
  isActive: Generated<boolean>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

// ---------------------------------------------------------------- login tarixi
export interface LoginHistoryTable {
  id: Generated<string>;
  userId: string | null;
  phone: string | null;
  success: boolean;
  failReason: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: CreatedAt;
}

// ---------------------------------------------------------------- profillar
export interface ShipperProfilesTable {
  userId: string;
  companyId: string | null;
  defaultRegionId: number | null;
  totalLoads: Generated<number>;
  totalSpentTiyin: Generated<string>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface DriverProfilesTable {
  userId: string;
  companyId: string | null;
  licenseNumberEnc: Buffer | null;
  licenseCategories: string | null;
  licenseExpiresAt: ColumnType<Date, Date | string | null, Date | string | null> | null;
  experienceYears: number | null;
  verificationStatus: Generated<VerificationStatus>;
  verifiedAt: Date | null;
  verifiedBy: string | null;
  rejectionReason: string | null;
  availability: Generated<DriverAvailability>;
  homeRegionId: number | null;
  currentGeomAt: Date | null;
  acceptsIntercity: Generated<boolean>;
  acceptsInternational: Generated<boolean>;
  responseRate: Generated<string>;
  avgResponseSec: number | null;
  cancelRate90d: Generated<string>;
  onTimeRate: Generated<string>;
  totalDistanceKm: Generated<string>;
  totalEarnedTiyin: Generated<string>;
  isPremium: Generated<boolean>;
  premiumUntil: Date | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
  // Eslatma: `current_geom` (geography) bu yerda ataylab yo'q —
  // geo maydonlar bilan faqat xom SQL orqali ishlanadi (PostGIS funksiyalari).
}

// ---------------------------------------------------------------- spravochnik
export interface RegionsTable {
  id: Generated<number>;
  code: string;
  nameUz: string;
  nameRu: string;
  nameEn: string;
  sortOrder: Generated<number>;
}

export interface DistrictsTable {
  id: Generated<number>;
  regionId: number;
  nameUz: string;
  nameRu: string;
  nameEn: string;
}

export interface VehicleTypesTable {
  id: Generated<number>;
  code: string;
  nameUz: string;
  nameRu: string;
  nameEn: string;
  minCapacityKg: number;
  maxCapacityKg: number;
  typicalVolumeM3: string | null;
  iconKey: string | null;
  sortOrder: Generated<number>;
  isActive: Generated<boolean>;
}

export interface BodyTypesTable {
  id: Generated<number>;
  code: string;
  nameUz: string;
  nameRu: string;
  nameEn: string;
  isTemperatureControlled: Generated<boolean>;
  isActive: Generated<boolean>;
}

export interface CargoCategoriesTable {
  id: Generated<number>;
  code: string;
  nameUz: string;
  nameRu: string;
  nameEn: string;
  requiresSpecialPermit: Generated<boolean>;
  parentId: number | null;
  iconKey: string | null;
  isActive: Generated<boolean>;
}

export interface SpecialRequirementsTable {
  id: Generated<number>;
  code: string;
  nameUz: string;
  nameRu: string;
  nameEn: string;
  extraCostHintTiyin: string | null;
}

// ---------------------------------------------------------------- transport
export interface VehiclesTable {
  id: Generated<string>;
  driverId: string;
  companyId: string | null;
  vehicleTypeId: number;
  bodyTypeId: number;
  brand: string;
  model: string;
  year: number | null;
  plateNumber: string;
  color: string | null;
  capacityKg: number;
  volumeM3: string;
  lengthM: string | null;
  widthM: string | null;
  heightM: string | null;
  hasTrailer: Generated<boolean>;
  trailerCapacityKg: number | null;
  trailerVolumeM3: string | null;
  hasHydroBoard: Generated<boolean>;
  hasRamp: Generated<boolean>;
  tempMinC: number | null;
  tempMaxC: number | null;
  adrCertified: Generated<boolean>;
  insuranceExpiresAt: ColumnType<Date, Date | string | null, Date | string | null> | null;
  inspectionExpiresAt: ColumnType<Date, Date | string | null, Date | string | null> | null;
  verificationStatus: Generated<VerificationStatus>;
  isActive: Generated<boolean>;
  isPrimary: Generated<boolean>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
  deletedAt: Date | null;
}

export interface DriverRoutesTable {
  id: Generated<string>;
  driverId: string;
  fromRegionId: number;
  toRegionId: number | null;
  isRegular: Generated<boolean>;
  priority: Generated<number>;
  createdAt: CreatedAt;
}

// ---------------------------------------------------------------- manzillar
export interface SavedAddressesTable {
  id: Generated<string>;
  userId: string;
  label: string;
  addressText: string;
  regionId: number | null;
  districtId: number | null;
  contactName: string | null;
  contactPhone: string | null;
  notes: string | null;
  useCount: Generated<number>;
  createdAt: CreatedAt;
  // `geom` (geography) ataylab yoʻq — u faqat xom SQL orqali yoziladi/oʻqiladi
}

// ---------------------------------------------------------------- hujjatlar
export type DocumentType =
  | 'PASSPORT'
  | 'ID_CARD'
  | 'DRIVER_LICENSE'
  | 'VEHICLE_REG'
  | 'INSURANCE'
  | 'CARGO_DOC'
  | 'WAYBILL'
  | 'CONTRACT'
  | 'POD'
  | 'POP'
  | 'SIGNATURE'
  | 'OTHER';

export type OwnerType = 'USER' | 'DRIVER' | 'VEHICLE' | 'LOAD' | 'ORDER' | 'COMPANY';

export interface DocumentsTable {
  id: Generated<string>;
  ownerType: OwnerType;
  ownerId: string;
  type: DocumentType;
  fileKey: string;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  checksumSha256: string | null;
  pageSide: string | null;
  verificationStatus: Generated<VerificationStatus>;
  verifiedBy: string | null;
  verifiedAt: Date | null;
  rejectionReason: string | null;
  expiresAt: ColumnType<Date, Date | string | null, Date | string | null> | null;
  uploadedBy: string | null;
  createdAt: CreatedAt;
  deletedAt: Date | null;
}

// ---------------------------------------------------------------- yuk
export type LoadStatus =
  | 'DRAFT'
  | 'PUBLISHED'
  | 'MATCHING'
  | 'OFFERS_RECEIVED'
  | 'ASSIGNED'
  | 'EXPIRED'
  | 'CANCELLED';

export type PaymentMethod = 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'ESCROW';

export interface LoadsTable {
  id: Generated<string>;
  publicNo: Generated<string>;
  shipperId: string;
  companyId: string | null;
  status: Generated<LoadStatus>;

  title: string;
  description: string | null;
  categoryId: number;
  weightKg: number;
  volumeM3: string | null;
  packagesCount: number | null;
  packageType: string | null;
  isFragile: Generated<boolean>;
  tempMinC: number | null;
  tempMaxC: number | null;

  pickupAddress: string;
  pickupRegionId: number;
  pickupDistrictId: number | null;
  pickupContactName: string | null;
  pickupContactPhone: string | null;
  pickupFrom: Date | string;
  pickupTo: Date | string;

  deliveryAddress: string;
  deliveryRegionId: number;
  deliveryDistrictId: number | null;
  deliveryContactName: string | null;
  deliveryContactPhone: string | null;
  deliveryBy: Date | string | null;

  distanceKm: string | null;
  durationMin: number | null;
  routePolyline: string | null;

  requiredVehicleTypeIds: Generated<number[]>;
  requiredBodyTypeIds: Generated<number[]>;
  specialRequirementIds: Generated<number[]>;

  priceTiyin: string | null;
  isNegotiable: Generated<boolean>;
  paymentMethod: Generated<PaymentMethod>;
  suggestedPriceTiyin: string | null;

  isTop: Generated<boolean>;
  topUntil: Date | null;
  viewCount: Generated<number>;
  offerCount: Generated<number>;
  publishedAt: Date | null;
  expiresAt: Date | string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
  // `pickup_geom` / `delivery_geom` — faqat xom SQL orqali (PostGIS)
}

// ------------------------------------------------------- narx statistikasi
export interface RoutePriceStatsTable {
  id: Generated<string>;
  fromRegionId: number;
  toRegionId: number;
  vehicleTypeId: number;
  periodStart: ColumnType<Date, Date | string, Date | string>;
  ordersCount: number;
  medianPriceTiyin: string;
  p25PriceTiyin: string | null;
  p75PriceTiyin: string | null;
  avgPricePerKmTiyin: string | null;
  avgDistanceKm: string | null;
  computedAt: CreatedAt;
}

// ---------------------------------------------------------------- DB
export interface Database {
  users: UsersTable;
  otpRequests: OtpRequestsTable;
  userSessions: UserSessionsTable;
  devices: DevicesTable;
  loginHistory: LoginHistoryTable;
  shipperProfiles: ShipperProfilesTable;
  driverProfiles: DriverProfilesTable;
  regions: RegionsTable;
  districts: DistrictsTable;
  vehicleTypes: VehicleTypesTable;
  bodyTypes: BodyTypesTable;
  cargoCategories: CargoCategoriesTable;
  specialRequirements: SpecialRequirementsTable;
  vehicles: VehiclesTable;
  driverRoutes: DriverRoutesTable;
  savedAddresses: SavedAddressesTable;
  documents: DocumentsTable;
  loads: LoadsTable;
  routePriceStats: RoutePriceStatsTable;
}

// Qulay aliaslar
export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;

export type UserSession = Selectable<UserSessionsTable>;
export type OtpRequest = Selectable<OtpRequestsTable>;
export type DriverProfile = Selectable<DriverProfilesTable>;

export type Vehicle = Selectable<VehiclesTable>;
export type NewVehicle = Insertable<VehiclesTable>;
export type VehicleUpdate = Updateable<VehiclesTable>;

export type DocumentRow = Selectable<DocumentsTable>;
export type NewDocument = Insertable<DocumentsTable>;

export type Load = Selectable<LoadsTable>;
export type NewLoad = Insertable<LoadsTable>;
export type LoadUpdate = Updateable<LoadsTable>;

export type SavedAddress = Selectable<SavedAddressesTable>;
