import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';
import 'package:karvon/core/l10n/formatters.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/config/app_config.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/ws/socket_client.dart';
import '../../../core/ws/ws_providers.dart';
import '../../../shared/widgets/app_states.dart';
import '../../orders/domain/order.dart';
import '../../orders/presentation/orders_screen.dart';
import '../data/tracking_repository.dart';
import '../domain/live_location.dart';

final trackingRepositoryProvider = Provider<TrackingRepository>((ref) {
  return TrackingRepository(ref.watch(apiClientProvider));
});

/// Jonli kuzatuv xaritasi.
///
/// KUZATUV FAQAT REYS DAVOMIDA: `EN_ROUTE_TO_PICKUP` dan
/// `ARRIVED_AT_DELIVERY` gacha. Bu maxfiylik qoidasi — buyurtmani
/// olish haydovchini doimiy nazoratga qo'ymaydi. Ekran bu holatni
/// yashirmaydi, aksincha AYTADI: bo'sh xarita "ishlamayapti" degan
/// taassurot qoldiradi.
class TrackingScreen extends ConsumerStatefulWidget {
  const TrackingScreen({required this.orderId, super.key});

  final String orderId;

  @override
  ConsumerState<TrackingScreen> createState() => _TrackingScreenState();
}

class _TrackingScreenState extends ConsumerState<TrackingScreen> {
  final _mapController = MapController();

  late final SocketClient _socket;

  StreamSubscription<RealtimeLocation>? _subscription;

  LiveLocation? _location;
  List<LatLng> _trail = const [];
  bool _isLoading = true;
  Object? _error;

  /// Xarita haydovchi ortidan avtomatik siljiydimi.
  ///
  /// Foydalanuvchi xaritani qo'li bilan surgach kuzatish TO'XTAYDI:
  /// aks holda u marshrutning boshqa qismiga qaray olmaydi — xarita
  /// uni doim orqaga tortadi.
  bool _followDriver = true;

  @override
  void initState() {
    super.initState();
    _socket = ProviderScope.containerOf(context, listen: false)
        .read(socketClientProvider);

    _socket.subscribeOrder(widget.orderId);
    _subscription = _socket.locations.listen(_onLiveLocation);

    _load();
  }

