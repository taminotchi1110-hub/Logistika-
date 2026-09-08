import 'package:dio/dio.dart';

import '../config/app_config.dart';
import '../storage/token_storage.dart';
import 'api_exception.dart';

/// Backend bilan ishlash.
///
/// UCH XIL MUAMMO HAL QILINADI:
///
///   1. **Token yangilash.** Access token 15 daqiqa yashaydi. 401
///      kelganda mijoz avtomatik yangilaydi va so'rovni QAYTA yuboradi.
///      Foydalanuvchi buni sezmaydi.
///
///   2. **Parallel so'rovlar.** Ilova bir vaqtda 5 ta so'rov yuborsa va
///      hammasi 401 olsa — 5 marta yangilash noto'g'ri bo'lardi (refresh
///      token rotatsiyasi buziladi va backend `AUTH_REFRESH_REUSED`
///      qaytaradi). Shuning uchun yangilash BITTA marta bajariladi,
///      qolganlari uni kutadi.
///
///   3. **Xatolarni bir shaklga keltirish.** Tarmoq xatosi, timeout va
///      backend xatosi — hammasi `ApiException` bo'lib chiqadi. UI
///      qatlami Dio haqida bilmaydi.
class ApiClient {
  ApiClient({required TokenStorage storage, Dio? dio})
      : _storage = storage,
        _dio = dio ?? Dio() {
    _dio.options
      ..baseUrl = AppConfig.apiBaseUrl
      ..connectTimeout = const Duration(seconds: 15)
      ..receiveTimeout = const Duration(seconds: 30)
      ..sendTimeout = const Duration(seconds: 30)
      ..headers = {'Content-Type': 'application/json'}
      // Xato statuslarni ham qabul qilamiz: ularni o'zimiz qayta ishlaymiz
      ..validateStatus = (status) => status != null && status < 500;

    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: _onRequest,
        onResponse: _onResponse,
        onError: _onError,
      ),
    );
  }

  final Dio _dio;
  final TokenStorage _storage;

  /// Token yangilanayotgan bo'lsa — shu Future. Parallel so'rovlar
  /// yangi yangilash boshlamaydi, shuni kutadi.
  Future<String?>? _refreshing;

  /// Sessiya butunlay tugaganda chaqiriladi — ilova login ekraniga o'tadi.
  void Function()? onSessionExpired;

  Future<void> _onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    // `skipAuth` — OTP va refresh so'rovlari uchun
    if (options.extra['skipAuth'] != true) {
      final token = await _storage.readAccessToken();
      if (token != null) {
        options.headers['Authorization'] = 'Bearer $token';
      }
    }
    handler.next(options);
  }

  void _onResponse(Response<dynamic> response, ResponseInterceptorHandler handler) {
    handler.next(response);
  }

  Future<void> _onError(DioException error, ErrorInterceptorHandler handler) async {
    handler.reject(error);
  }

  // ------------------------------------------------------------ HTTP

  Future<T> get<T>(
    String path, {
    Map<String, dynamic>? query,
    bool skipAuth = false,
  }) {
    return _request<T>(
      () => _dio.get<dynamic>(
        path,
        queryParameters: query,
        options: Options(extra: {'skipAuth': skipAuth}),
      ),
      path: path,
      skipAuth: skipAuth,
    );
  }

  Future<T> post<T>(
    String path, {
    Object? body,
    Map<String, dynamic>? query,
    bool skipAuth = false,
  }) {
    return _request<T>(
      () => _dio.post<dynamic>(
        path,
        data: body,
        queryParameters: query,
        options: Options(extra: {'skipAuth': skipAuth}),
      ),
      path: path,
      skipAuth: skipAuth,
    );
  }

  Future<T> patch<T>(String path, {Object? body}) {
    return _request<T>(() => _dio.patch<dynamic>(path, data: body), path: path);
  }

  Future<T> put<T>(String path, {Object? body}) {
    return _request<T>(() => _dio.put<dynamic>(path, data: body), path: path);
  }

  Future<T> delete<T>(String path) {
    return _request<T>(() => _dio.delete<dynamic>(path), path: path);
  }

  /// So'rovni bajaradi, 401 bo'lsa tokenni yangilab QAYTA yuboradi.
  Future<T> _request<T>(
    Future<Response<dynamic>> Function() send, {
    required String path,
    bool skipAuth = false,
    bool isRetry = false,
  }) async {
    late Response<dynamic> response;

    try {
      response = await send();
    } on DioException catch (error) {
      throw _mapDioError(error);
    }

    final status = response.statusCode ?? 0;

    if (status >= 200 && status < 300) {
      return _unwrap<T>(response.data);
    }

    final exception = _mapErrorBody(response);

    // Token eskirgan — bir marta yangilab, qayta urinamiz
    if (status == 401 && !skipAuth && !isRetry && !exception.requiresLoginHard) {
      final refreshed = await _refreshToken();
      if (refreshed != null) {
        return _request<T>(send, path: path, skipAuth: skipAuth, isRetry: true);
      }
    }

    if (status == 401) {
      await _storage.clear();
      onSessionExpired?.call();
    }

    throw exception;
  }

  /// Tokenni yangilaydi. Parallel chaqiruvlar bitta so'rovni kutadi.
  Future<String?> _refreshToken() {
    // Allaqachon yangilanayotgan bo'lsa — o'shani qaytaramiz
    return _refreshing ??= _doRefresh().whenComplete(() => _refreshing = null);
  }

  Future<String?> _doRefresh() async {
    final refreshToken = await _storage.readRefreshToken();
    if (refreshToken == null) return null;

    try {
      final response = await _dio.post<dynamic>(
        '/auth/refresh',
        data: {'refreshToken': refreshToken},
        options: Options(extra: {'skipAuth': true}),
      );

      final status = response.statusCode ?? 0;
      if (status < 200 || status >= 300) return null;

      final data = _unwrap<Map<String, dynamic>>(response.data);
      final access = data['accessToken'] as String?;
      final refresh = data['refreshToken'] as String?;

      if (access == null || refresh == null) return null;

      await _storage.saveTokens(accessToken: access, refreshToken: refresh);
      return access;
    } on DioException {
      return null;
    }
  }

  /// Backend javobi `{ data, meta }` qobig'ida keladi.
  T _unwrap<T>(dynamic body) {
    if (body is Map<String, dynamic> && body.containsKey('data')) {
      final data = body['data'];
      // Ro'yxat javobida `meta.nextCursor` bo'ladi — chaqiruvchi
      // uni alohida `getPage()` orqali oladi
      return data as T;
    }
    return body as T;
  }

  ApiException _mapErrorBody(Response<dynamic> response) {
    final body = response.data;

    if (body is Map<String, dynamic> && body['error'] is Map) {
      final error = body['error'] as Map<String, dynamic>;
      return ApiException(
        code: error['code']?.toString() ?? 'UNKNOWN',
        message: error['message']?.toString() ?? 'Nomaʼlum xatolik',
        statusCode: response.statusCode,
        details: error['details'] as Map<String, dynamic>?,
        requestId: error['requestId']?.toString(),
      );
    }

    return ApiException(
      code: 'UNKNOWN',
      message: 'Server kutilmagan javob qaytardi',
      statusCode: response.statusCode,
    );
  }

  ApiException _mapDioError(DioException error) {
    final code = switch (error.type) {
      DioExceptionType.connectionTimeout ||
      DioExceptionType.sendTimeout ||
      DioExceptionType.receiveTimeout =>
        'TIMEOUT',
      DioExceptionType.connectionError => 'NETWORK_ERROR',
      DioExceptionType.badCertificate => 'NETWORK_ERROR',
      DioExceptionType.cancel => 'CANCELLED',
      _ => 'NETWORK_ERROR',
    };

    return ApiException(
      code: code,
      message: error.message ?? 'Tarmoq xatosi',
      statusCode: error.response?.statusCode,
    );
  }

  /// Sahifalangan javob: `data` va `meta.nextCursor` birga kerak.
  Future<PagedResult<dynamic>> getPage(
    String path, {
    Map<String, dynamic>? query,
  }) async {
    late Response<dynamic> response;
    try {
      response = await _dio.get<dynamic>(path, queryParameters: query);
    } on DioException catch (error) {
      throw _mapDioError(error);
    }

    final status = response.statusCode ?? 0;
    if (status < 200 || status >= 300) {
      if (status == 401) {
        final refreshed = await _refreshToken();
        if (refreshed != null) return getPage(path, query: query);
        await _storage.clear();
        onSessionExpired?.call();
      }
      throw _mapErrorBody(response);
    }

    final body = response.data as Map<String, dynamic>;
    final meta = body['meta'] as Map<String, dynamic>? ?? const {};

    return PagedResult<dynamic>(
      items: (body['data'] as List<dynamic>?) ?? const [],
      nextCursor: meta['nextCursor'] as String?,
      hasMore: meta['hasMore'] as bool? ?? false,
    );
  }
}

class PagedResult<T> {
  const PagedResult({
    required this.items,
    required this.nextCursor,
    required this.hasMore,
  });

  final List<T> items;
  final String? nextCursor;
  final bool hasMore;
}

extension on ApiException {
  /// Yangilash yordam bermaydigan holatlar: refresh token o'g'irlangan
  /// yoki sessiya admin tomonidan yopilgan.
  bool get requiresLoginHard =>
      code == 'AUTH_REFRESH_REUSED' || code == 'AUTH_SESSION_REVOKED';
}
