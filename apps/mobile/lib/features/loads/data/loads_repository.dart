import '../../../core/api/api_client.dart';
import '../domain/load.dart';

/// Lentani filtrlash.
///
/// Barcha maydonlar ixtiyoriy: haydovchi odatda 1-2 ta filtr qo'yadi.
/// Bo'sh filtr — "hamma yuklar, yaqinligi bo'yicha".
class LoadFilter {
  const LoadFilter({
    this.fromRegionId,
    this.toRegionId,
    this.minWeightKg,
    this.maxWeightKg,
    this.vehicleTypeIds = const [],
    this.bodyTypeIds = const [],
    this.minPriceTiyin,
    this.maxDistanceKm,
    this.lat,
    this.lng,
    this.sort = 'match_score',
  });

  final int? fromRegionId;
  final int? toRegionId;
  final int? minWeightKg;
  final int? maxWeightKg;
  final List<int> vehicleTypeIds;
  final List<int> bodyTypeIds;
  final String? minPriceTiyin;
  final double? maxDistanceKm;

  /// Haydovchining joriy joylashuvi — "menga yaqin" saralash uchun.
  final double? lat;
  final double? lng;

  final String sort;

  bool get isEmpty =>
      fromRegionId == null &&
      toRegionId == null &&
      minWeightKg == null &&
      maxWeightKg == null &&
      vehicleTypeIds.isEmpty &&
      bodyTypeIds.isEmpty &&
      minPriceTiyin == null &&
      maxDistanceKm == null;

  /// Nechta filtr yoqilgan — tugmadagi belgi uchun.
  int get activeCount {
    var count = 0;
    if (fromRegionId != null) count++;
    if (toRegionId != null) count++;
    if (minWeightKg != null || maxWeightKg != null) count++;
    if (vehicleTypeIds.isNotEmpty) count++;
    if (bodyTypeIds.isNotEmpty) count++;
    if (minPriceTiyin != null) count++;
    if (maxDistanceKm != null) count++;
    return count;
  }

  Map<String, dynamic> toQuery() {
    return {
      if (fromRegionId != null) 'fromRegionId': fromRegionId,
      if (toRegionId != null) 'toRegionId': toRegionId,
      if (minWeightKg != null) 'minWeightKg': minWeightKg,
      if (maxWeightKg != null) 'maxWeightKg': maxWeightKg,
      // Massivlar vergul bilan: backend shu formatni kutadi
      if (vehicleTypeIds.isNotEmpty) 'vehicleTypeIds': vehicleTypeIds.join(','),
      if (bodyTypeIds.isNotEmpty) 'bodyTypeIds': bodyTypeIds.join(','),
      if (minPriceTiyin != null) 'minPriceTiyin': minPriceTiyin,
      if (maxDistanceKm != null) 'maxDistanceKm': maxDistanceKm,
      if (lat != null) 'lat': lat,
      if (lng != null) 'lng': lng,
      'sort': sort,
    };
  }

  LoadFilter copyWith({
    int? fromRegionId,
    int? toRegionId,
    int? minWeightKg,
    int? maxWeightKg,
    List<int>? vehicleTypeIds,
    List<int>? bodyTypeIds,
    String? minPriceTiyin,
    double? maxDistanceKm,
    double? lat,
    double? lng,
    String? sort,
    bool clearRegions = false,
    bool clearWeight = false,
    bool clearPrice = false,
    bool clearDistance = false,
  }) {
    return LoadFilter(
      fromRegionId: clearRegions ? null : (fromRegionId ?? this.fromRegionId),
      toRegionId: clearRegions ? null : (toRegionId ?? this.toRegionId),
      minWeightKg: clearWeight ? null : (minWeightKg ?? this.minWeightKg),
      maxWeightKg: clearWeight ? null : (maxWeightKg ?? this.maxWeightKg),
      vehicleTypeIds: vehicleTypeIds ?? this.vehicleTypeIds,
      bodyTypeIds: bodyTypeIds ?? this.bodyTypeIds,
      minPriceTiyin: clearPrice ? null : (minPriceTiyin ?? this.minPriceTiyin),
      maxDistanceKm: clearDistance ? null : (maxDistanceKm ?? this.maxDistanceKm),
      lat: lat ?? this.lat,
      lng: lng ?? this.lng,
      sort: sort ?? this.sort,
    );
  }
}

/// Sahifalangan natija.
class LoadPage {
  const LoadPage({required this.items, required this.nextCursor, required this.hasMore});

  final List<Load> items;
  final String? nextCursor;
  final bool hasMore;
}

class LoadsRepository {
  LoadsRepository(this._api);

  final ApiClient _api;

