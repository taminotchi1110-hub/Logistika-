import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../features/auth/data/auth_repository.dart';
import '../features/auth/domain/user.dart';
import 'api/api_client.dart';
import 'api/api_exception.dart';
import 'l10n/locale_controller.dart';
import 'storage/token_storage.dart';

/// Ilova bo'ylab umumiy provayderlar.
///
/// NEGA BITTA FAYLDA: bu provayderlar bir-biriga bog'langan zanjir
/// (storage → api → repository → holat). Ularni fayllarga tarqatish
/// import'lar chalkashligini keltirib chiqaradi. Feature'ga xos
/// provayderlar esa o'z papkasida turadi.

final tokenStorageProvider = Provider<TokenStorage>((ref) => TokenStorage());

/// HALQA BOG'LANISH BO'LMASLIGI UCHUN: bu provayder `authStateProvider`
/// ga MUROJAAT QILMAYDI.
///
/// Ilgari `onSessionExpired` shu yerda o'rnatilgan edi va zanjir
/// halqaga aylanardi: apiClient → authState → authRepository → apiClient.
/// Ishga tushishda muammo bermasa ham, Dart tur chiqarishni bajara
/// olmasdi va butun zanjir `dynamic` bo'lib qolardi — natijada
/// kompilyator xatolarni umuman ushlamas edi.
///
/// Endi bog'lanish bir tomonlama: `AuthNotifier` o'zi mijozga
/// obuna bo'ladi.
final apiClientProvider = Provider<ApiClient>((ref) {
  final client = ApiClient(storage: ref.watch(tokenStorageProvider));

  // Til `listen` bilan kuzatiladi, `watch` bilan EMAS: til o'zgarganda
  // mijoz qayta yaratilmaydi — aks holda token yangilash navbati va
  // sessiya callback'i yo'qolardi
  ref.listen<AppLocale>(
    localeControllerProvider,
    (_, next) => client.language = next.code,
    fireImmediately: true,
  );

  return client;
});

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepository(
    api: ref.watch(apiClientProvider),
    storage: ref.watch(tokenStorageProvider),
  );
});

// =====================================================================
//  Autentifikatsiya holati
// =====================================================================

/// Ilovaning kirish holati.
///
/// Router shu holatga qarab yo'naltiradi:
///   `unknown`        → splash (tokenni tekshirmoqda)
///   `unauthenticated`→ telefon kiritish
///   `needsProfile`   → ism va rol
///   `authenticated`  → asosiy ekran
///   `blocked`        → bloklangan akkaunt ekrani
enum AuthStatus { unknown, unauthenticated, needsProfile, authenticated, blocked }

class AuthState {
  const AuthState({required this.status, this.user, this.error});

  const AuthState.unknown() : status = AuthStatus.unknown, user = null, error = null;

  final AuthStatus status;
  final AppUser? user;
  final String? error;

  bool get isAuthenticated => status == AuthStatus.authenticated;

  AuthState copyWith({AuthStatus? status, AppUser? user, String? error}) {
    return AuthState(
      status: status ?? this.status,
      user: user ?? this.user,
      error: error,
    );
  }
}

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier(this._repository, this._storage, ApiClient api)
      : super(const AuthState.unknown()) {
    // Sessiya butunlay tugaganda (refresh ham yordam bermadi) mijoz
    // shu callback'ni chaqiradi va router login ekraniga yo'naltiradi
    api.onSessionExpired = onSessionExpired;
  }

  final AuthRepository _repository;
  final TokenStorage _storage;

  /// Ilova ochilganda: saqlangan sessiya bormi va u hali amal qiladimi.
  Future<void> restore() async {
    if (!await _storage.hasSession()) {
      state = const AuthState(status: AuthStatus.unauthenticated);
      return;
    }

    try {
      final user = await _repository.me();
      state = _stateFor(user);
    } on ApiException catch (error) {
      // Tarmoq yo'q bo'lsa — foydalanuvchini chiqarib yubormaymiz.
      // Ilova oflayn rejimda ochiladi va so'rovlar keyin qayta uriniladi.
      if (error.isNetwork) {
        state = const AuthState(status: AuthStatus.authenticated);
        return;
      }
      await _storage.clear();
      state = const AuthState(status: AuthStatus.unauthenticated);
    }
  }

  Future<OtpChallenge> requestOtp(String phone) => _repository.requestOtp(phone);

  Future<bool> verifyOtp({required String phone, required String code}) async {
    final result = await _repository.verifyOtp(phone: phone, code: code);
    state = _stateFor(result.user);
    return result.isNewUser;
  }

  Future<void> completeProfile({
    required String firstName,
    required String lastName,
    required UserRole role,
  }) async {
    final user = await _repository.completeProfile(
      firstName: firstName,
      lastName: lastName,
      role: role,
    );
    state = _stateFor(user);
  }

  Future<void> refreshUser() async {
    try {
      state = _stateFor(await _repository.me());
    } on ApiException {
      // Joriy holat saqlanadi
    }
  }

  void setUser(AppUser user) => state = _stateFor(user);

  Future<void> logout() async {
    await _repository.logout();
    state = const AuthState(status: AuthStatus.unauthenticated);
  }

  void onSessionExpired() {
    state = const AuthState(status: AuthStatus.unauthenticated);
  }

  AuthState _stateFor(AppUser user) {
    final status = switch (user.status) {
      UserStatus.pendingProfile => AuthStatus.needsProfile,
      UserStatus.active => AuthStatus.authenticated,
      UserStatus.banned || UserStatus.suspended => AuthStatus.blocked,
      UserStatus.deleted => AuthStatus.unauthenticated,
    };

    return AuthState(status: status, user: user);
  }
}

final authStateProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(
    ref.watch(authRepositoryProvider),
    ref.watch(tokenStorageProvider),
    ref.watch(apiClientProvider),
  );
});

/// Joriy foydalanuvchi — ko'p joyda kerak bo'ladi.
final currentUserProvider = Provider<AppUser?>((ref) {
  return ref.watch(authStateProvider).user;
});
