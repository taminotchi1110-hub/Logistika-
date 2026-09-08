import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Faqat portret: haydovchi telefonni tutqichda vertikal ushlaydi va
  // gorizontal rejim xaritada foydali bo'lsa-da, formalarda buziladi.
  // Keyingi bosqichda xarita ekranida gorizontalga ruxsat beriladi.
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  runApp(const ProviderScope(child: KarvonApp()));
}