  /// Haydovchi lentasi.
  ///
  /// KURSORLI SAHIFALASH: `offset` bilan emas. Lenta doim o'zgarib
  /// turadi (yangi e'lonlar qo'shiladi, eskilar band bo'ladi) va
  /// `offset` ishlatilsa foydalanuvchi bir xil yukni ikki marta
  /// ko'radi yoki umuman ko'rmay qoladi.
  Future<LoadPage> feed({LoadFilter filter = const LoadFilter(), String? cursor}) async {
    final page = await _api.getPage(
      '/loads/feed',
      query: {...filter.toQuery(), if (cursor != null) 'cursor': cursor},
    );

    return LoadPage(
      items: page.items
          .map((item) => Load.fromJson(item as Map<String, dynamic>))
          .toList(),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    );
  }

  /// Yuk beruvchining o'z e'lonlari.
  Future<LoadPage> myLoads({String? status, String? cursor}) async {
    final page = await _api.getPage(
      '/loads/mine',
      query: {
        if (status != null) 'status': status,
        if (cursor != null) 'cursor': cursor,
      },
    );

    return LoadPage(
      items: page.items
          .map((item) => Load.fromJson(item as Map<String, dynamic>))
          .toList(),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    );
  }

  Future<Load> byId(String id) async {
    final data = await _api.get<Map<String, dynamic>>('/loads/$id');
    return Load.fromJson(data);
  }

  /// Narx tavsiyasi — e'lon yaratishda ko'rsatiladi.
  ///
  /// Yuk beruvchi bozor narxini bilmasligi mumkin va juda past narx
  /// qo'ysa e'lon javobsiz qoladi. Tavsiya bu muammoni oldini oladi.
  Future<PriceEstimate> estimate({
    required double fromLat,
    required double fromLng,
    required double toLat,
    required double toLng,
    required int weightKg,
  }) async {
    final data = await _api.get<Map<String, dynamic>>(
      '/loads/estimate',
      query: {
        'fromLat': fromLat,
        'fromLng': fromLng,
        'toLat': toLat,
        'toLng': toLng,
        'weightKg': weightKg,
      },
    );
    return PriceEstimate.fromJson(data);
  }

  Future<Load> create(Map<String, dynamic> body) async {
    final data = await _api.post<Map<String, dynamic>>('/loads', body: body);
    return Load.fromJson(data);
  }

  Future<Load> publish(String id) async {
    final data = await _api.post<Map<String, dynamic>>('/loads/$id/publish');
    return Load.fromJson(data);
  }

  Future<void> cancel(String id, String reason) async {
    await _api.post<dynamic>('/loads/$id/cancel', body: {'reason': reason});
  }
}

class PriceEstimate {
  const PriceEstimate({
    required this.distanceKm,
    required this.durationMin,
    required this.suggestedPriceTiyin,
    required this.minPriceTiyin,
    required this.maxPriceTiyin,
    required this.source,
    this.pickupRegionName,
    this.deliveryRegionName,
    this.routeSource = 'estimate',
  });

  factory PriceEstimate.fromJson(Map<String, dynamic> json) {
    final price = json['price'] as Map<String, dynamic>? ?? const {};

    return PriceEstimate(
      distanceKm: (json['distanceKm'] as num?)?.toDouble() ?? 0,
      durationMin: (json['durationMin'] as num?)?.toInt() ?? 0,
      suggestedPriceTiyin: price['suggestedPriceTiyin']?.toString() ?? '0',
      minPriceTiyin: price['minPriceTiyin']?.toString() ?? '0',
      maxPriceTiyin: price['maxPriceTiyin']?.toString() ?? '0',
      // `market` — real bitimlar statistikasi, `tariff` — boshlang'ich jadval
      source: price['source'] as String? ?? 'tariff',
      pickupRegionName:
          (json['pickupRegion'] as Map<String, dynamic>?)?['name'] as String?,
      deliveryRegionName:
          (json['deliveryRegion'] as Map<String, dynamic>?)?['name'] as String?,
      routeSource: json['routeSource'] as String? ?? 'estimate',
    );
  }

  final double distanceKm;
  final int durationMin;
  final String suggestedPriceTiyin;
  final String minPriceTiyin;
  final String maxPriceTiyin;
  final String source;
  final String? pickupRegionName;
  final String? deliveryRegionName;

  /// `osrm` — haqiqiy marshrut, `estimate` — to'g'ri chiziq bo'yicha
  /// taxmin. Mijozga farqni ko'rsatamiz: taxminiy masofa 5-10% farq
  /// qilishi mumkin.
  final String routeSource;

  bool get isMarketPrice => source == 'market';
  bool get isRealRoute => routeSource == 'osrm';
}
