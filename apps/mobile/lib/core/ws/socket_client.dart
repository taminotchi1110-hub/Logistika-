import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

import '../config/app_config.dart';
import '../storage/token_storage.dart';

/// Serverdan kelgan bildirishnoma (banner uchun).
class RealtimeNotification {
  const RealtimeNotification({
    required this.type,
    required this.title,
    required this.body,
    this.deepLink,
    this.entityId,
    this.channel = 'karvon_orders',
    this.data = const {},
  });

  factory RealtimeNotification.fromJson(Map<String, dynamic> json) {
    return RealtimeNotification(
      type: json['type'] as String? ?? '',
      title: json['title'] as String? ?? '',
      body: json['body'] as String? ?? '',
      deepLink: json['deepLink'] as String?,
      entityId: json['entityId'] as String?,
      channel: json['channel'] as String? ?? 'karvon_orders',
      data: (json['data'] as Map<String, dynamic>?) ?? const {},
    );
  }

  final String type;
  final String title;
  final String body;
  final String? deepLink;
  final String? entityId;

  /// `karvon_messages` yoki `karvon_orders` — banner rangini belgilaydi.
  final String channel;

  final Map<String, dynamic> data;

  bool get isChat => type == 'chat.message';
  String? get conversationId => data['conversationId'] as String?;
}

/// Chatdagi xabar.
class RealtimeMessage {
  const RealtimeMessage({
    required this.id,
    required this.conversationId,
    required this.senderId,
    required this.body,
    required this.createdAt,
    this.type = 'TEXT',
    this.attachmentUrl,
  });

  factory RealtimeMessage.fromJson(Map<String, dynamic> json) {
    return RealtimeMessage(
      id: json['id'] as String? ?? '',
      conversationId: json['conversationId'] as String? ?? '',
      senderId: json['senderId'] as String? ?? '',
      body: json['body'] as String? ?? '',
      createdAt: DateTime.tryParse('${json['createdAt']}') ?? DateTime.now(),
      type: json['type'] as String? ?? 'TEXT',
      attachmentUrl: json['attachmentUrl'] as String?,
    );
  }

  final String id;
  final String conversationId;
  final String senderId;
  final String body;
  final DateTime createdAt;
  final String type;
  final String? attachmentUrl;

  /// `isMine` SERVERDAN KELMAYDI — u ko'ruvchiga bog'liq va bitta
  /// broadcast payload'da bo'lishi mumkin emas. Mijoz uni o'z ID'si
  /// bilan solishtirib hisoblaydi (backend'da bu xato bir marta
  /// yuz bergan: docs/15 §15.2).
  bool isMine(String myUserId) => senderId == myUserId;
}

/// Haydovchining jonli joylashuvi.
class RealtimeLocation {
  const RealtimeLocation({
    required this.orderId,
    required this.lat,
    required this.lng,
    required this.recordedAt,
    this.speedKmh,
    this.headingDeg,
    this.etaMinutes,
    this.distanceToTargetKm,
    this.target = 'PICKUP',
    this.isStale = false,
  });

  factory RealtimeLocation.fromJson(Map<String, dynamic> json) {
    return RealtimeLocation(
      orderId: json['orderId'] as String? ?? '',
      lat: (json['lat'] as num?)?.toDouble() ?? 0,
      lng: (json['lng'] as num?)?.toDouble() ?? 0,
      recordedAt: DateTime.tryParse('${json['recordedAt']}') ?? DateTime.now(),
      speedKmh: (json['speedKmh'] as num?)?.toDouble(),
      headingDeg: (json['headingDeg'] as num?)?.toInt(),
      etaMinutes: (json['etaMinutes'] as num?)?.toInt(),
      distanceToTargetKm: (json['distanceToTargetKm'] as num?)?.toDouble(),
      target: json['target'] as String? ?? 'PICKUP',
      isStale: json['isStale'] as bool? ?? false,
    );
  }

  final String orderId;
  final double lat;
  final double lng;
  final DateTime recordedAt;
  final double? speedKmh;
  final int? headingDeg;
  final int? etaMinutes;
  final double? distanceToTargetKm;
  final String target;

  /// 3 daqiqadan eski — haydovchi aloqadan chiqqan (tunnel, batareya).
  final bool isStale;
}

/// WebSocket ulanishi.
///
/// SERVER SOCKET.IO ISHLATADI, oddiy WebSocket emas — shuning uchun
/// `socket_io_client` kerak. Sabab backend tomonida: Redis adapter
/// bilan bir nechta replika o'rtasida xonalarni umumlashtirish uchun.
///
/// ULANISH UZILISHI NORMAL HOLAT: haydovchi tunnelga kiradi, tarmoq
/// almashadi (Wi-Fi → mobil). Socket.IO o'zi qayta ulanadi, biz esa
/// ulanish tiklanganda xonalarga QAYTA kiramiz — aks holda xabarlar
/// kelmay qoladi.
class SocketClient {
  SocketClient(this._storage);

  final TokenStorage _storage;

  io.Socket? _socket;

