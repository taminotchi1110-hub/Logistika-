import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:karvon/core/api/api_client.dart';
import 'package:karvon/core/api/api_exception.dart';
import 'package:karvon/features/auth/data/auth_repository.dart';
import 'package:karvon/features/auth/domain/user.dart';
import 'package:karvon/features/documents/data/documents_repository.dart';
import 'package:karvon/features/documents/domain/document.dart';
// `VerificationStatus` transport modelida yashaydi: tekshiruv holati
// hujjatda ham, transportda ham, haydovchi profilida ham bir xil
import 'package:karvon/features/vehicles/domain/vehicle.dart';

import 'support/memory_token_storage.dart';

/// Hujjat yuklash — HAQIQIY backend bilan.
///
/// TEST IKKI QATLAMDAN IBORAT:
///
///   1. **Presign va tekshiruvlar** — S3 TALAB QILMAYDI. Imzo serverda
///      lokal hisoblanadi (AWS SDK `getSignedUrl` tarmoqqa chiqmaydi),
///      hujjat yaratishdagi rad etish yo'llari ham storage'ga bormaydi.
///      Bu qism har doim ishlaydi.
///
///   2. **Haqiqiy PUT** — S3 (dev'da MinIO) kerak. U ko'tarilmagan bo'lsa
///      test O'TKAZIB YUBORILADI va sabab konsolga chiqadi. Jimgina
///      "yashil" bo'lib qolmaydi: o'tkazib yuborilgan test — bajarilgan
///      test emas va buni ko'rib turish kerak.
///
///   flutter test test_integration/documents_flow_test.dart \
///     --dart-define=API_BASE_URL=http://localhost:3000/v1
void main() {
  final random = Random();

  /// MinIO javob beradimi.
  ///
  /// TCP ulanish yetarli: bucket va imzo tekshiruvi testning o'zida
  /// bo'ladi, bu yerda faqat "port ochiqmi?" degan savol.
  Future<bool> storageReachable() async {
    final endpoint =
        Uri.parse(const String.fromEnvironment('S3_ENDPOINT', defaultValue: 'http://localhost:9000'));
    try {
      final socket = await Socket.connect(
        endpoint.host,
        endpoint.port,
        timeout: const Duration(seconds: 2),
      );
      socket.destroy();
      return true;
    } on SocketException {
      return false;
    }
  }

  Future<({DocumentsRepository documents, ApiClient api, AppUser user})> signUpDriver() async {
    final storage = MemoryTokenStorage();
    final api = ApiClient(storage: storage);
    final auth = AuthRepository(api: api, storage: storage);

    final phone = '+99893${random.nextInt(9000000) + 1000000}';
    final challenge = await auth.requestOtp(phone);
    await auth.verifyOtp(phone: phone, code: challenge.devCode!);
    final user = await auth.completeProfile(
      firstName: 'Test',
      lastName: 'Hujjatchi',
      role: UserRole.driver,
    );

    return (documents: DocumentsRepository(api), api: api, user: user);
  }

  /// Presign so'rovi — repozitoriyning ichki qadamini to'g'ridan-to'g'ri.
  Future<Map<String, dynamic>> presign(
    ApiClient api, {
    String purpose = 'document',
    String mimeType = 'image/jpeg',
    int sizeBytes = 120000,
  }) =>
      api.post<Map<String, dynamic>>('/media/presign', body: {
        'purpose': purpose,
        'mimeType': mimeType,
        'sizeBytes': sizeBytes,
      });

  /// Diskda vaqtinchalik "hujjat rasmi".
  ///
  /// Mazmuni ahamiyatsiz: server faylni ochib ko'rmaydi, `HeadObject`
  /// orqali faqat hajm va MIME turini oladi.
  Future<File> tempImage({int bytes = 4096}) async {
    final directory = await Directory.systemTemp.createTemp('karvon-doc');
    final file = File('${directory.path}/passport.jpg');
    await file.writeAsBytes(
      List<int>.generate(bytes, (index) => index % 256),
      flush: true,
    );
    return file;
  }

  // ------------------------------------------------ 1-qatlam: S3 kerak emas

  group('presign', () {
    test('★ KALIT FOYDALANUVCHI ID SI BILAN BOSHLANADI', () async {
      final driver = await signUpDriver();
      final response = await presign(driver.api);
      final upload = PresignedUpload.fromJson(response);

      // Egalik kalitning O'ZIDAN tekshiriladi (`FILE_KEY_NOT_OWNED`),
      // shuning uchun ID kalitda bo'lishi shart
      expect(upload.fileKey, contains('/${driver.user.id}/'));
      expect(upload.fileKey, startsWith('document/'));
      expect(upload.fileKey, endsWith('.jpg'));

      // Imzolangan havola: muddat va hisob ma'lumotlari query'da
      expect(upload.uploadUrl, contains('X-Amz-Signature'));
      expect(upload.maxBytes, greaterThan(0));
      // Havola muddatli — model bu maydonni ishlatmaydi, lekin server
      // uni aytishi shart: aks holda mijoz havolani keshlab qo'yardi
      expect(response['expiresInSeconds'], greaterThan(0));
    });

    test('MIME turi kengaytmani belgilaydi', () async {
      final driver = await signUpDriver();

      final pdf = PresignedUpload.fromJson(
        await presign(driver.api, mimeType: 'application/pdf'),
      );
      final png = PresignedUpload.fromJson(
        await presign(driver.api, mimeType: 'image/png'),
      );

      // Fayl nomi mijozdan olinmaydi — server UUID + kengaytma yasaydi
      expect(pdf.fileKey, endsWith('.pdf'));
      expect(png.fileKey, endsWith('.png'));
    });

    test('★ RUXSATSIZ MIME TURI RAD ETILADI', () async {
      final driver = await signUpDriver();

      // GIF ro'yxatda yo'q: hujjat sifatida ma'nosi yo'q va animatsiya
      // verifikatsiya panelini sekinlashtiradi
      await expectLater(
        presign(driver.api, mimeType: 'image/gif'),
        throwsA(isA<ApiException>()),
      );
    });

    test('★ AVATARGA PDF YUKLAB BO\'LMAYDI', () async {
      final driver = await signUpDriver();

      await expectLater(
        presign(driver.api, purpose: 'avatar', mimeType: 'application/pdf'),
        throwsA(isA<ApiException>()),
      );
    });

    test('★ HAJM CHEGARASI IMZODAN OLDIN TEKSHIRILADI', () async {
      final driver = await signUpDriver();

      // 40 MB — DTO chegarasidan (50 MB) o'tadi, lekin storage
      // chegarasidan (20 MB) o'tmaydi. Aks holda mijoz imzo olib,
      // 40 MB ni yuklab, faqat oxirida S3 dan xato ko'rardi
      await expectLater(
        presign(driver.api, sizeBytes: 40 * 1024 * 1024),
        throwsA(
          isA<ApiException>().having(
            (error) => error.details?['maxBytes'],
            'maxBytes aytiladi',
            isNotNull,
          ),
        ),
      );
    });
  });

  group('hujjat yaratish tekshiruvlari', () {
    test('★ BEGONA KALIT BILAN HUJJAT YARATIB BO\'LMAYDI', () async {
      final driver = await signUpDriver();

      // Boshqa foydalanuvchining kaliti: uni taxmin qilib, o'z nomiga
      // yozib olishga urinish
      await expectLater(
        driver.api.post<Map<String, dynamic>>('/documents', body: {
          'ownerType': 'USER',
          'ownerId': driver.user.id,
          'type': 'PASSPORT',
          'fileKey': 'document/00000000-0000-0000-0000-000000000000/2026/09/x.jpg',
        }),
        throwsA(
          isA<ApiException>()
              .having((error) => error.code, 'kod', 'FILE_KEY_NOT_OWNED'),
        ),
      );
    });

    test('★ EGALIK TURI HUJJAT TURIGA MOS BO\'LISHI SHART', () async {
      final driver = await signUpDriver();
      final upload = PresignedUpload.fromJson(await presign(driver.api));

      // Guvohnoma DRIVER ga tegishli, USER ga emas. Mobil model buni
      // hujjat turidan hisoblaydi (`DocumentType.ownerType`) — shu test
      // esa qoida SERVERDA ham borligini isbotlaydi
      await expectLater(
        driver.api.post<Map<String, dynamic>>('/documents', body: {
          'ownerType': 'USER',
          'ownerId': driver.user.id,
          'type': 'DRIVER_LICENSE',
          'fileKey': upload.fileKey,
        }),
        throwsA(
          isA<ApiException>()
              .having((error) => error.statusCode, 'holat', 400)
              .having((error) => error.details?['allowed'], 'ruxsat etilganlar',
                  isNotNull),
        ),
      );
    });

    test('★ YUKLANMAGAN FAYL QAYD ETILMAYDI', () async {
      final driver = await signUpDriver();
      // Imzo olindi, lekin PUT qilinmadi
      final upload = PresignedUpload.fromJson(await presign(driver.api));

      // Server mijozning "yukladim" degan so'ziga ishonmaydi: aks holda
      // bazada ochilmaydigan hujjatlar to'planadi va admin navbatida
      // "fayl yo'q" chiqadi
      await expectLater(
        driver.api.post<Map<String, dynamic>>('/documents', body: {
          'ownerType': 'USER',
          'ownerId': driver.user.id,
          'type': 'PASSPORT',
          'fileKey': upload.fileKey,
        }),
        throwsA(
          isA<ApiException>()
              .having((error) => error.code, 'kod', 'FILE_NOT_UPLOADED'),
        ),
      );
    });

    test('yangi haydovchida hujjat bo\'lmaydi', () async {
      final driver = await signUpDriver();
      expect(await driver.documents.mine(), isEmpty);
    });
  });

  // ------------------------------------------------------ 2-qatlam: S3 kerak

  group('to\'liq yuklash', () {
    test('★ PRESIGN → PUT → QAYD: HUJJAT PAYDO BO\'LADI', () async {
      if (!await storageReachable()) {
        // ATAYLAB baland: o'tkazib yuborilgan test bajarilgan test emas
        markTestSkipped(
          'S3 (MinIO) javob bermayapti — yuklash oqimi TEKSHIRILMADI. '
          'Ko\'tarish: docker compose up -d minio',
        );
        return;
      }

      final driver = await signUpDriver();
      final file = await tempImage(bytes: 8192);

      final document = await driver.documents.upload(
        file: file,
        type: DocumentType.passport,
        ownerId: driver.user.id,
        pageSide: 'FRONT',
      );

      expect(document.type, DocumentType.passport);
      expect(document.verificationStatus, VerificationStatus.pending);
      expect(document.sideLabel, 'Old tomoni');
      // Havola qisqa muddatli va javob berilayotganda yasaladi
      expect(document.url, isNotEmpty);

      final mine = await driver.documents.mine();
      expect(mine.map((item) => item.id), contains(document.id));

      // HAJM S3 DAN OLINADI, mijoz aytganidan emas: "10 MB" deb aytib
      // 500 MB yuklab bo'lmasligining ikkinchi qatlami. Model bu maydonni
      // ko'rsatmaydi, shuning uchun javobning o'zi tekshiriladi
      final raw = await driver.api.get<List<dynamic>>('/documents');
      final entry = raw
          .cast<Map<String, dynamic>>()
          .firstWhere((item) => item['id'] == document.id);
      expect(entry['sizeBytes'], 8192);
      expect(entry['mimeType'], 'image/jpeg');
    });

    test('★ TASDIQLANMAGAN HUJJATNI O\'CHIRISH MUMKIN', () async {
      if (!await storageReachable()) {
        markTestSkipped('S3 (MinIO) javob bermayapti — o\'chirish TEKSHIRILMADI.');
        return;
      }

      final driver = await signUpDriver();
      final document = await driver.documents.upload(
        file: await tempImage(),
        type: DocumentType.passport,
        ownerId: driver.user.id,
      );

      await driver.documents.remove(document.id);

      // Yumshoq o'chirish: ro'yxatdan chiqadi
      expect(await driver.documents.mine(), isEmpty);
    });

    test('★ YUKLASH YETARLI EMAS — TASDIQLASH KERAK', () async {
      if (!await storageReachable()) {
        markTestSkipped('S3 (MinIO) javob bermayapti — tayyorlik TEKSHIRILMADI.');
        return;
      }

      final driver = await signUpDriver();

      await driver.documents.upload(
        file: await tempImage(),
        type: DocumentType.passport,
        ownerId: driver.user.id,
        pageSide: 'FRONT',
      );

      // BU TEST AVVAL NOTOʻGʻRI YOZILGAN EDI: hujjat yuklangach
      // "yetishmayapti" roʻyxatidan chiqadi deb kutilgandi.
      //
      // Aslida `hasIdentity` faqat `VERIFIED` hujjatni hisoblaydi
      // (`documents.service.ts`). Bu ataylab: yuklangan rasm hali
      // tekshirilmagan va u soxta boʻlishi mumkin. Agar yuklashning
      // oʻzi yetarli boʻlsa, istalgan odam boʻsh rasm yuklab reysga
      // chiqa olardi.
      //
      // Xato faqat CI da koʻrindi: lokal muhitda MinIO boʻlmagani
      // uchun bu test oʻtkazib yuborilardi.
      final readiness = await driver.api.get<Map<String, dynamic>>('/me/driver/readiness');

      expect(readiness['missingSteps'], contains('IDENTITY_DOCUMENT'));
      expect(readiness['hasIdentity'], isFalse);
      expect(readiness['canSendOffers'], isFalse);

      // Hujjatning oʻzi esa navbatda turadi
      final mine = await driver.documents.mine();
      expect(mine.single.verificationStatus, VerificationStatus.pending);
    });
  });
}
