import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SessionProvider } from '@/features/auth/session';
import { writeToken } from '@/lib/token-store';

import { OrdersPage } from './orders-page';

/**
 * Buyurtmalar ekrani.
 *
 * ASOSIY XAVFSIZLIK XUSUSIYATI: telefon raqamlari yashirilgan holda
 * keladi va ularni ochish alohida, kuzatiladigan amal. Platformaning
 * butun biznes modeli kontaktni yashirishga qurilgan.
 */

const ORDER = {
  id: 'o-1',
  publicNo: '1042',
  status: 'DISPUTED',
  priceTiyin: '45000000',
  commissionTiyin: '2250000',
  paymentStatus: 'PAID',
  createdAt: '2026-09-09T08:00:00.000Z',
  deliveredAt: null,
  cancelledAt: null,
  loadTitle: 'Sement',
  pickupAddress: 'Toshkent',
  deliveryAddress: 'Samarqand',
  shipperId: 'u-1',
  shipperFirstName: 'Ali',
  shipperLastName: 'Valiyev',
  shipperPhone: '+9989011****3',
  driverId: 'u-2',
  driverFirstName: 'Bek',
  driverLastName: 'Haydarov',
  driverPhone: '+9989012****4',
};

const DETAIL = {
  order: {
    ...ORDER,
    driverPayoutTiyin: '42750000',
    penaltyTiyin: '0',
    paymentMethod: 'CASH',
    plannedDistanceKm: '308',
    actualDistanceKm: null,
    cancelReason: null,
    confirmedAt: '2026-09-09T09:00:00.000Z',
    pickedUpAt: null,
    completedAt: null,
    loadWeightKg: '20000',
    distanceKm: '308',
    vehicleBrand: 'MAN',
    vehicleModel: 'TGX',
    vehiclePlate: '01A123BC',
    conversationId: 'c-1',
  },
  history: [
    {
      id: 'h-1',
      fromStatus: null,
      toStatus: 'ASSIGNED',
      actorRole: 'SHIPPER',
      note: null,
      createdAt: '2026-09-09T08:00:00.000Z',
      actorFirstName: 'Ali',
      actorLastName: 'Valiyev',
    },
    {
      id: 'h-2',
      fromStatus: 'ASSIGNED',
      toStatus: 'CONFIRMED',
      actorRole: 'DRIVER',
      note: null,
      createdAt: '2026-09-09T10:30:00.000Z',
      actorFirstName: 'Bek',
      actorLastName: 'Haydarov',
    },
  ],
  finance: {
    priceFormatted: '450 000 soʻm',
    commissionFormatted: '22 500 soʻm',
    driverPayoutFormatted: '427 500 soʻm',
    penaltyFormatted: '0 soʻm',
  },
};

function stubApi(options: { permissions?: string[] } = {}) {
  const calls: string[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: URL | string) => {
      const full = String(url);
      const path = full.replace('http://localhost:3000/v1', '');
      calls.push(path);

      let payload: unknown = {};
      if (path.startsWith('/admin/me')) {
        payload = {
          adminId: 'a-1',
          email: 'support@karvon.uz',
          fullName: 'Support',
          role: 'SUPPORT',
          permissions: options.permissions ?? ['*'],
        };
      } else if (path.includes('/contacts')) {
        payload = { shipperPhone: '+998901112233', driverPhone: '+998901222334' };
      } else if (path.includes('/chat')) {
        payload = {
          messages: [
            {
              id: 'm-1',
              type: 'TEXT',
              body: 'Yukni oldim',
              senderId: 'u-2',
              createdAt: '2026-09-09T11:00:00.000Z',
              readAt: null,
              senderFirstName: 'Bek',
              senderLastName: 'Haydarov',
            },
            {
              id: 'm-2',
              type: 'IMAGE',
              body: null,
              senderId: 'u-2',
              createdAt: '2026-09-09T11:05:00.000Z',
              readAt: null,
              senderFirstName: 'Bek',
              senderLastName: 'Haydarov',
            },
          ],
        };
      } else if (path.startsWith('/admin/orders/o-1')) {
        payload = DETAIL;
      } else if (path.startsWith('/admin/orders')) {
        payload = [ORDER];
      }

      const text = JSON.stringify(payload);
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(text),
        json: () => Promise.resolve(JSON.parse(text)),
      });
    }),
  );

  return calls;
}

function renderOrders() {
  writeToken('admin-token');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <SessionProvider>
      <QueryClientProvider client={client}>
        <OrdersPage />
      </QueryClientProvider>
    </SessionProvider>,
  );
}

