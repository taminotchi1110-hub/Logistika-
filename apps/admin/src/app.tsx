import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { AppShell } from '@/components/app-shell';
import { Card } from '@/components/ui';
import { LoginPage } from '@/features/auth/login-page';
import { useSession } from '@/features/auth/session';
import { NAV_ITEMS } from '@/nav';

/**
 * Ilova ildizi.
 *
 * MARSHRUTLAR AUTENTIFIKATSIYADAN KEYIN QURILADI. Odatda "himoyalangan
 * marshrut" komponenti yasaladi va har bir sahifaga o'raladi, lekin
 * bunda bittasini o'ramaslik oson va u ochiq qoladi. Bu yerda esa
 * kirmagan foydalanuvchi uchun router UMUMAN yo'q — himoya teshigi
 * paydo bo'lishi mumkin bo'lgan joy ham yo'q.
 *
 * (Mobil ilovada boshqacha: u chuqur havolalarni qo'llab-quvvatlaydi va
 * shuning uchun bitta `redirect` qoidasi ishlatiladi. Admin panelda
 * chuqur havola kerak emas.)
 */
export function App() {
  const { status } = useSession();

  if (status === 'loading') return <SessionLoading />;
  if (status === 'anonymous') return <LoginPage />;

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          {NAV_ITEMS.map((item) =>
            item.path === '/' ? (
              <Route key={item.path} index element={<Placeholder title={item.label} />} />
            ) : (
              <Route
                key={item.path}
                path={item.path}
                element={<Placeholder title={item.label} />}
              />
            ),
          )}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

/**
 * Sessiya tekshirilmoqda.
 *
 * Sahifa yangilanganda token bor, lekin u haqiqiyligi hali ma'lum emas
 * (`GET /admin/me` ketmoqda). Bu paytda kirish formasini ko'rsatish
 * xato bo'lardi: operator parol yozishni boshlaydi va forma ostidan
 * yo'qoladi.
 */
function SessionLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
      <p className="text-sm text-slate-500">Sessiya tekshirilmoqda…</p>
    </div>
  );
}

/**
 * Hali yozilmagan ekran.
 *
 * ATAYLAB OCHIQ AYTILADI. Bo'sh sahifa yoki "xato" ko'rsatish operatorni
 * chalg'itadi — u nosozlik deb o'ylab, qo'llab-quvvatlashga yozadi.
 * Har bir keyingi qadam bitta shu joy o'rniga haqiqiy ekran qo'yadi.
 */
function Placeholder({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-xl font-semibold text-slate-900">{title}</h1>
      <Card>
        <p className="text-sm text-slate-600">
          Bu bo‘lim hali tayyor emas. Backend endpointi mavjud, interfeys keyingi qadamda
          qo‘shiladi.
        </p>
      </Card>
    </div>
  );
}

function NotFound() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-xl font-semibold text-slate-900">Sahifa topilmadi</h1>
      <Card>
        <p className="text-sm text-slate-600">
          Bunday manzil yo‘q. Chapdagi menyudan bo‘lim tanlang.
        </p>
      </Card>
    </div>
  );
}
