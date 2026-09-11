import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/app_states.dart';
import '../../profile/presentation/profile_providers.dart';
import '../../vehicles/data/vehicles_repository.dart';
import '../data/documents_repository.dart';
import '../domain/document.dart';

final documentsRepositoryProvider = Provider<DocumentsRepository>((ref) {
  return DocumentsRepository(ref.watch(apiClientProvider));
});

final myDocumentsProvider = FutureProvider<List<UserDocument>>((ref) {
  return ref.watch(documentsRepositoryProvider).mine();
});

/// Hujjatlar.
///
/// NEGA HUJJAT KERAKLIGI TUSHUNTIRILADI: pasport nusxasini yuklash —
/// foydalanuvchi uchun sezilarli qadam va u "nega?" degan savol
/// tug'diradi. Sababi aytilmasa odam tashlab ketadi yoki qo'llab-
/// quvvatlashga yozadi.
class DocumentsScreen extends ConsumerStatefulWidget {
  const DocumentsScreen({super.key});

  @override
  ConsumerState<DocumentsScreen> createState() => _DocumentsScreenState();
}

class _DocumentsScreenState extends ConsumerState<DocumentsScreen> {
  bool _isUploading = false;

  @override
  Widget build(BuildContext context) {
    final documents = ref.watch(myDocumentsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Hujjatlar')),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(myDocumentsProvider.future),
        child: documents.when(
          loading: () => const LoadingState(),
          error: (error, _) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            children: [
              SizedBox(height: MediaQuery.sizeOf(context).height * 0.15),
              ErrorState(
                error: error,
                onRetry: () => ref.invalidate(myDocumentsProvider),
              ),
            ],
          ),
          data: _body,
        ),
      ),
    );
  }

  Widget _body(List<UserDocument> documents) {
    final theme = Theme.of(context);

    // Haydovchi oʻzi yuklaydigan turlar. POD, WAYBILL va shu kabilarni
    // tizim buyurtma davomida oʻzi yaratadi — ular bu yerda koʻrinmaydi
    const required = [
      DocumentType.passport,
      DocumentType.driverLicense,
    ];
    const optional = [
      DocumentType.vehicleReg,
      DocumentType.insurance,
    ];

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        Container(
          padding: const EdgeInsets.all(AppSpacing.lg),
          decoration: BoxDecoration(
            color: AppColors.infoLight,
            borderRadius: BorderRadius.circular(AppRadius.lg),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.shield_outlined, color: AppColors.info),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Text(
                  // NEGA kerakligi — quruq talab qarshilik uygʻotadi
                  'Hujjatlar mijozlar sizga ishonishi uchun kerak: yukini '
                  'notanish odamga topshirayotgan odam kim bilan ishlayotganini '
                  'bilishi shart. Hujjatlaringizni faqat administrator koʻradi.',
                  style: theme.textTheme.bodySmall?.copyWith(color: AppColors.info),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.xl),

        Text('Majburiy', style: theme.textTheme.titleSmall),
        const SizedBox(height: AppSpacing.md),
        for (final type in required)
          _DocumentSlot(
            type: type,
            documents: documents.where((doc) => doc.type == type).toList(),
            isUploading: _isUploading,
            onUpload: (side) => _upload(type, side),
            onRemove: _remove,
          ),

        const SizedBox(height: AppSpacing.lg),
        Text('Qoʻshimcha', style: theme.textTheme.titleSmall),
        const SizedBox(height: AppSpacing.xs),
        Text(
          'Sugʻurta va texnik pasport boʻlsa, mijozlar sizni tezroq tanlaydi.',
          style: theme.textTheme.bodySmall?.copyWith(
            color: AppColors.textSecondary,
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        for (final type in optional)
          _DocumentSlot(
            type: type,
            documents: documents.where((doc) => doc.type == type).toList(),
            isUploading: _isUploading,
            onUpload: (side) => _upload(type, side),
            onRemove: _remove,
          ),

        const SizedBox(height: AppSpacing.xxxl),
      ],
    );
  }

  /// Fayl tanlab yuklaydi.
  ///
  /// KAMERA BIRINCHI: hujjat nusxasi odatda shu yerda olinadi va
  /// galereyadan qidirish qoʻshimcha qadam boʻlardi.
  Future<void> _upload(DocumentType type, String? pageSide) async {
    final source = await _askSource();
    if (source == null || !mounted) return;

    final picked = await ImagePicker().pickImage(
      source: source,
      // Hujjat oʻqilishi kerak, lekin 12 MP rasm ortiqcha: yuklash
      // sekinlashadi va mobil trafik behuda ketadi
      maxWidth: 2000,
      imageQuality: 85,
    );
    if (picked == null || !mounted) return;

    final ownerId = await _resolveOwnerId(type);
    if (ownerId == null || !mounted) return;

    setState(() => _isUploading = true);

    try {
      await ref.read(documentsRepositoryProvider).upload(
            file: File(picked.path),
            type: type,
            ownerId: ownerId,
            pageSide: pageSide,
          );

      if (!mounted) return;
      ref.invalidate(myDocumentsProvider);
      ref.invalidate(driverReadinessProvider);
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(localizeError(context, error)),
          backgroundColor: AppColors.danger,
        ),
      );
    } finally {
      if (mounted) setState(() => _isUploading = false);
    }
  }

  Future<ImageSource?> _askSource() {
    return showModalBottomSheet<ImageSource>(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_rounded),
              title: const Text('Suratga olish'),
              onTap: () => Navigator.pop(context, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_rounded),
              title: const Text('Galereyadan tanlash'),
              onTap: () => Navigator.pop(context, ImageSource.gallery),
            ),
          ],
        ),
      ),
    );
  }

  /// Hujjat kimga tegishli.
  ///
  /// Shaxsiy hujjatlarda — foydalanuvchi ID'si, transport
  /// hujjatlarida — transport ID'si. Transport bir nechta bo'lsa
  /// tanlash so'raladi.
  Future<String?> _resolveOwnerId(DocumentType type) async {
    final user = ref.read(currentUserProvider);
    if (user == null) return null;
    if (!type.isVehicleDocument) return user.id;

    final vehicles = await ref.read(myVehiclesProvider.future);
    if (!mounted) return null;

    if (vehicles.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Avval transport qoʻshing')),
      );
      return null;
    }
    if (vehicles.length == 1) return vehicles.first.id;

    return showDialog<String>(
      context: context,
      builder: (context) => SimpleDialog(
        title: const Text('Qaysi transport?'),
        children: [
          for (final vehicle in vehicles)
            SimpleDialogOption(
              onPressed: () => Navigator.pop(context, vehicle.id),
              child: Text('${vehicle.brand} ${vehicle.model} · ${vehicle.plateFormatted}'),
            ),
        ],
      ),
    );
  }

  Future<void> _remove(UserDocument document) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Hujjatni oʻchirish'),
        content: Text(
          '${document.type.label} oʻchiriladi. Verifikatsiya uchun uni '
          'qayta yuklashingiz kerak boʻladi.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Bekor qilish'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text(
              'Oʻchirish',
              style: TextStyle(color: AppColors.danger),
            ),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    try {
      await ref.read(documentsRepositoryProvider).remove(document.id);
      if (!mounted) return;
      ref.invalidate(myDocumentsProvider);
      ref.invalidate(driverReadinessProvider);
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(localizeError(context, error)),
          backgroundColor: AppColors.danger,
        ),
      );
    }
  }
}

