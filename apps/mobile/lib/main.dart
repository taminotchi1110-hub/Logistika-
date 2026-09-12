import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'core/notifications/push_registration.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Faqat portret: haydovchi telefonni tutqichda vertikal ushlaydi va
  // gorizontal rejim xaritada foydali bo'lsa-da, formalarda buziladi.
  // Keyingi bosqichda xarita ekranida gorizontalga ruxsat beriladi.
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  // Push ixtiyoriy: Firebase konfiguratsiyasi (google-services.json /
  // GoogleService-Info.plist) bo'lmasa ilova pushsiz ishlaydi
  final pushAvailable = await initializeFirebase();

  runApp(
    ProviderScope(
      overrides: [pushAvailableProvider.overrideWithValue(pushAvailable)],
      child: const KarvonApp(),
    ),
  );
}
