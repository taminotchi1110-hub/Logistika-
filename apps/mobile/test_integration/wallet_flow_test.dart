import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:karvon/core/api/api_client.dart';
import 'package:karvon/core/api/api_exception.dart';
import 'package:karvon/features/auth/data/auth_repository.dart';
import 'package:karvon/features/auth/domain/user.dart';
import 'package:karvon/features/wallet/data/wallet_repository.dart';
import 'package:karvon/features/wallet/domain/wallet.dart';

import 'support/memory_token_storage.dart';

/// Hamyon — HAQIQIY backend bilan.
///
/// PUL BILAN ISHLAYDIGAN QISM: bu yerda xato jimgina ketmasligi kerak.
/// Balans, tarix va yechish so'rovi serverning haqiqiy javob shakliga
/// mos kelishi tekshiriladi.
///
///   flutter test test_integration \
///     --dart-define=API_BASE_URL=http://localhost:3000/v1
void main() {
  final random = Random();

  /// Yangi haydovchi va uning hamyoni.
  Future<({WalletRepository wallet, ApiClient api})> signUpDriver() async {
    final storage = MemoryTokenStorage();
    final api = ApiClient(storage: storage);
    final auth = AuthRepository(api: api, storage: storage);

    final phone = '+99893${random.nextInt(9000000) + 1000000}';
    final challenge = await auth.requestOtp(phone);
    await auth.verifyOtp(phone: phone, code: challenge.devCode!);
    await auth.completeProfile(
      firstName: 'Test',
      lastName: 'Haydovchi',
      role: UserRole.driver,
    );

    return (wallet: WalletRepository(api), api: api);
  }

  /// Dev rejimida to'lovni PSP'siz tasdiqlaydi.
  Future<void> simulatePaid(ApiClient api, String paymentId) async {
    await api.post<dynamic>('/payments/$paymentId/simulate-paid');
  }

  test('★ YANGI HAMYON NOLDAN BOSHLANADI', () async {
    final driver = await signUpDriver();
    final wallet = await driver.wallet.balance();

    expect(wallet.balanceTiyin, '0');
    expect(wallet.isNegative, isFalse);
    // Qarzsiz haydovchi buyurtma olishi mumkin
    expect(wallet.canTakeOrders, isTrue);
    expect(wallet.hasDebt, isFalse);
    // Kredit chegarasi sozlamadan keladi va nolga teng boʻlmasligi kerak
    expect(wallet.creditLimitTiyin, isNot('0'));
  });

  test('★ HAVOLANI OCHMASDAN BALANS OSHMAYDI', () async {
    final driver = await signUpDriver();

    final payment = await driver.wallet.topup(amountSoum: 50000, provider: 'CLICK');

    expect(payment.isPending, isTrue);
    expect(payment.checkoutUrl, isNotNull);
    expect(payment.checkoutUrl, contains('click.uz'));
    expect(payment.amountTiyin, '5000000');

    // Pul faqat PSP tasdiqlagach qoʻshiladi
    final wallet = await driver.wallet.balance();
    expect(wallet.balanceTiyin, '0');
  });

  test('★ TASDIQLANGACH BALANS OSHADI VA TARIXGA YOZILADI', () async {
    final driver = await signUpDriver();

    final payment = await driver.wallet.topup(amountSoum: 50000, provider: 'CLICK');
    await simulatePaid(driver.api, payment.id);

    final wallet = await driver.wallet.balance();
    expect(wallet.balanceTiyin, '5000000');

    final history = await driver.wallet.history();
    expect(history, isNotEmpty);

    final entry = history.first;
    expect(entry.isIncome, isTrue);
    expect(entry.amountTiyin, '5000000');
    // Amaldan keyingi balans — mijoz hisobni oʻzi tekshira oladi
    expect(entry.balanceAfterTiyin, '5000000');
    expect(entry.type, LedgerEntryType.topup);
  });

  test('★ TOʻLOV IKKI MARTA HISOBLANMAYDI', () async {
    final driver = await signUpDriver();

    final payment = await driver.wallet.topup(amountSoum: 50000, provider: 'PAYME');
    await simulatePaid(driver.api, payment.id);
    // Takroriy tasdiq (PSP webhook'ni qayta yuborishi mumkin)
    await simulatePaid(driver.api, payment.id);

    final wallet = await driver.wallet.balance();
    expect(wallet.balanceTiyin, '5000000', reason: 'balans ikki marta oshmadi');
  });

  test('juda kichik summa rad etiladi', () async {
    final driver = await signUpDriver();

    // Server chegarasi — 5 000 soʻm
    await expectLater(
      driver.wallet.topup(amountSoum: 1000, provider: 'CLICK'),
      throwsA(isA<ApiException>()),
    );
  });

  test('★ MABLAGʻSIZ YECHIB BOʻLMAYDI', () async {
    final driver = await signUpDriver();

    await expectLater(
      driver.wallet.requestPayout(amountSoum: 200000, cardNumber: '8600123456781234'),
      throwsA(isA<ApiException>()),
    );
  });

  test('★ YECHISHDA KARTA MASKALANADI VA BALANS KAMAYADI', () async {
    final driver = await signUpDriver();

    final payment = await driver.wallet.topup(amountSoum: 500000, provider: 'CLICK');
    await simulatePaid(driver.api, payment.id);

    final payout = await driver.wallet.requestPayout(
      amountSoum: 200000,
      cardNumber: '8600123456781234',
    );

    // Toʻliq raqam hech qachon qaytmaydi
    expect(payout.cardMask, isNot(contains('8600123456781234')));
    expect(payout.cardMask, contains('1234'));
    expect(payout.amountTiyin, '20000000');

    // Summa DARHOL hamyondan yechiladi
    final wallet = await driver.wallet.balance();
    expect(wallet.balanceTiyin, '30000000');

    final payouts = await driver.wallet.payouts();
    expect(payouts.map((item) => item.id), contains(payout.id));
    expect(payouts.first.isDone, isFalse);
  });

  test('notoʻgʻri karta raqami rad etiladi', () async {
    final driver = await signUpDriver();

    final payment = await driver.wallet.topup(amountSoum: 500000, provider: 'CLICK');
    await simulatePaid(driver.api, payment.id);

    await expectLater(
      driver.wallet.requestPayout(amountSoum: 200000, cardNumber: '8600'),
      throwsA(isA<ApiException>()),
    );
  });

  test('toʻlovlar roʻyxati holat bilan qaytadi', () async {
    final driver = await signUpDriver();

    final payment = await driver.wallet.topup(amountSoum: 50000, provider: 'CLICK');
    await simulatePaid(driver.api, payment.id);

    final payments = await driver.wallet.payments();
    final found = payments.firstWhere((item) => item.id == payment.id);

    expect(found.isPaid, isTrue);
    expect(found.paidAt, isNotNull);
    // Toʻlangach havola kerak emas
    expect(found.checkoutUrl, isNull);
  });

  test('★ BEGONA TOʻLOVNI TASDIQLAB BOʻLMAYDI', () async {
    final owner = await signUpDriver();
    final stranger = await signUpDriver();

    final payment = await owner.wallet.topup(amountSoum: 50000, provider: 'CLICK');

    // Dev rejimida ham begona toʻlov ochilmaydi
    await expectLater(
      simulatePaid(stranger.api, payment.id),
      throwsA(isA<ApiException>()),
    );

    expect((await owner.wallet.balance()).balanceTiyin, '0');
  });
}