/// Bitta hujjat turi uchun blok.
class _DocumentSlot extends StatelessWidget {
  const _DocumentSlot({
    required this.type,
    required this.documents,
    required this.isUploading,
    required this.onUpload,
    required this.onRemove,
  });

  final DocumentType type;
  final List<UserDocument> documents;
  final bool isUploading;
  final void Function(String? pageSide) onUpload;
  final void Function(UserDocument document) onRemove;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.md),
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(AppRadius.lg),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(type.label, style: theme.textTheme.bodyLarge)),
              if (documents.isEmpty)
                TextButton.icon(
                  onPressed: isUploading
                      ? null
                      : () => onUpload(type.hasTwoSides ? 'FRONT' : null),
                  icon: const Icon(Icons.upload_rounded, size: AppSizes.iconSm),
                  label: const Text('Yuklash'),
                ),
            ],
          ),

          if (documents.isEmpty)
            Text(
              type.hasTwoSides
                  ? 'Ikkala tomonini ham yuklang'
                  : 'Rasm yoki PDF',
              style: theme.textTheme.bodySmall?.copyWith(
                color: AppColors.textSecondary,
              ),
            )
          else
            for (final document in documents)
              _DocumentRow(document: document, onRemove: () => onRemove(document)),

          // Ikki tomonli hujjatda ikkinchi tomon yetishmasa — aytamiz
          if (type.hasTwoSides &&
              documents.isNotEmpty &&
              !documents.any((doc) => doc.pageSide == 'BACK')) ...[
            const SizedBox(height: AppSpacing.sm),
            TextButton.icon(
              onPressed: isUploading ? null : () => onUpload('BACK'),
              icon: const Icon(Icons.add_rounded, size: AppSizes.iconSm),
              label: const Text('Orqa tomonini yuklash'),
            ),
          ],
        ],
      ),
    );
  }
}

class _DocumentRow extends StatelessWidget {
  const _DocumentRow({required this.document, required this.onRemove});

  final UserDocument document;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final status = document.verificationStatus;

    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                status.isVerified
                    ? Icons.check_circle_rounded
                    : document.isRejected
                        ? Icons.error_rounded
                        : Icons.schedule_rounded,
                size: AppSizes.iconSm,
                color: status.isVerified
                    ? AppColors.success
                    : document.isRejected
                        ? AppColors.danger
                        : AppColors.gray400,
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  [document.sideLabel, status.label]
                      .where((part) => part.isNotEmpty)
                      .join(' · '),
                  style: theme.textTheme.bodyMedium,
                ),
              ),
              // Tasdiqlangan hujjatni oʻchirish mumkin emas: u
              // verifikatsiyaning asosi va uni yoʻqotish haydovchini
              // ishdan chetlatadi
              if (!status.isVerified)
                IconButton(
                  icon: const Icon(Icons.delete_outline_rounded, size: AppSizes.iconSm),
                  color: AppColors.gray400,
                  onPressed: onRemove,
                  tooltip: 'Oʻchirish',
                ),
            ],
          ),

          if (document.isRejected && document.rejectionReason != null)
            Padding(
              padding: const EdgeInsets.only(left: 26),
              child: Text(
                document.rejectionReason!,
                style: theme.textTheme.bodySmall?.copyWith(color: AppColors.danger),
              ),
            ),

          // Muddati tugayotgan hujjat — reys oʻrtasida tugashi mumkin emas
          if (document.isExpiringSoon)
            Padding(
              padding: const EdgeInsets.only(left: 26),
              child: Text(
                document.isExpired
                    ? 'Amal qilish muddati tugagan — yangisini yuklang'
                    : 'Amal qilish muddati tugayapti',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: document.isExpired ? AppColors.danger : AppColors.warning,
                ),
              ),
            ),
        ],
      ),
    );
  }
}