  /// Qaysi xonalarga obuna bo'lganmiz — qayta ulanishda tiklash uchun.
  final _joinedConversations = <String>{};
  final _joinedOrders = <String>{};

  final _notifications = StreamController<RealtimeNotification>.broadcast();
  final _messages = StreamController<RealtimeMessage>.broadcast();
  final _locations = StreamController<RealtimeLocation>.broadcast();
  final _connection = StreamController<bool>.broadcast();

  Stream<RealtimeNotification> get notifications => _notifications.stream;
  Stream<RealtimeMessage> get messages => _messages.stream;
  Stream<RealtimeLocation> get locations => _locations.stream;
  Stream<bool> get connectionState => _connection.stream;

  bool get isConnected => _socket?.connected ?? false;

  Future<void> connect() async {
    final token = await _storage.readAccessToken();
    if (token == null) return;

    // Avvalgi ulanish qolgan bo'lsa — tozalaymiz
    await disconnect();

    final socket = io.io(
      AppConfig.wsUrl,
      io.OptionBuilder()
          .setPath('/ws')
          // Token `auth` da yuboriladi, URL query'da EMAS: query proxy
          // va nginx loglariga tushadi
          .setAuth({'token': token})
          .setTransports(['websocket'])
          .enableReconnection()
          .setReconnectionAttempts(999)
          .setReconnectionDelay(1000)
          .setReconnectionDelayMax(10000)
          .disableAutoConnect()
          .build(),
    );

    socket
      ..onConnect((_) => _connection.add(true))
      ..onDisconnect((_) => _connection.add(false))
      ..on('connected', (_) => _rejoinRooms())
      ..on('notification', (data) {
        if (data is Map) {
          _notifications.add(
            RealtimeNotification.fromJson(Map<String, dynamic>.from(data)),
          );
        }
      })
      ..on('chat:message', (data) {
        if (data is Map) {
          _messages.add(RealtimeMessage.fromJson(Map<String, dynamic>.from(data)));
        }
      })
      ..on('order:location', (data) {
        if (data is Map) {
          _locations.add(RealtimeLocation.fromJson(Map<String, dynamic>.from(data)));
        }
      })
      ..on('error', (_) {
        // Token yaroqsiz — qayta ulanishga urinmaymiz, ilova
        // avtomatik yangilaydi va keyin qayta chaqiradi
        _connection.add(false);
      });

    _socket = socket;
    socket.connect();
  }

  /// Ulanish tiklanganda xonalarga qayta kiramiz.
  ///
  /// Busiz: haydovchi tunneldan chiqdi, socket qayta ulandi, lekin
  /// chat xonasida emas — xabarlar kelmaydi va u buni sezmaydi.
  void _rejoinRooms() {
    for (final id in _joinedConversations) {
      _socket?.emit('chat:join', {'conversationId': id});
    }
    for (final id in _joinedOrders) {
      _socket?.emit('order:subscribe', {'orderId': id});
    }
  }

  void joinConversation(String conversationId) {
    _joinedConversations.add(conversationId);
    _socket?.emit('chat:join', {'conversationId': conversationId});
  }

  void leaveConversation(String conversationId) {
    _joinedConversations.remove(conversationId);
    _socket?.emit('chat:leave', {'conversationId': conversationId});
  }

  void subscribeOrder(String orderId) {
    _joinedOrders.add(orderId);
    _socket?.emit('order:subscribe', {'orderId': orderId});
  }

  void unsubscribeOrder(String orderId) => _joinedOrders.remove(orderId);

  /// Xabar yuborish.
  ///
  /// `clientMsgId` — mijozdagi vaqtinchalik ID. Xabar darhol ro'yxatga
  /// qo'shiladi ("yuborilmoqda" holatida) va server javob berganda
  /// haqiqiy xabar bilan almashtiriladi. Bu optimistik UI: foydalanuvchi
  /// kutmaydi.
  void sendMessage({
    required String conversationId,
    required String body,
    required String clientMsgId,
  }) {
    _socket?.emit('chat:message', {
      'conversationId': conversationId,
      'body': body,
      'clientMsgId': clientMsgId,
    });
  }

  void markRead(String conversationId) {
    _socket?.emit('chat:read', {'conversationId': conversationId});
  }

  void setTyping(String conversationId, {required bool isTyping}) {
    _socket?.emit('chat:typing', {
      'conversationId': conversationId,
      'isTyping': isTyping,
    });
  }

  /// Joylashuv yuborish (faol reys davomida).
  void sendLocation({required double lat, required double lng, double? speedKmh}) {
    _socket?.emit('location:update', {
      'points': [
        {
          'lat': lat,
          'lng': lng,
          if (speedKmh != null) 'speedKmh': speedKmh,
          'recordedAt': DateTime.now().toIso8601String(),
        },
      ],
    });
  }

  Future<void> disconnect() async {
    _socket?.dispose();
    _socket = null;
    _joinedConversations.clear();
    _joinedOrders.clear();
  }

  Future<void> dispose() async {
    await disconnect();
    await _notifications.close();
    await _messages.close();
    await _locations.close();
    await _connection.close();
  }
}
