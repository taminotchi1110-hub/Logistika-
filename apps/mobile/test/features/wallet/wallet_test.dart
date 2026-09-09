import 'package:flutter_test/flutter_test.dart';
import 'package:karvon/features/wallet/domain/wallet.dart';

/// Hamyon modellari — serverning haqiqiy javob shakli bo'yicha.
///
/// PUL SATR SIFATIDA: `double` katta summalarda aniqlikni yo'qotadi.
/// Foydalanuvchi ekranda ko'rgan raqam serverdagidan farq qilsa,
/// ishonch yo'qoladi — bu moliyaviy ilovada eng og'ir xato.
void main() {
  group('Wallet', () {
    test('server javobi oʻqiladi', () {
      final wallet = Wallet.fromJson({
        'balanceTiyin': '5000000',
        'creditLimitTiyin': '20000000',
        'formatted': '50 000 soʻm',
        'canTakeOrders': true,
        'debtToPayTiyin': '0',
      });

      expect(wallet.balanceTiyin, '5000000');
      expect(wallet.isNegative, isFalse);
      expect(wallet.canTakeOrders, isTrue);
      expect(wallet.hasDebt, isFalse);
      expect(wallet.formatted, '50 000 soʻm');
    });

    test('★ MANFIY BALANS — HAYDOVCHIDA NORMAL HOLAT', () {
      // Naqd buyurtmada haydovchi pulni qoʻlga oladi, platforma ulushi
      // qarzga yoziladi. Bu xato emas.
      final wallet = Wallet.fromJson({
        'balanceTiyin': '-800000',
        'creditLimitTiyin': '20000000',
        'canTakeOrders': true,
        'debtToPayTiyin': '0',
      });

      expect(wallet.isNegative, isTrue);
      // Chegara ichida — buyurtma olish mumkin
      expect(wallet.canTakeOrders, isTrue);
      expect(wallet.hasDebt, isFalse);
    });

    test('★ CHEGARADAN OSHGAN QARZ BUYURTMANI TOʻSADI', () {
      final wallet = Wallet.fromJson({
        'balanceTiyin': '-25000000',
        'creditLimitTiyin': '20000000',
        'canTakeOrders': false,
        'debtToPayTiyin': '5000000',
      });

      expect(wallet.canTakeOrders, isFalse);
      expect(wallet.hasDebt, isTrue);
      expect(wallet.debtToPayTiyin, '5000000');
    });

    test('boʻsh javobda xavfsiz qiymatlar', () {
      final wallet = Wallet.fromJson(const {});

      expect(wallet.balanceTiyin, '0');
      expect(wallet.isNegative, isFalse);
      expect(wallet.hasDebt, isFalse);
    });
  });

  group('LedgerEntry', () {
    LedgerEntry entry(String amount, String type) => LedgerEntry.fromJson({
          'id': '436',
          'amountTiyin': amount,
          'balanceAfterTiyin': '5000000',
          'entryType': type,
          'description': 'Test',
          'createdAt': '2026-09-09T05:59:37.972Z',
        });

    test('★ KIRIM VA CHIQIM AJRATILADI', () {
      expect(entry('5000000', 'TOPUP').isIncome, isTrue);
      expect(entry('-800000', 'COMMISSION').isIncome, isFalse);
    });

    test('★ AMALDAN KEYINGI BALANS SAQLANADI', () {
      // Mijoz hisobni oʻzi tekshira olishi kerak
      expect(entry('5000000', 'TOPUP').balanceAfterTiyin, '5000000');
    });

    test('barcha turlar tarjima qilinadi', () {
      const types = {
        'TOPUP': 'Hisob toʻldirildi',
        'ESCROW_HOLD': 'Toʻlov bloklandi',
        'ESCROW_RELEASE': 'Toʻlov chiqarildi',
        'ESCROW_REFUND': 'Pul qaytarildi',
        'COMMISSION': 'Platforma komissiyasi',
        'PAYOUT': 'Kartaga yechildi',
        'PAYOUT_REVERSAL': 'Yechish bekor qilindi',
        'PENALTY': 'Jarima',
        'BONUS': 'Bonus',
        'SUBSCRIPTION': 'Obuna toʻlovi',
        'ADJUSTMENT': 'Administrator tuzatishi',
      };

      types.forEach((api, label) {
        expect(LedgerEntryType.fromApi(api).label, label, reason: api);
      });
    });

    test('★ NOMAʼLUM TUR ILOVANI BUZMAYDI', () {
      // Server yangi tur qoʻshsa eski ilova qulab tushmasligi kerak
      expect(LedgerEntryType.fromApi('SOMETHING_NEW'), LedgerEntryType.other);
      expect(LedgerEntryType.other.label, 'Boshqa amal');
      expect(LedgerEntryType.fromApi(null), LedgerEntryType.other);
    });
  });

  group('Payment', () {
    test('toʻlov havolasi bilan keladi', () {
      final payment = Payment.fromJson({
        'id': 'p-1',
        'provider': 'CLICK',
        'amountTiyin': '5000000',
        'status': 'CREATED',
        'createdAt': '2026-09-09T05:59:37.953Z',
        'paidAt': null,
        'checkoutUrl': 'https://my.click.uz/services/pay?x=1',
      });

      expect(payment.isPending, isTrue);
      expect(payment.isPaid, isFalse);
      expect(payment.checkoutUrl, isNotNull);
    });

    test('★ TOʻLANGACH HAVOLA YOʻQOLADI', () {
      // Pul faqat PSP tasdiqlagach qoʻshiladi; havolani qayta ochish
      // maʼnosiz va chalgʻituvchi
      final payment = Payment.fromJson({
        'id': 'p-1',
        'provider': 'CLICK',
        'amountTiyin': '5000000',
        'status': 'PAID',
        'createdAt': '2026-09-09T05:59:37.953Z',
        'paidAt': '2026-09-09T05:59:37.982Z',
        'checkoutUrl': null,
      });

      expect(payment.isPaid, isTrue);
      expect(payment.isPending, isFalse);
      expect(payment.checkoutUrl, isNull);
      expect(payment.paidAt, isNotNull);
    });
  });

  group('Payout', () {
    test('★ FAQAT MASKALANGAN KARTA SAQLANADI', () {
      final payout = Payout.fromJson({
        'id': 'po-1',
        'amountTiyin': '20000000',
        'cardMask': '8600 **** **** 1234',
        'status': 'REQUESTED',
        'requestedAt': '2026-09-09T06:00:00.000Z',
      });

      expect(payout.cardMask, '8600 **** **** 1234');
      // Toʻliq raqam hech qachon qaytmaydi
      expect(payout.cardMask, contains('*'));
      expect(payout.statusLabel, 'Koʻrib chiqilmoqda');
      expect(payout.isDone, isFalse);
      expect(payout.isFailed, isFalse);
    });

    test('holatlar tarjima qilinadi', () {
      Payout withStatus(String status) => Payout.fromJson({
            'id': 'po-1',
            'amountTiyin': '20000000',
            'cardMask': '**** 1234',
            'status': status,
            'requestedAt': '2026-09-09T06:00:00.000Z',
          });

      expect(withStatus('COMPLETED').statusLabel, 'Kartaga oʻtkazildi');
      expect(withStatus('COMPLETED').isDone, isTrue);
      expect(withStatus('FAILED').isFailed, isTrue);
      expect(withStatus('REJECTED').statusLabel, 'Rad etildi');
      // Nomaʼlum holat oʻzi koʻrsatiladi — yashirishdan koʻra yaxshiroq
      expect(withStatus('WEIRD').statusLabel, 'WEIRD');
    });

    test('bajarilmagan soʻrovda sabab koʻrsatiladi', () {
      final payout = Payout.fromJson({
        'id': 'po-1',
        'amountTiyin': '20000000',
        'cardMask': '**** 1234',
        'status': 'FAILED',
        'requestedAt': '2026-09-09T06:00:00.000Z',
        'failureReason': 'Karta bloklangan',
      });

      expect(payout.isFailed, isTrue);
      expect(payout.failureReason, 'Karta bloklangan');
    });
  });
}
