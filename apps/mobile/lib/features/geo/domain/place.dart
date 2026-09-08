/// Xaritadagi nuqta — manzil matni va koordinata.
class Place {
  const Place({
    required this.label,
    required this.lat,
    required this.lng,
    this.city,
    this.street,
    this.regionId,
    this.regionName,
  });

  factory Place.fromJson(Map<String, dynamic> json) => Place(
        label: json['label'] as String? ?? '',
        lat: (json['lat'] as num?)?.toDouble() ?? 0,
        lng: (json['lng'] as num?)?.toDouble() ?? 0,
        city: json['city'] as String?,
        street: json['street'] as String?,
        regionId: (json['regionId'] as num?)?.toInt(),
        regionName: json['regionName'] as String?,
      );

  final String label;
  final double lat;
  final double lng;
  final String? city;
  final String? street;

  /// `reverse` javobida keladi — `search` da bo'lmaydi.
  final int? regionId;
  final String? regionName;

  /// Ro'yxatda birinchi qator: eng aniq qism (ko'cha yoki nom).
  String get primary {
    final head = label.split(',').first.trim();
    return head.isEmpty ? label : head;
  }

  /// Ikkinchi qator: qolgan manzil.
  String get secondary {
    final parts = label.split(',');
    if (parts.length <= 1) return city ?? '';
    return parts.sublist(1).join(',').trim();
  }

  /// Koordinata haqiqiy nuqtami. (0,0) — Atlantika okeani, ya'ni xato.
  bool get isValid => lat.abs() > 0.0001 || lng.abs() > 0.0001;

  @override
  String toString() => label;
}