describe('OrdersPage', () => {
  it('★ ROʻYXAT VA HOLAT KOʻRSATILADI', async () => {
    stubApi();
    renderOrders();

    expect(await screen.findByText('1042')).toBeInTheDocument();
    // "Nizoli" filtr tugmasida ham bor — jadval katakchasi qidiriladi
    expect(
      screen.getByText((_, element) => element?.tagName === 'SPAN' && element.textContent === 'Nizoli'),
    ).toBeInTheDocument();
    expect(screen.getByText('450 000 soʻm')).toBeInTheDocument();
  });

  it('★ NIZOLI FILTRI BITTA BOSISHDA', async () => {
    const calls = stubApi();
    renderOrders();

    await screen.findByText('1042');
    await userEvent.click(screen.getByRole('button', { name: 'Nizoli' }));

    // Nizoli buyurtmalar darhol ish talab qiladi va ularni topish
    // qidiruv orqali boʻlmasligi kerak
    await waitFor(() => expect(calls.some((c) => c.includes('status=DISPUTED'))).toBe(true));
  });

  it('★ QIDIRUV KECHIKTIRILADI', async () => {
    const calls = stubApi();
    renderOrders();

    await screen.findByText('1042');
    const before = calls.filter((c) => c.startsWith('/admin/orders?')).length;

    await userEvent.type(screen.getByLabelText('Qidirish'), '1042');

    await waitFor(() => {
      const after = calls.filter((c) => c.startsWith('/admin/orders?')).length;
      expect(after - before).toBeLessThanOrEqual(2);
    });
  });

  it('★ TAFSILOTDA STATUS CHIZIGʻI VA VAQT FARQI', async () => {
    stubApi();
    renderOrders();

    await userEvent.click(await screen.findByText('1042'));

    expect(await screen.findByText('Tayinlangan')).toBeInTheDocument();
    expect(screen.getByText('Tasdiqlangan')).toBeInTheDocument();
    // 08:00 → 10:30 = 2 soat 30 daqiqa. Kechikish qayerda boʻlganini
    // koʻrsatadigan yagona raqam
    expect(screen.getByText('+2 soat 30 daq')).toBeInTheDocument();
  });

  it('★ RAQAMLAR YASHIRILGAN HOLDA KELADI', async () => {
    const calls = stubApi();
    renderOrders();

    await userEvent.click(await screen.findByText('1042'));
    await screen.findByText('Tayinlangan');

    expect(screen.getByText('+9989012****4', { exact: false })).toBeInTheDocument();
    // Kontakt endpointi CHAQIRILMAYDI: buyurtmani ochish raqamlarni
    // koʻrish bilan bir xil narsa emas
    expect(calls.some((call) => call.includes('/contacts'))).toBe(false);
  });

  it('★ RAQAMLAR TALAB BOʻYICHA VA OGOHLANTIRISH BILAN', async () => {
    const calls = stubApi();
    renderOrders();

    await userEvent.click(await screen.findByText('1042'));
    await screen.findByText('Tayinlangan');

    // Oqibat OLDINDAN aytiladi — ham kontakt, ham yozishma uchun
    expect(screen.getAllByText(/audit jurnaliga yoziladi/)).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: 'Raqamlarni koʻrsatish' }));

    await waitFor(() => expect(calls.some((call) => call.includes('/contacts'))).toBe(true));
    expect(await screen.findByText('+998901222334', { exact: false })).toBeInTheDocument();
  });

  it('★ YOZISHMA HAM TALAB BOʻYICHA', async () => {
    const calls = stubApi();
    renderOrders();

    await userEvent.click(await screen.findByText('1042'));
    await screen.findByText('Tayinlangan');

    expect(calls.some((call) => call.includes('/chat'))).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Yozishmani koʻrsatish' }));

    expect(await screen.findByText('Yukni oldim')).toBeInTheDocument();
    // Matnsiz xabar (rasm) — turi koʻrsatiladi, aks holda qator boʻsh
    // koʻrinardi va operator "xabar yoʻqolgan" deb oʻylardi
    expect(screen.getByText('[IMAGE]')).toBeInTheDocument();
  });

  it('★ chat.view YOʻQ BOʻLSA YOZISHMA BOʻLIMI KOʻRINMAYDI', async () => {
    // Moliyachi yoki moderatorga begonalarning yozishmasini oʻqish
    // kerak emas
    stubApi({ permissions: ['orders.view'] });
    renderOrders();

    await userEvent.click(await screen.findByText('1042'));
    await screen.findByText('Tayinlangan');

    expect(screen.queryByRole('button', { name: 'Yozishmani koʻrsatish' })).toBeNull();
  });
});