  @override
  void dispose() {
    _subscription?.cancel();
    _socket.unsubscribeOrder(widget.orderId);
    _mapController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final repository = ref.read(trackingRepositoryProvider);
      // Ikkalasi parallel: xarita bir marta chiziladi
      final results = await Future.wait([
        repository.lastLocation(widget.orderId),
        repository.track(widget.orderId),
      ]);

      if (!mounted) return;
      setState(() {
        _location = results[0] as LiveLocation?;
        _trail = (results[1] as OrderTrack).points;
        _isLoading = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error;
        _isLoading = false;
      });
    }
  }

  void _onLiveLocation(RealtimeLocation incoming) {
    if (incoming.orderId != widget.orderId || !mounted) return;

    setState(() {
      final previous = _location;
      _location = LiveLocation(
        orderId: incoming.orderId,
        lat: incoming.lat,
        lng: incoming.lng,
        recordedAt: incoming.recordedAt,
        target: incoming.target,
        // WebSocket payload'ida maqsad koordinatasi yoʻq — REST'dan
        // olingani saqlanadi
        targetLat: previous?.targetLat ?? 0,
        targetLng: previous?.targetLng ?? 0,
        distanceToTargetKm: incoming.distanceToTargetKm ?? 0,
        speedKmh: incoming.speedKmh,
        headingDeg: incoming.headingDeg,
        etaMinutes: incoming.etaMinutes,
        isStale: incoming.isStale,
      );

      // Yoʻl chizigʻi oʻsib boradi — har yangi nuqtada REST soʻrash
      // ortiqcha trafik
      _trail = [..._trail, LatLng(incoming.lat, incoming.lng)];
    });

    if (_followDriver) {
      _mapController.move(LatLng(incoming.lat, incoming.lng), _mapController.camera.zoom);
    }
  }

  @override
  Widget build(BuildContext context) {
    final order = ref.watch(orderProvider(widget.orderId));

    return Scaffold(
      appBar: AppBar(
        title: Text(context.l10n.trackingTitle),
        actions: [
          if (!_followDriver && _location != null)
            IconButton(
              icon: const Icon(Icons.my_location_rounded),
              tooltip: context.l10n.trackingRecenter,
              onPressed: () {
                setState(() => _followDriver = true);
                _mapController.move(_location!.position, 14);
              },
            ),
        ],
      ),
      body: order.when(
        loading: () => const LoadingState(),
        error: (error, _) => ErrorState(
          error: error,
          onRetry: () => ref.invalidate(orderProvider(widget.orderId)),
        ),
        data: _body,
      ),
    );
  }

  Widget _body(Order order) {
    if (_isLoading) return const LoadingState();

    if (_error != null) {
      return ErrorState(
        error: _error!,
        onRetry: () {
          setState(() {
            _isLoading = true;
            _error = null;
          });
          _load();
        },
      );
    }

    // Kuzatuv hali boshlanmagan yoki tugagan — buni AYTAMIZ
    if (!order.status.isTracking) {
      return _NotTrackingState(status: order.status);
    }

    return Stack(
      children: [
        _map(order),
        Positioned(
          left: AppSpacing.lg,
          right: AppSpacing.lg,
          bottom: AppSpacing.lg,
          child: _EtaCard(location: _location, order: order),
        ),
      ],
    );
  }

  Widget _map(Order order) {
    final pickup = LatLng(order.load.pickupLat, order.load.pickupLng);
    final delivery = LatLng(order.load.deliveryLat, order.load.deliveryLng);
    final driver = _location?.position;

    return FlutterMap(
      mapController: _mapController,
      options: MapOptions(
        initialCenter: driver ?? pickup,
        initialZoom: driver == null ? 8 : 13,
        // Foydalanuvchi xaritani surgach avtomatik kuzatish toʻxtaydi
        onPointerDown: (_, __) {
          if (_followDriver) setState(() => _followDriver = false);
        },
      ),
      children: [
        TileLayer(
          urlTemplate: AppConfig.mapTileUrl,
          // OSM foydalanish shartlari: ilova oʻzini tanishtirishi shart
          userAgentPackageName: 'uz.karvon.app',
        ),
        if (_trail.length >= 2)
          PolylineLayer(
            polylines: [
              Polyline(
                points: _trail,
                color: AppColors.primary,
                strokeWidth: 4,
              ),
            ],
          ),
        MarkerLayer(
          markers: [
            _pointMarker(pickup, Icons.trip_origin_rounded, AppColors.primary),
            _pointMarker(delivery, Icons.place_rounded, AppColors.success),
            if (driver != null) _driverMarker(driver),
          ],
        ),
        const RichAttributionWidget(
          attributions: [TextSourceAttribution(AppConfig.mapAttribution)],
        ),
      ],
    );
  }

  Marker _pointMarker(LatLng point, IconData icon, Color color) {
    return Marker(
      point: point,
      width: 36,
      height: 36,
      child: Container(
        decoration: BoxDecoration(
          color: AppColors.white,
          shape: BoxShape.circle,
          border: Border.all(color: color, width: 2),
        ),
        child: Icon(icon, size: 18, color: color),
      ),
    );
  }

  Marker _driverMarker(LatLng point) {
    final heading = _location?.headingDeg;
    final isStale = _location?.isStale ?? false;

    return Marker(
      point: point,
      width: 44,
      height: 44,
      child: Transform.rotate(
        // Yoʻnalish maʼlum boʻlsa belgi shu tomonga qaraydi —
        // haydovchi qayoqqa ketayotgani bir qarashda koʻrinadi
        angle: heading == null ? 0 : heading * 3.1415926535 / 180,
        child: Container(
          decoration: BoxDecoration(
            // Eskirgan maʼlumot kulrang: jonli deb koʻrsatish yolgʻon
            color: isStale ? AppColors.gray400 : AppColors.primary,
            shape: BoxShape.circle,
            border: Border.all(color: AppColors.white, width: 3),
          ),
          child: const Icon(
            Icons.navigation_rounded,
            size: 22,
            color: AppColors.white,
          ),
        ),
      ),
    );
  }
}

