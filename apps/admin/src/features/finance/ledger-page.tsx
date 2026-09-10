import { useQuery } from '@tanstack/react-query';

import { Alert, Button, Card } from '@/components/ui';
import { api } from '@/lib/api';
import { ApiError } from '@/lib/api-error';
import { formatSoum } from '@/lib/money';

import { mismatchDelta, type LedgerIntegrity } from './payouts';

/**
 * Ledger butunligi.
 *
 * NIMA TEKSHIRILADI: har bir hisobda saqlangan balans o'sha hisobdagi
 * barcha yozuvlar yig'indisiga teng bo'lishi shart. Ikki yozuvli
 * ledgerda bu asosiy kafolat — u buzilsa, hamyondagi raqam yolg'on
 * bo'ladi va platforma mavjud bo'lmagan pulni chiqarib yuborishi
 * mumkin.
 *
 * EKRAN ATAYLAB QUYUQ: "hammasi joyida" holati bir qarashda ko'rinishi
 * kerak, chunki uni odam har kuni ochib qaraydi va uzoq o'qishga
 * vaqti yo'q.
 */
export function LedgerPage() {
  const integrity = useQuery({
    queryKey: ['ledger-integrity'],
    queryFn: () => api.get<LedgerIntegrity>('/admin/ledger/integrity'),
    // Bu tekshiruv har bir hisobni skanerlaydi — avtomatik yangilash
    // shart emas, operator o'zi bosadi
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-4 flex items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Ledger butunligi</h1>
        <Button
          variant="secondary"
          className="ml-auto"
          onClick={() => void integrity.refetch()}
          loading={integrity.isFetching}
        >
          Qayta tekshirish
        </Button>
      </header>

      {integrity.isError ? (
        <Alert>
          {integrity.error instanceof ApiError
            ? integrity.error.message
            : 'Tekshiruvni bajarib boʻlmadi'}
        </Alert>
      ) : integrity.isPending ? (
        <p className="text-sm text-slate-500">Tekshirilmoqda…</p>
      ) : integrity.data.ok ? (
        <Card>
          <p className="text-base font-medium text-ok">Ledger butun</p>
          <p className="mt-1 text-sm text-slate-600">
            Har bir hisobning balansi o‘sha hisobdagi yozuvlar yig‘indisiga teng.
          </p>
        </Card>
      ) : (
        <>
          <div className="mb-4">
            <Alert>
              <strong>{integrity.data.mismatches.length} ta hisobda nomuvofiqlik.</strong> Bu
              jiddiy: hamyondagi raqam yolg‘on bo‘lishi mumkin. Pul chiqarishni to‘xtating va
              yozuvlarni tekshiring.
            </Alert>
          </div>

          <Card>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-2 font-medium">Hisob</th>
                  <th className="pb-2 font-medium">Saqlangan</th>
                  <th className="pb-2 font-medium">Hisoblangan</th>
                  <th className="pb-2 font-medium">Farq</th>
                </tr>
              </thead>
              <tbody>
                {integrity.data.mismatches.map((mismatch) => (
                  <tr key={mismatch.accountId} className="border-t border-slate-100">
                    <td className="tabular py-2 font-mono text-xs text-slate-700">
                      {mismatch.accountId}
                    </td>
                    <td className="tabular py-2 text-slate-700">{formatSoum(mismatch.stored)}</td>
                    <td className="tabular py-2 text-slate-700">{formatSoum(mismatch.computed)}</td>
                    {/* Farq — eng muhim ustun: qancha pul "yoʻqolgan" yoki
                        "paydo boʻlgan" */}
                    <td className="tabular py-2 font-medium text-danger">
                      {formatSoum(mismatchDelta(mismatch))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
