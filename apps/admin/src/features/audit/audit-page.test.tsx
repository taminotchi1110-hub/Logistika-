import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { writeToken } from '@/lib/token-store';

import { AuditPage, diffFields, formatMoment } from './audit-page';

/**
 * Audit jurnali.
 *
 * Bu — admin o'zboshimchaligiga qarshi yagona himoya. Ekranda hech
 * qanday o'zgartirish amali yo'q va bo'lmasligi ham kerak.
 */

describe('diffFields', () => {
  it('★ FAQAT OʻZGARGAN MAYDONLAR KOʻRSATILADI', () => {
    // Butun JSON koʻrsatilsa, "kim komissiyani koʻtardi?" degan
    // savolga javob oʻttiz qator ichidan izlanardi
    const changes = diffFields(
      { status: 'ACTIVE', name: 'Ali', rating: 5 },
      { status: 'BANNED', name: 'Ali', rating: 5 },
    );

    expect(changes).toEqual([{ field: 'status', from: 'ACTIVE', to: 'BANNED' }]);
  });

  it('★ YANGI MAYDON "—" DAN KELADI', () => {
    const changes = diffFields({}, { reason: 'Firibgarlik' });
    expect(changes).toEqual([{ field: 'reason', from: '—', to: 'Firibgarlik' }]);
  });

  it('★ null VA undefined YIQITMAYDI', () => {
    // Server `before` ni yaratish amallarida `null` qilib yuboradi
    expect(diffFields(null, { key: 'commission' })).toEqual([
      { field: 'key', from: '—', to: 'commission' },
    ]);
    expect(diffFields(null, null)).toEqual([]);
    expect(diffFields(undefined, undefined)).toEqual([]);
  });

  it('obyekt va son qiymatlar oʻqiladigan koʻrinishda', () => {
    const changes = diffFields({ value: 0.05 }, { value: 0.12 });
    expect(changes).toEqual([{ field: 'value', from: '0.05', to: '0.12' }]);
  });

  it('★ OBYEKT BOʻLMAGAN QIYMAT YIQITMAYDI', () => {
    // Kutilmagan shakl kelsa, jurnal ochilishda davom etishi kerak —
    // aynan shu ekran nosozlik tekshiruvida kerak boʻladi
    expect(diffFields('satr', 42)).toEqual([]);
  });
});

describe('formatMoment', () => {
  it('vaqt koʻrsatiladi', () => {
    expect(formatMoment('2026-09-10T08:30:00.000Z')).toMatch(/\d{2}\.\d{2}\.\d{4}/);
  });

  it('buzuq sana asl holida qoladi', () => {
    expect(formatMoment('nonsense')).toBe('nonsense');
  });
});

const LOG = {
  id: 'l-1',
  action: 'user.ban',
  entityType: 'USER',
  entityId: 'abcdef12-3456-7890-abcd-ef1234567890',
  before: { status: 'ACTIVE' },
  after: { status: 'BANNED', reason: 'Firibgarlik shubhasi' },
  ip: '10.0.0.5',
  createdAt: '2026-09-10T08:30:00.000Z',
  adminEmail: 'admin@karvon.uz',
  adminName: 'Bosh Admin',
};

function stubApi() {
  const calls: string[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: URL | string) => {
      const full = String(url);
      calls.push(full.replace('http://localhost:3000/v1', ''));

      const search = new URL(full).searchParams.get('action');
      const payload = search && search !== 'user.ban' ? [] : [LOG];
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

function renderAudit() {
  writeToken('admin-token');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuditPage />
    </QueryClientProvider>,
  );
}

describe('AuditPage', () => {
  it('★ KIM, NIMA, QACHON VA IP KOʻRSATILADI', async () => {
    stubApi();
    renderAudit();

    expect(await screen.findByText('user.ban')).toBeInTheDocument();
    expect(screen.getByText(/Bosh Admin/)).toBeInTheDocument();
    // IP — ichki xavf tekshiruvida asosiy dalil
    expect(screen.getByText(/10\.0\.0\.5/)).toBeInTheDocument();
  });

  it('★ OʻZGARISH "OLDIN → KEYIN" KOʻRINISHIDA', async () => {
    stubApi();
    renderAudit();

    await screen.findByText('user.ban');
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    expect(screen.getByText('BANNED')).toBeInTheDocument();
    expect(screen.getByText('Firibgarlik shubhasi')).toBeInTheDocument();
  });

  it('★ AMAL BOʻYICHA FILTR SOʻROVGA TUSHADI', async () => {
    const calls = stubApi();
    renderAudit();

    await screen.findByText('user.ban');
    await userEvent.type(screen.getByLabelText('Amal turi'), 'settings.update');

    // Backendda bu filtr avval umuman ishlamas edi: `ListQueryDto` da
    // `action` maydoni yoʻq edi va `forbidNonWhitelisted` soʻrovni
    // 400 bilan rad etardi
    await waitFor(() =>
      expect(calls.some((call) => call.includes('action=settings.update'))).toBe(true),
    );
  });

  it('★ EKRANDA OʻZGARTIRISH AMALI YOʻQ', async () => {
    stubApi();
    renderAudit();

    await screen.findByText('user.ban');

    // Audit jurnali append-only. Tahrirlash yoki oʻchirish tugmasi
    // uning butun maʼnosini yoʻq qiladi
    expect(screen.queryByRole('button')).toBeNull();
  });
});
