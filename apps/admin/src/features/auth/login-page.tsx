import { useState, type FormEvent } from 'react';

import { Alert, Button, Card, Field, Input } from '@/components/ui';
import { ApiError } from '@/lib/api-error';

import { useSession, type LogoutReason } from './session';

/**
 * Chiqarilish sababi.
 *
 * Sababsiz kirish ekrani operatorni chalg'itadi: u parolni yana bir
 * marta kiritadi, keyin yana chiqib qoladi va nima bo'layotganini
 * tushunmaydi.
 */
const LOGOUT_MESSAGES: Record<LogoutReason, string | null> = {
  manual: null,
  expired: 'Sessiya muddati tugadi. Qaytadan kiring.',
  idle: '30 daqiqa harakatsizlikdan keyin tizimdan chiqarildingiz.',
};

export function LoginPage() {
  const { login, logoutReason } = useSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const notice = logoutReason ? LOGOUT_MESSAGES[logoutReason] : null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      await login({ email: email.trim(), password, totp: totp.trim() });
    } catch (cause) {
      // SERVER MATNI TO'G'RIDAN-TO'G'RI: u ataylab UMUMIY ("Email yoki
      // parol noto'g'ri") va qaysi biri xato ekanini oshkor qilmaydi —
      // aks holda mavjud adminlarni email bo'yicha topish mumkin bo'lardi.
      // Shu matnni "aniqlashtirish" himoyani buzardi.
      setError(
        cause instanceof ApiError ? cause.message : 'Kutilmagan xato. Qaytadan urinib ko‘ring.',
      );
      // Parol maydonini tozalaymiz, TOTP ni ham: kod bir martalik va
      // 30 soniyada yangilanadi, eski kod bilan qayta urinish behuda
      setPassword('');
      setTotp('');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-slate-900">Karvon</h1>
          <p className="mt-1 text-sm text-slate-500">Admin paneli</p>
        </div>

        <Card>
          {/* `void submit(...)` — React `onSubmit` dan `void` kutadi va
              promise qaytarilsa rad etilishi hech kim tomonidan
              ushlanmaydi (unhandled rejection). Xato `submit` ichida
              qayta ishlanadi. */}
          <form
            onSubmit={(event) => {
              void submit(event);
            }}
            className="flex flex-col gap-4"
            noValidate
          >
            {notice ? <Alert tone="warn">{notice}</Alert> : null}
            {error ? <Alert tone="error">{error}</Alert> : null}

            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                required
                autoFocus
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>

            <Field label="Parol" htmlFor="password">
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>

            <Field
              label="Autentifikator kodi"
              htmlFor="totp"
              hint="Ilovadagi 6 raqamli kod. Ikki faktor majburiy."
            >
              <Input
                id="totp"
                name="totp"
                // `inputMode="numeric"` — mobil klaviaturada raqamlar chiqadi.
                // `type="number"` EMAS: u boshdagi nolni yo'qotadi va
                // "012345" kodi "12345" bo'lib qoladi
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={totp}
                onChange={(event) =>
                  // Faqat raqamlar: nusxa-ko'chirishda bo'sh joy tushib
                  // qolishi eng ko'p uchraydigan xato
                  setTotp(event.target.value.replace(/\D/g, '').slice(0, 6))
                }
                className="font-mono tracking-widest"
              />
            </Field>

            <Button type="submit" loading={pending} className="mt-2 w-full">
              Kirish
            </Button>
          </form>
        </Card>

        <p className="mt-4 text-center text-xs text-slate-400">
          5 marta noto‘g‘ri urinishdan keyin akkaunt 15 daqiqaga bloklanadi.
        </p>
      </div>
    </main>
  );
}
