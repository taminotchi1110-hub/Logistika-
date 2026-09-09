import 'package:flutter_test/flutter_test.dart';
import 'package:karvon/features/ratings/domain/rating.dart';

/// Baho modellari.
///
/// KO'R-KO'RONA SXEMA: baho hamkor ham baho bermaguncha yashirin
/// turadi. `isVisible` shu qoidaning natijasi va u SERVERDAN keladi —
/// mijoz tomonida hisoblanmaydi.
void main() {
  group('Rating', () {
    final json = <String, dynamic>{
      'id': 'r-1',
      'orderId': 'o-1',
      'score': 5,
      'punctuality': 5,
      'communication': 4,
      'cargoCondition': 5,
      'reliability': null,
      'comment': 'Vaqtida yetkazdi, yuk butun',
      'direction': 'SHIPPER_TO_DRIVER',
      'isVisible': false,
      'createdAt': '2026-09-09T11:21:30.434Z',
    };

    test('server javobi oʻqiladi', () {
      final rating = Rating.fromJson(json);

      expect(rating.score, 5);
      expect(rating.punctuality, 5);
      expect(rating.communication, 4);
      expect(rating.cargoCondition, 5);
      expect(rating.reliability, isNull);
      expect(rating.hasComment, isTrue);
      expect(rating.isVisible, isFalse);
    });

    test('★ YOʻNALISH ANIQ AJRATILADI', () {
      // Yuk holati faqat mijozdan haydovchiga — yoʻnalish shuni
      // hal qiladi
      expect(Rating.fromJson(json).direction.isFromShipper, isTrue);

      final fromDriver = Rating.fromJson({
        ...json,
        'direction': 'DRIVER_TO_SHIPPER',
      });
      expect(fromDriver.direction.isFromShipper, isFalse);
    });

    test('ochiq profilda baho beruvchi koʻrsatiladi', () {
      final rating = Rating.fromJson({
        ...json,
        'isVisible': true,
        'rater': {'firstName': 'Anvar', 'lastName': 'Karimov'},
      });

      expect(rating.raterName, 'Anvar Karimov');
      expect(rating.isVisible, isTrue);
    });

    test('ismsiz baho beruvchi — null', () {
      final rating = Rating.fromJson({
        ...json,
        'rater': {'firstName': null, 'lastName': null},
      });

      expect(rating.raterName, isNull);
    });

    test('boʻsh izoh "izoh bor" deb hisoblanmaydi', () {
      expect(Rating.fromJson({...json, 'comment': '   '}).hasComment, isFalse);
      expect(Rating.fromJson({...json, 'comment': null}).hasComment, isFalse);
    });

    test('boʻsh javobdan ham obyekt quriladi', () {
      final rating = Rating.fromJson(const {});
      expect(rating.score, 0);
      expect(rating.isVisible, isFalse);
    });
  });

  group('PendingRating', () {
    PendingRating pending(Duration untilDeadline) => PendingRating.fromJson({
          'orderId': 'o-1',
          'publicNo': '349',
          'counterpartyName': 'Test User',
          'deadline': DateTime.now().add(untilDeadline).toIso8601String(),
        });

    test('qolgan kunlar hisoblanadi', () {
      expect(pending(const Duration(days: 10, hours: 1)).daysLeft, 10);
      expect(pending(const Duration(hours: 5)).daysLeft, 0);
    });

    test('★ MUDDAT YAQINLASHGANDA TAʼKIDLANADI', () {
      // Foydalanuvchi "keyinroq" deb qoldirgan boʻlsa, qachon
      // kechikishini bilishi kerak
      expect(pending(const Duration(days: 10)).isUrgent, isFalse);
      expect(pending(const Duration(days: 3, hours: 1)).isUrgent, isTrue);
      expect(pending(const Duration(hours: 2)).isUrgent, isTrue);
    });
  });

  group('RatingDraft', () {
    test('★ FAQAT UMUMIY BAHO MAJBURIY', () {
      // Mezonlar majburiy qilinsa foydalanuvchi hammasiga "5" qoʻyib
      // qutuladi va baho maʼnosini yoʻqotadi
      expect(const RatingDraft().isValid, isFalse);
      expect(const RatingDraft(score: 3).isValid, isTrue);
    });

    test('baho chegarasi 1..5', () {
      expect(const RatingDraft(score: 0).isValid, isFalse);
      expect(const RatingDraft(score: 1).isValid, isTrue);
      expect(const RatingDraft(score: 5).isValid, isTrue);
      expect(const RatingDraft(score: 6).isValid, isFalse);
    });

    test('★ TOʻLDIRILMAGAN MEZONLAR YUBORILMAYDI', () {
      // Backend `whitelist: true` bilan ishlaydi va `null` qiymat
      // validatorga tushib xato berishi mumkin
      final body = const RatingDraft(score: 5).toJson();

      expect(body['score'], 5);
      expect(body.containsKey('punctuality'), isFalse);
      expect(body.containsKey('cargoCondition'), isFalse);
      expect(body.containsKey('comment'), isFalse);
    });

    test('boʻsh izoh yuborilmaydi', () {
      expect(
        const RatingDraft(score: 5, comment: '   ').toJson().containsKey('comment'),
        isFalse,
      );
    });

    test('izoh tozalanadi', () {
      final body = const RatingDraft(score: 5, comment: '  Zoʻr  ').toJson();
      expect(body['comment'], 'Zoʻr');
    });

    test('toʻldirilgan mezonlar yuboriladi', () {
      final body = const RatingDraft(
        score: 5,
        punctuality: 4,
        communication: 5,
        cargoCondition: 3,
        reliability: 4,
      ).toJson();

      expect(body['punctuality'], 4);
      expect(body['communication'], 5);
      expect(body['cargoCondition'], 3);
      expect(body['reliability'], 4);
    });

    test('copyWith mavjud qiymatlarni saqlaydi', () {
      const draft = RatingDraft(score: 4, punctuality: 5);
      final updated = draft.copyWith(communication: 3);

      expect(updated.score, 4);
      expect(updated.punctuality, 5);
      expect(updated.communication, 3);
    });
  });
}