/// Kuzatuv ishlamayotgan holat.
class _NotTrackingState extends StatelessWidget {
  const _NotTrackingState({required this.status});

  final OrderStatus status;

  @override
  Widget build(BuildContext context) {
    // Reys boshlanmaganmi yoki tugaganmi — xabar boshqacha
    final notYet = status.step < OrderStatus.enRouteToPickup.step;

    return EmptyState(
      icon: notYet ? Icons.schedule_rounded : Icons.flag_rounded,
      title: notYet ? context.l10n.trackingNotStarted : context.l10n.trackingFinished,
      message: notYet ? context.l10n.trackingNotStartedHint : context.l10n.trackingFinishedHint,
    );
  }
}

/// ETA kartochkasi — xaritaning ustida.
class _EtaCard extends StatelessWidget {
  const _EtaCard({required this.location, required this.order});

  final LiveLocation? location;
  final Order order;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Material(
      elevation: 4,
      borderRadius: BorderRadius.circular(AppRadius.lg),
      color: AppColors.white,
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: location == null
            ? Row(
                children: [
                  const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Text(
                      context.l10n.trackingWaitingFirst,
                      style: theme.textTheme.bodyMedium,
                    ),
                  ),
                ],
              )
            : Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        location!.isHeadingToPickup
                            ? Icons.trip_origin_rounded
                            : Icons.place_rounded,
                        size: AppSizes.iconSm,
                        color: location!.isHeadingToPickup
                            ? AppColors.primary
                            : AppColors.success,
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      Expanded(
                        child: Text(
                          location!.isHeadingToPickup
                              ? context.l10n.trackingHeadingPickup
                              : context.l10n.trackingHeadingDelivery,
                          style: theme.textTheme.bodyMedium,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.md),
                  Row(
                    children: [
                      _Metric(
                        label: context.l10n.trackingDistanceLeft,
                        value: context.distance(location!.distanceToTargetKm),
                      ),
                      const SizedBox(width: AppSpacing.xl),
                      _Metric(
                        label: context.l10n.trackingEta,
                        value: location!.etaMinutes == null
                            ? '—'
                            : context.duration(location!.etaMinutes),
                      ),
                      if (location!.speedKmh != null) ...[
                        const SizedBox(width: AppSpacing.xl),
                        _Metric(
                          label: context.l10n.trackingSpeed,
                          value: context.l10n.speedKmh(location!.speedKmh!.round()),
                        ),
                      ],
                    ],
                  ),
                  if (location!.isStale) ...[
                    const SizedBox(height: AppSpacing.md),
                    Row(
                      children: [
                        const Icon(
                          Icons.signal_wifi_bad_rounded,
                          size: 14,
                          color: AppColors.warning,
                        ),
                        const SizedBox(width: AppSpacing.xs),
                        Expanded(
                          child: Text(
                            // Eskirgan nuqtani jonli deb koʻrsatish
                            // "haydovchi qimirlamayapti" degan notoʻgʻri
                            // xulosaga olib keladi
                            context.l10n.trackingStale(_ago(context, location!.age)),
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: AppColors.warning,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
      ),
    );
  }

  static String _ago(BuildContext context, Duration age) {
    if (age.inMinutes < 60) return context.l10n.agoMinutes(age.inMinutes);
    if (age.inHours < 24) return context.l10n.agoHours(age.inHours);
    return context.l10n.agoDays(age.inDays);
  }
}

class _Metric extends StatelessWidget {
  const _Metric({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: theme.textTheme.bodySmall?.copyWith(
            color: AppColors.textSecondary,
          ),
        ),
        const SizedBox(height: 2),
        Text(value, style: theme.textTheme.titleSmall),
      ],
    );
  }
}
