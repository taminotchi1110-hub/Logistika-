import 'package:flutter_test/flutter_test.dart';
import 'package:karvon/features/geo/domain/place.dart';
import 'package:karvon/features/loads/domain/load_draft.dart';

/// Yuk qoralamasi — forma mantiqi.
///
/// NEGA ALOHIDA TEST: qoralama "keyingi tugmasi yoqilsinmi" degan
/// savolga javob beradi. Xato bo'lsa, foydalanuvchi to'liq formani
/// to'ldirib bo'lgach serverdan xato oladi — bu eng yomon holat.
void main() {
  const pickup = Place(
    label: 'Toshkent, Chilonzor 19',
    lat: 41.2856,
    lng: 69.2034,
  );
  const delivery = Place(
    label: 'Samarqand, Registon',
    lat: 39.6542,
    lng: 66.9597,
  );

  final from = DateTime(2026, 9, 10, 9);
  final to = DateTime(2026, 9, 10, 15);

  LoadDraft valid() => LoadDraft(
        title: 'Mebel',
        categoryId: 3,
        weightKg: 4000,
        pickup: pickup,
        delivery: delivery,
        pickupFrom: from,
        pickupTo: to,
      );

  group('bosqich tekshiruvi', () {
    test('boʻsh qoralama hech qaysi bosqichdan oʻtmaydi', () {
      const draft = LoadDraft();
      expect(draft.isCargoValid, isFalse);
      expect(draft.isRouteValid, isFalse);
      expect(draft.isComplete, isFalse);
    });

    test('qisqa sarlavha rad etiladi', () {
      // Server `@Length(3, 160)` qoʻyadi — mijozda ham shu chegara
      expect(valid().copyWith(title: 'ab').isCargoValid, isFalse);
      expect(valid().copyWith(title: 'abc').isCargoValid, isTrue);
    });

    test('sarlavhadagi boʻsh joy hisobga olinmaydi', () {
      expect(valid().copyWith(title: '   ').isCargoValid, isFalse);
    });

    test('ogʻirlik chegarasi', () {
      expect(valid().copyWith(weightKg: 0).isCargoValid, isFalse);
      expect(valid().copyWith(weightKg: 60000).isCargoValid, isTrue);
      expect(valid().copyWith(weightKg: 60001).isCargoValid, isFalse);
    });

    test('kategoriyasiz oʻtmaydi', () {
      const draft = LoadDraft(title: 'Mebel', weightKg: 1000);
      expect(draft.isCargoValid, isFalse);
    });

    test('★ YUKLASH OYNASI TESKARI BOʻLSA RAD ETILADI', () {
      final draft = valid().copyWith(pickupTo: from.subtract(const Duration(hours: 1)));
      expect(draft.isRouteValid, isFalse);
    });

    test('★ YETKAZISH MUDDATI YUKLASHDAN OLDIN BOʻLA OLMAYDI', () {
      final draft = valid().copyWith(
        deliveryBy: from.subtract(const Duration(hours: 2)),
      );
      expect(draft.isRouteValid, isFalse);
    });

    test('yetkazish muddati ixtiyoriy', () {
      expect(valid().isRouteValid, isTrue);
      expect(valid().copyWith(deliveryBy: to.add(const Duration(days: 1))).isRouteValid, isTrue);
    });

    test('narx ixtiyoriy — kelishuv asosida ham toʻliq', () {
      expect(valid().isPriceValid, isTrue);
      expect(valid().isComplete, isTrue);
    });

    test('★ NARXSIZ EʼLON HAR DOIM KELISHUV ASOSIDA', () {
      // Backend ikkalasidan birini talab qiladi (LOAD_PRICE_REQUIRED).
      // Bayroq model darajasida hisoblanadi — forma uni unuta olmaydi.
      expect(valid().isNegotiable, isFalse);
      expect(valid().isNegotiableEffective, isTrue);
      expect(valid().toCreateBody(publishNow: true)['isNegotiable'], isTrue);
    });

    test('narx koʻrsatilsa kelishuv tanlanadigan boʻladi', () {
      final priced = valid().copyWith(priceTiyin: BigInt.from(240000000));

      expect(priced.isNegotiableEffective, isFalse);
      expect(priced.toCreateBody(publishNow: true).containsKey('isNegotiable'), isFalse);

      final negotiable = priced.copyWith(isNegotiable: true);
      expect(negotiable.toCreateBody(publishNow: true)['isNegotiable'], isTrue);
    });

    test('juda kichik narx rad etiladi', () {
      // 1000 soʻm (100 000 tiyin) dan past narx haqiqiy emas
      expect(valid().copyWith(priceTiyin: BigInt.from(50000)).isPriceValid, isFalse);
      expect(valid().copyWith(priceTiyin: BigInt.from(100000)).isPriceValid, isTrue);
    });
  });

  group('serverga yuboriladigan shakl', () {
    test('majburiy maydonlar bor', () {
      final body = valid().toCreateBody(publishNow: true);

      expect(body['title'], 'Mebel');
      expect(body['categoryId'], 3);
      expect(body['weightKg'], 4000);
      expect(body['publishNow'], isTrue);
      expect(body['paymentMethod'], 'CASH');
    });

    test('★ BOʻSH MAYDONLAR UMUMAN YUBORILMAYDI', () {
      // Backend `whitelist: true` bilan ishlaydi va `null` qiymat
      // validatorga tushib xato berishi mumkin
      final body = valid().toCreateBody(publishNow: false);

      expect(body.containsKey('description'), isFalse);
      expect(body.containsKey('volumeM3'), isFalse);
      expect(body.containsKey('packagesCount'), isFalse);
      expect(body.containsKey('deliveryBy'), isFalse);
      expect(body.containsKey('priceTiyin'), isFalse);
      expect(body.containsKey('isFragile'), isFalse);
    });

    test('manzil koordinatasi bilan yuboriladi', () {
      final body = valid().toCreateBody(publishNow: true);
      final point = body['pickup'] as Map<String, dynamic>;

      expect(point['address'], 'Toshkent, Chilonzor 19');
      expect(point['lat'], 41.2856);
      expect(point['lng'], 69.2034);
      // Kontakt boʻsh — yuborilmaydi
      expect(point.containsKey('contactName'), isFalse);
    });

    test('kontakt maydonlari tozalanadi', () {
      final body = valid()
          .copyWith(pickupContactName: '  Anvar aka  ', pickupContactPhone: '+998901234567')
          .toCreateBody(publishNow: true);
      final point = body['pickup'] as Map<String, dynamic>;

      expect(point['contactName'], 'Anvar aka');
      expect(point['contactPhone'], '+998901234567');
    });

    test('★ SANA UTC DA YUBORILADI', () {
      // Server `@IsDateString()` kutadi; mahalliy vaqt yuborilsa
      // yuklash oynasi 5 soatga surilib ketardi
      final body = valid().toCreateBody(publishNow: true);
      expect(body['pickupFrom'], from.toUtc().toIso8601String());
      expect(body['pickupTo'], to.toUtc().toIso8601String());
    });

    test('narx tiyinda butun son boʻlib ketadi', () {
      final body = valid()
          .copyWith(priceTiyin: BigInt.from(240000000))
          .toCreateBody(publishNow: true);

      expect(body['priceTiyin'], 240000000);
      expect(body['priceTiyin'], isA<int>());
    });

    test('boʻsh massivlar yuborilmaydi', () {
      final body = valid().toCreateBody(publishNow: true);
      expect(body.containsKey('requiredVehicleTypeIds'), isFalse);
      expect(body.containsKey('specialRequirementIds'), isFalse);
    });
  });

  group('copyWith tozalash bayroqlari', () {
    test('hajmni tozalash', () {
      final draft = valid().copyWith(volumeM3: 18);
      expect(draft.copyWith(clearVolume: true).volumeM3, isNull);
    });

    test('★ HARORATNI TOZALASH', () {
      // Refrijerator kuzov olib tashlansa harorat ham ketishi kerak
      final draft = valid().copyWith(tempMinC: 2, tempMaxC: 8);
      final cleared = draft.copyWith(clearTemperature: true);

      expect(cleared.tempMinC, isNull);
      expect(cleared.tempMaxC, isNull);
      expect(cleared.hasTemperature, isFalse);
    });

    test('narxni tozalash — "kelishuv asosida" ga qaytish', () {
      final draft = valid().copyWith(priceTiyin: BigInt.from(240000000));
      expect(draft.copyWith(clearPrice: true).priceTiyin, isNull);
    });
  });
}
