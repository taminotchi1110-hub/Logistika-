import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';

import { Alert, Button, Card, Input } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { api } from '@/lib/api';
import { ApiError } from '@/lib/api-error';
import { formatSoum } from '@/lib/money';

import {
  isOverdue,
  isValidTxnId,
  payoutTotal,
  waitingLabel,
  type LedgerIntegrity,
  type Payout,
} from './payouts';

/**
 * Pul yechish navbati.
 *
 * BU YERDA HAQIQIY PUL HARAKAT QILADI. "Bajarildi" bosilgandan keyin
 * pul haydovchining hamyonidan chiqib ketgan hisoblanadi; uni
 * qaytarish qo'lda tuzatishni talab qiladi. Shuning uchun:
 *
 *   - amal bir bosishda bajarilmaydi, forma ochiladi
 *   - bank tranzaksiya raqami MAJBURIY (server uni ixtiyoriy qilsa ham)
 *   - ledger buzilgan bo'lsa ekran tepasida ogohlantirish turadi
 */
export function PayoutsPage() {
  const { can } = useSession();
  const queryClient = useQueryClient();

  const payouts = useQuery({
    queryKey: ['payouts'],
    queryFn: () => api.get<Payout[]>('/admin/payouts'),
  });

  /**
   * Ledger butunligi — SHU EKRANDA TEKSHIRILADI.
   *
   * Balans yozuvlar yig'indisiga mos kelmasa, hamyondagi raqam
   * yolg'on bo'lishi mumkin. Bunday holatda pul chiqarish — mavjud
   * bo'lmagan pulni yuborish xavfi. Operator buni PUL YUBORISHDAN
   * OLDIN bilishi kerak, keyin emas.
   */
  const integrity = useQuery({
    queryKey: ['ledger-integrity'],
    queryFn: () => api.get<LedgerIntegrity>('/admin/ledger/integrity'),
  });

  const [activeId, setActiveId] = useState<string | null>(null);
  const [mode, setMode] = useState<'complete' | 'reject'>('complete');
  const [txnId, setTxnId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const act = useMutation({
    mutationFn: (input: { id: string; mode: 'complete' | 'reject'; body: unknown }) =>
      api.post(`/admin/payouts/${input.id}/${input.mode}`, input.body),
    onSuccess: () => {
      // Navbat ham, ledger holati ham eskirdi
      void queryClient.invalidateQueries({ queryKey: ['payouts'] });
      void queryClient.invalidateQueries({ queryKey: ['ledger-integrity'] });
      close();
    },
    onError: (cause: unknown) => {
      setError(cause instanceof ApiError ? cause.message : 'Amal bajarilmadi');
    },
  });

  function close() {
    setActiveId(null);
    setTxnId('');
    setReason('');
    setError(null);
  }

  function open(id: string, next: 'complete' | 'reject') {
    setActiveId(id);
    setMode(next);
    setTxnId('');
    setReason('');
    setError(null);
  }

  function submit(payout: Payout) {
    if (mode === 'complete') {
      if (!isValidTxnId(txnId)) {
        // Bu raqam ledger bilan bank koʻchirmasi orasidagi yagona
        // bogʻlanish. Usiz oy oxirida "bu pul qayerga ketdi?" degan
        // savolga javob topib boʻlmaydi
        setError('Bank tranzaksiya raqamini kiriting. Raqam boʻlmasa “MANUAL” deb yozing.');
        return;
      }
      act.mutate({ id: payout.id, mode: 'complete', body: { providerTxnId: txnId.trim() } });
      return;
    }

    if (!reason.trim()) {
      // Pul hamyonga qaytadi va haydovchi nega rad etilganini bilishi
      // kerak — aks holda u qayta soʻrov yuboradi va navbat aylanadi
      setError('Rad etish sababini koʻrsating — u haydovchiga yetkaziladi.');
      return;
    }
    act.mutate({ id: payout.id, mode: 'reject', body: { reason: reason.trim() } });
  }

  if (payouts.isError) {
    return (
      <Alert>
        {payouts.error instanceof ApiError ? payouts.error.message : 'Navbatni yuklab boʻlmadi'}
      </Alert>
    );
  }

  const rows = payouts.data ?? [];

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-4 flex items-baseline gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Pul yechish navbati</h1>
        {rows.length > 0 ? (
          <span className="text-sm text-slate-500">
            {rows.length} ta soʻrov · jami {formatSoum(payoutTotal(rows))}
          </span>
        ) : null}
      </header>

      {integrity.data && !integrity.data.ok ? (
        <div className="mb-4">
          <Alert>
            <strong>Ledger buzilgan:</strong> {integrity.data.mismatches.length} ta hisobda balans
            yozuvlar yigʻindisiga mos kelmaydi. Pul chiqarishdan oldin buni tekshiring — hamyondagi
            raqam yolgʻon boʻlishi mumkin.
          </Alert>
        </div>
      ) : null}

      {payouts.isPending ? (
        <p className="text-sm text-slate-500">Yuklanmoqda…</p>
      ) : rows.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600">Kutilayotgan soʻrov yoʻq.</p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {rows.map((payout) => (
            <li key={payout.id}>
              <Card>
                <div className="flex flex-wrap items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900">
                      {[payout.firstName, payout.lastName].filter(Boolean).join(' ') ||
                        'Ism koʻrsatilmagan'}
                    </p>
                    <p className="tabular text-sm text-slate-600">{payout.phone}</p>
                    <p
                      className={clsx(
                        'mt-1 text-xs',
                        // 24 soatdan oshgan soʻrov — haydovchi uchun
                        // "pulim yoʻqoldi" degani
                        isOverdue(payout.requestedAt) ? 'font-medium text-danger' : 'text-slate-400',
                      )}
                    >
                      {waitingLabel(payout.requestedAt)}
                    </p>
                  </div>

                  <div className="text-right">
                    {/* Summa KATTA va aniq: operator uni bankka koʻchiradi */}
                    <p className="tabular text-lg font-semibold text-slate-900">
                      {formatSoum(payout.amountTiyin)}
                    </p>
                    <p className="tabular text-sm text-slate-600">{payout.cardMask ?? '—'}</p>
                  </div>

                  {can('payouts.process') && activeId !== payout.id ? (
                    <div className="flex gap-2">
                      <Button onClick={() => open(payout.id, 'complete')}>Bajarildi</Button>
                      <Button variant="secondary" onClick={() => open(payout.id, 'reject')}>
                        Rad etish
                      </Button>
                    </div>
                  ) : null}
                </div>

                {activeId === payout.id ? (
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    {error ? (
                      <div className="mb-3">
                        <Alert>{error}</Alert>
                      </div>
                    ) : null}

                    {mode === 'complete' ? (
                      <div className="space-y-2">
                        <p className="text-sm text-slate-700">
                          {formatSoum(payout.amountTiyin)} — {payout.cardMask ?? 'karta koʻrsatilmagan'}
                        </p>
                        <Input
                          value={txnId}
                          onChange={(event) => setTxnId(event.target.value)}
                          placeholder="Bank tranzaksiya raqami"
                          aria-label="Bank tranzaksiya raqami"
                          autoFocus
                        />
                        <p className="text-xs text-slate-500">
                          Bu raqam ledger bilan bank ko‘chirmasini bog‘laydi. Raqam bo‘lmasa
                          “MANUAL” deb yozing — u auditda shundayligicha ko‘rinadi.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-sm text-slate-700">
                          Pul haydovchi hamyoniga qaytariladi.
                        </p>
                        <Input
                          value={reason}
                          onChange={(event) => setReason(event.target.value)}
                          placeholder="Rad etish sababi"
                          aria-label="Rad etish sababi"
                          autoFocus
                        />
                      </div>
                    )}

                    <div className="mt-3 flex gap-2">
                      <Button
                        variant={mode === 'reject' ? 'danger' : 'primary'}
                        onClick={() => submit(payout)}
                        loading={act.isPending}
                      >
                        Tasdiqlash
                      </Button>
                      <Button variant="ghost" onClick={close} disabled={act.isPending}>
                        Bekor
                      </Button>
                    </div>
                  </div>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
