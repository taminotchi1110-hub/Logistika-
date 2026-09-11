import 'package:flutter_test/flutter_test.dart';
import 'package:karvon/features/documents/domain/document.dart';
import 'package:karvon/features/vehicles/domain/vehicle.dart';
import 'package:karvon/features/documents/presentation/document_l10n.dart';

import '../../helpers/localized_app.dart';

/// Hujjat modellari.
///
/// EGALIK TURI MUHIM: noto'g'ri `ownerType` bilan yuborilgan hujjat
/// serverda rad etiladi (`ALLOWED_TYPES_BY_OWNER`). Shuning uchun u
/// hujjat turining o'zidan hisoblanadi va forma uni unuta olmaydi.
void main() {
  group('DocumentType', () {
    test('★ EGALIK TURI HUJJAT TURIDAN KELIB CHIQADI', () {
      expect(DocumentType.passport.ownerType, 'USER');
      expect(DocumentType.idCard.ownerType, 'USER');
      // Guvohnoma — haydovchi profiliga
      expect(DocumentType.driverLicense.ownerType, 'DRIVER');
      // Texnik pasport va sugʻurta — transportga
      expect(DocumentType.vehicleReg.ownerType, 'VEHICLE');
      expect(DocumentType.insurance.ownerType, 'VEHICLE');
    });

    test('transport hujjatlari ajratiladi', () {
      expect(DocumentType.vehicleReg.isVehicleDocument, isTrue);
      expect(DocumentType.insurance.isVehicleDocument, isTrue);
      expect(DocumentType.passport.isVehicleDocument, isFalse);
      expect(DocumentType.driverLicense.isVehicleDocument, isFalse);
    });

    test('★ IKKI TOMONLI HUJJATLAR BELGILANGAN', () {
      // Pasportning faqat bir tomonini yuklash — eng koʻp uchraydigan
      // xato va u verifikatsiyani toʻxtatib qoʻyadi
      expect(DocumentType.passport.hasTwoSides, isTrue);
      expect(DocumentType.idCard.hasTwoSides, isTrue);
      expect(DocumentType.driverLicense.hasTwoSides, isTrue);
      expect(DocumentType.insurance.hasTwoSides, isFalse);
    });

    test('API qiymatlari va tarjimalar', () {
      for (final type in DocumentType.values) {
        expect(type.api, isNotEmpty);
        expect(type.localized(l10nFor()), isNotEmpty);
        // Aylanma: API qiymati oʻqilganda oʻsha turga qaytadi
        expect(DocumentType.fromApi(type.api), type);
      }
    });

    test('★ NOMAʼLUM TUR ILOVANI BUZMAYDI', () {
      expect(DocumentType.fromApi('WAYBILL'), DocumentType.other);
      expect(DocumentType.fromApi(null), DocumentType.other);
    });
  });

  group('UserDocument', () {
    UserDocument document({
      String status = 'PENDING',
      String? side,
      String? rejection,
      DateTime? expires,
    }) =>
        UserDocument.fromJson({
          'id': 'd-1',
          'ownerType': 'USER',
          'ownerId': 'u-1',
          'type': 'PASSPORT',
          'fileName': 'passport.jpg',
          'pageSide': side,
          'verificationStatus': status,
          'rejectionReason': rejection,
          'expiresAt': expires?.toIso8601String(),
          'createdAt': '2026-09-09T12:00:00.000Z',
          'url': 'https://storage.example/doc.jpg?sig=abc',
        });

    test('server javobi oʻqiladi', () {
      final doc = document(side: 'FRONT');

      expect(doc.id, 'd-1');
      expect(doc.type, DocumentType.passport);
      expect(doc.verificationStatus, VerificationStatus.pending);
      expect(doc.sideText(l10nFor()), 'Old tomoni');
      expect(doc.url, isNotEmpty);
    });

    test('orqa tomon yorligʻi', () {
      expect(document(side: 'BACK').sideText(l10nFor()), 'Orqa tomoni');
      expect(document().sideText(l10nFor()), isEmpty);
    });

    test('★ RAD ETILGAN HUJJATDA SABAB BOʻLADI', () {
      final doc = document(status: 'REJECTED', rejection: 'Rasm xira');

      expect(doc.isRejected, isTrue);
      expect(doc.rejectionReason, 'Rasm xira');
    });

    test('★ MUDDAT 30 KUN OLDIN OGOHLANTIRILADI', () {
      // Yangi guvohnoma olish vaqt talab qiladi va reys oʻrtasida
      // muddat tugashi mumkin emas
      final soon = document(
        expires: DateTime.now().add(const Duration(days: 20)),
      );
      final later = document(
        expires: DateTime.now().add(const Duration(days: 60)),
      );

      expect(soon.isExpiringSoon, isTrue);
      expect(soon.isExpired, isFalse);
      expect(later.isExpiringSoon, isFalse);
    });

    test('muddati oʻtgan hujjat ajratiladi', () {
      final expired = document(
        expires: DateTime.now().subtract(const Duration(days: 1)),
      );

      expect(expired.isExpired, isTrue);
      expect(expired.isExpiringSoon, isTrue);
    });

    test('muddatsiz hujjat ogohlantirmaydi', () {
      expect(document().isExpiringSoon, isFalse);
      expect(document().isExpired, isFalse);
    });
  });

  group('PresignedUpload', () {
    test('yuklash havolasi oʻqiladi', () {
      final upload = PresignedUpload.fromJson({
        'uploadUrl': 'https://storage.example/put?sig=abc',
        'fileKey': 'document/u-1/2026/09/uuid.jpg',
        'expiresInSeconds': 900,
        'maxBytes': 10485760,
      });

      expect(upload.uploadUrl, contains('sig='));
      // Kalit foydalanuvchi ID si bilan boshlanadi — egalik shundan
      // tekshiriladi
      expect(upload.fileKey, contains('/u-1/'));
      expect(upload.maxBytes, 10485760);
    });
  });
}
