import '../../../core/api/api_client.dart';
import '../domain/wallet.dart';

class WalletRepository {
  WalletRepository(this._api);

  final ApiClient _api;

  Future<Wallet> balance() async {
    final data = await _api.get<Map<String, dynamic>>('/wallet');
    return Wallet.fromJson(data);
  }

  /// Harakatlar tarixi.
  ///
  /// `before` — shu vaqtdan oldingi yozuvlar. Kursor emas, sana:
  /// hamyon tarixida yozuvlar faqat qo'shiladi va sana bo'yicha
  /// sahifalash yetarli.
  Future<List<LedgerEntry>> history({int limit = 30, DateTime? before}) async {
    final data = await _api.get<List<dynamic>>(
      '/wallet/history',
      query: {
        'limit': limit,
        if (before != null) 'before': before.toUtc().toIso8601String(),
      },
    );

    return data
        .map((item) => LedgerEntry.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  /// Hisobni to'ldirish.
  ///
  /// Summa SO'MDA yuboriladi (tiyinda emas) — server shartnomasi
  /// shunday. Javobda PSP sahifasiga havola keladi: pul faqat PSP
  /// tasdiqlagach qo'shiladi, havolani ochmasdan balans oshmaydi.
  Future<Payment> topup({required int amountSoum, required String provider}) async {
    final data = await _api.post<Map<String, dynamic>>(
      '/payments/topup',
      body: {'amountSoum': amountSoum, 'provider': provider},
    );
    return Payment.fromJson(data);
  }

  Future<List<Payment>> payments() async {
    final data = await _api.get<List<dynamic>>('/payments');
    return data
        .map((item) => Payment.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  /// Pul yechish so'rovi.
  ///
  /// KARTA RAQAMI SAQLANMAYDI: server undan faqat maskalangan
  /// ko'rinish va PSP tokenini oladi. Ilova ham uni hech qayerda
  /// saqlamaydi — maydon yopilishi bilan yo'qoladi.
  Future<Payout> requestPayout({
    required int amountSoum,
    required String cardNumber,
  }) async {
    final data = await _api.post<Map<String, dynamic>>(
      '/payouts',
      body: {'amountSoum': amountSoum, 'cardNumber': cardNumber},
    );
    return Payout.fromJson(data);
  }

  Future<List<Payout>> payouts() async {
    final data = await _api.get<List<dynamic>>('/payouts');
    return data
        .map((item) => Payout.fromJson(item as Map<String, dynamic>))
        .toList();
  }
}
