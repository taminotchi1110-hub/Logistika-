import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../data/wallet_repository.dart';
import '../domain/wallet.dart';

final walletRepositoryProvider = Provider<WalletRepository>((ref) {
  return WalletRepository(ref.watch(apiClientProvider));
});

final walletProvider = FutureProvider<Wallet>((ref) {
  return ref.watch(walletRepositoryProvider).balance();
});

final walletHistoryProvider = FutureProvider<List<LedgerEntry>>((ref) {
  return ref.watch(walletRepositoryProvider).history();
});

final payoutsProvider = FutureProvider<List<Payout>>((ref) {
  return ref.watch(walletRepositoryProvider).payouts();
});
