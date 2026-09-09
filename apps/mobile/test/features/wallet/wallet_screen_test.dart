import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karvon/core/providers.dart';
import 'package:karvon/features/auth/domain/user.dart';
import 'package:karvon/features/wallet/domain/wallet.dart';
import 'package:karvon/features/wallet/presentation/wallet_providers.dart';
import 'package:karvon/features/wallet/presentation/wallet_screen.dart';

/// Hamyon ekrani.
///
/// ENG MUHIM: manfiy balans haydovchida NORMAL holat va u xato kabi
/// ko'rsatilmaydi — tushuntiriladi. Chegaradan oshgan qarz esa
/// haqiqiy to'siq va u aniq aytilishi kerak.
void main() {
  const driver = AppUser(
    id: 'u-1',
    phone: '+998901234567',
    firstName: 'Anvar',
    lastName: 'Karimov',
    role: UserRole.driver,
    status: UserStatus.active,
  );

  const shipper = AppUser(
    id: 'u-2',
    phone: '+998901234568',
    firstName: 'Dilshod',
    lastName: 'Aliyev',
    role: UserRole.shipper,
    status: UserStatus.active,
  );

  Wallet wallet({
    String balance = '5000000',
    bool canTakeOrders = true,
    String debt = '0',
  }) =>
      Wallet.fromJson({
        'balanceTiyin': balance,
        'creditLimitTiyin': '20000000',
        'canTakeOrders': canTakeOrders,
        'debtToPayTiyin': debt,
      });

  LedgerEntry entry(String amount, String description) => LedgerEntry.fromJson({
        'id': '1',
        'amountTiyin': amount,
        'balanceAfterTiyin': '5000000',
        'entryType': 'TOPUP',
        'description': description,
        'createdAt': '2026-09-09T05:59:00.000Z',
      });

  Future<void> pump(
    WidgetTester tester, {
    required AppUser user,
    Wallet? data,
    List<LedgerEntry> history = const [],
    List<Payout> payouts = const [],
  }) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          currentUserProvider.overrideWithValue(user),
          walletProvider.overrideWith((ref) => Future.value(data ?? wallet())),
          walletHistoryProvider.overrideWith((ref) => Future.value(history)),
          payoutsProvider.overrideWith((ref) => Future.value(payouts)),
        ],
        child: const MaterialApp(
          home: WalletScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('balans koʻrsatiladi', (tester) async {
    await pump(tester, user: driver);

    expect(find.text('50 000 soʻm'), findsOneWidget);
    expect(find.text('Toʻldirish'), findsOneWidget);
  });

  testWidgets('★ MIJOZDA "YECHISH" TUGMASI YOʻQ', (tester) async {
    // Pul yechish faqat haydovchida: mijoz hisobga pul qoʻyadi,
    // undan pul olmaydi
    await pump(tester, user: shipper);

    expect(find.text('Toʻldirish'), findsOneWidget);
    expect(find.text('Yechish'), findsNothing);
  });

  testWidgets('haydovchida "Yechish" tugmasi bor', (tester) async {
    await pump(tester, user: driver);
    expect(find.text('Yechish'), findsOneWidget);
  });

  testWidgets('★ MANFIY BALANS TUSHUNTIRILADI, XATO KABI KOʻRSATILMAYDI',
      (tester) async {
    await pump(tester, user: driver, data: wallet(balance: '-800000'));

    expect(find.textContaining('Naqd buyurtmalardagi komissiya qarzi'), findsOneWidget);
    // Toʻsiq yoʻq — buyurtma olish mumkin
    expect(find.textContaining('yangi buyurtma olib boʻlmaydi'), findsNothing);
  });

  testWidgets('★ CHEGARADAN OSHGAN QARZ ANIQ AYTILADI', (tester) async {
    await pump(
      tester,
      user: driver,
      data: wallet(balance: '-25000000', canTakeOrders: false, debt: '5000000'),
    );

    expect(find.textContaining('yangi buyurtma olib boʻlmaydi'), findsOneWidget);
    // Qancha toʻlash kerakligi aniq yozilishi kerak — "qarzingiz bor"
    // degan xabar foydalanuvchini nima qilishini bilmay qoldiradi
    expect(find.textContaining('Toʻlash kerak: 50 000 soʻm'), findsOneWidget);
  });

  testWidgets('boʻsh tarixda keyingi qadam koʻrsatiladi', (tester) async {
    await pump(tester, user: driver);

    expect(find.text('Harakat yoʻq'), findsOneWidget);
    expect(find.textContaining('Hisobni toʻldirsangiz'), findsOneWidget);
  });

  testWidgets('★ KIRIM VA CHIQIM AJRATIB KOʻRSATILADI', (tester) async {
    await pump(
      tester,
      user: driver,
      history: [
        entry('5000000', 'Hamyon toʻldirildi'),
        entry('-800000', 'Platforma komissiyasi'),
      ],
    );

    expect(find.text('Hamyon toʻldirildi'), findsOneWidget);
    expect(find.text('Platforma komissiyasi'), findsOneWidget);
    // Kirim oldiga plyus qoʻyiladi
    expect(find.text('+50 000 soʻm'), findsOneWidget);
    expect(find.text('−8 000 soʻm'), findsOneWidget);
  });

  testWidgets('★ BAJARILMAGAN YECHISH SOʻROVI KOʻRINADI', (tester) async {
    await pump(
      tester,
      user: driver,
      payouts: [
        Payout.fromJson({
          'id': 'po-1',
          'amountTiyin': '20000000',
          'cardMask': '8600 **** **** 1234',
          'status': 'REQUESTED',
          'requestedAt': '2026-09-09T06:00:00.000Z',
        }),
      ],
    );

    expect(find.text('Yechish soʻrovlari'), findsOneWidget);
    expect(find.textContaining('8600 **** **** 1234'), findsOneWidget);
    expect(find.text('Koʻrib chiqilmoqda'), findsOneWidget);
  });

  testWidgets('bajarilgan soʻrov roʻyxatda takrorlanmaydi', (tester) async {
    // U harakatlar tarixida koʻrinadi — ikki joyda koʻrsatish ortiqcha
    await pump(
      tester,
      user: driver,
      payouts: [
        Payout.fromJson({
          'id': 'po-1',
          'amountTiyin': '20000000',
          'cardMask': '**** 1234',
          'status': 'COMPLETED',
          'requestedAt': '2026-09-09T06:00:00.000Z',
        }),
      ],
    );

    expect(find.text('Yechish soʻrovlari'), findsNothing);
  });

  testWidgets('bajarilmagan soʻrovda sabab koʻrsatiladi', (tester) async {
    await pump(
      tester,
      user: driver,
      payouts: [
        Payout.fromJson({
          'id': 'po-1',
          'amountTiyin': '20000000',
          'cardMask': '**** 1234',
          'status': 'FAILED',
          'requestedAt': '2026-09-09T06:00:00.000Z',
          'failureReason': 'Karta bloklangan',
        }),
      ],
    );

    expect(find.text('Karta bloklangan'), findsOneWidget);
  });
}
