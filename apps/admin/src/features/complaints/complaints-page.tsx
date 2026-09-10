import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';

import { Alert, Button, Card, Input } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { api } from '@/lib/api';
import { ApiError } from '@/lib/api-error';

/**
 * Shikoyatlar.
 *
 * SLA TAYMER EMAS, KUTISH VAQTI: hujjatda kanban va SLA taymeri
 * ko'zda tutilgan, lekin backend shikoyatga muddat maydonini
 * bermaydi. Bo'lmagan narsani chizib qo'yish — yolg'on interfeys.
 * Shuning uchun bor narsa ko'rsatiladi: prioritet va qancha kutgani.
 */

export interface Complaint {
  id: string;
  category: string;
  subject: string | null;
  description: string | null;
  status: string;
  priority: number | null;
  orderId: string | null;
  createdAt: string;
  reporterFirstName: string | null;
  reporterLastName: string | null;
  reporterPhone: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Ochiq',
  IN_REVIEW: 'Koʻrib chiqilmoqda',
  RESOLVED: 'Hal qilindi',
  REJECTED: 'Rad etildi',
  ESCALATED: 'Yuqoriga uzatildi',
};

/** Qaysi holatlar operator tomonidan qoʻyilishi mumkin. */
const ACTIONS: { status: string; label: string; variant: 'primary' | 'secondary' | 'danger' }[] = [
  { status: 'IN_REVIEW', label: 'Koʻrib chiqishga olish', variant: 'secondary' },
  { status: 'RESOLVED', label: 'Hal qilindi', variant: 'primary' },
  { status: 'REJECTED', label: 'Rad etish', variant: 'danger' },
  { status: 'ESCALATED', label: 'Yuqoriga uzatish', variant: 'secondary' },
];

const FILTERS = [
  { value: 'OPEN', label: 'Ochiq' },
  { value: 'IN_REVIEW', label: 'Koʻrib chiqilmoqda' },
  { value: 'ESCALATED', label: 'Yuqoriga uzatilgan' },
  { value: '', label: 'Hammasi' },
];

/**
 * Qaror uchun izoh majburiymi.
 *
 * `IN_REVIEW` — bu shunchaki "men bu bilan shug'ullanyapman" degan
 * belgi va unga izoh shart emas. Qolgan uchtasi esa YAKUNIY qaror:
 * ariza yopiladi va odam natijani ko'radi. Izohsiz "rad etildi"
 * shikoyatning ikkinchi to'lqinini keltirib chiqaradi.
 */
export function resolutionRequired(status: string): boolean {
  return status !== 'IN_REVIEW';
}

/** Shikoyat qancha kutgan. */
export function waitedFor(createdAt: string, now: Date = new Date()): string {
  const hours = Math.floor((now.getTime() - new Date(createdAt).getTime()) / 3_600_000);
  if (Number.isNaN(hours) || hours < 1) return 'hozir';
  if (hours < 24) return `${hours} soat`;
  return `${Math.floor(hours / 24)} kun`;
}

export function ComplaintsPage() {
  const { can } = useSession();
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState('OPEN');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [resolution, setResolution] = useState('');
  const [error, setError] = useState<string | null>(null);

  const complaints = useQuery({
    queryKey: ['complaints', filter],
    queryFn: () => api.get<Complaint[]>('/admin/complaints', { status: filter }),
    placeholderData: (previous) => previous,
  });

  const resolve = useMutation({
    mutationFn: (input: { id: string; status: string; resolution?: string }) =>
      api.post(`/admin/complaints/${input.id}/resolve`, {
        status: input.status,
        ...(input.resolution ? { resolution: input.resolution } : {}),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['complaints'] });
      close();
    },
    onError: (cause: unknown) => {
      setError(cause instanceof ApiError ? cause.message : 'Amal bajarilmadi');
    },
  });

  function close() {
    setActiveId(null);
    setPendingStatus(null);
    setResolution('');
    setError(null);
  }

  function submit(complaint: Complaint) {
    if (!pendingStatus) return;
    const trimmed = resolution.trim();

    if (resolutionRequired(pendingStatus) && !trimmed) {
      setError('Qaror izohini yozing — u shikoyat qilgan odamga yetkaziladi.');
      return;
    }

    setError(null);
    resolve.mutate({
      id: complaint.id,
      status: pendingStatus,
      ...(trimmed ? { resolution: trimmed } : {}),
    });
  }

  const rows = complaints.data ?? [];

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-4 flex items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Shikoyatlar</h1>
        <span className="text-sm text-slate-500">{rows.length} ta</span>
        <div className="ml-auto flex gap-1">
          {FILTERS.map((option) => (
            <button
              key={option.value || 'all'}
              onClick={() => setFilter(option.value)}
              aria-pressed={filter === option.value}
              className={clsx(
                'rounded-lg px-3 py-1 text-sm transition',
                filter === option.value
                  ? 'bg-brand-600 text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-50',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      {complaints.isError ? (
        <Alert>
          {complaints.error instanceof ApiError
            ? complaints.error.message
            : 'Roʻyxatni yuklab boʻlmadi'}
        </Alert>
      ) : complaints.isPending ? (
        <p className="text-sm text-slate-500">Yuklanmoqda…</p>
      ) : rows.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600">Bu holatda shikoyat yoʻq.</p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {rows.map((complaint) => (
            <li key={complaint.id}>
              <Card>
                <div className="flex flex-wrap items-start gap-3">
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {complaint.category}
                  </span>
                  {/* Prioritet 1 — eng yuqori (server `priority ASC`
                      boʻyicha tartiblaydi) */}
                  {complaint.priority !== null && complaint.priority <= 1 ? (
                    <span className="rounded bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
                      Yuqori prioritet
                    </span>
                  ) : null}
                  <span className="rounded bg-brand-50 px-2 py-0.5 text-xs text-brand-700">
                    {STATUS_LABELS[complaint.status] ?? complaint.status}
                  </span>
                  <span className="ml-auto text-xs text-slate-400">
                    {waitedFor(complaint.createdAt)} kutmoqda
                  </span>
                </div>

                <h2 className="mt-2 text-sm font-medium text-slate-900">
                  {complaint.subject ?? 'Mavzusiz'}
                </h2>
                {complaint.description ? (
                  <p className="mt-1 whitespace-pre-line text-sm text-slate-600">
                    {complaint.description}
                  </p>
                ) : null}

                <p className="mt-2 text-xs text-slate-500">
                  {[complaint.reporterFirstName, complaint.reporterLastName]
                    .filter(Boolean)
                    .join(' ') || 'Ism koʻrsatilmagan'}
                  {complaint.reporterPhone ? ` · ${complaint.reporterPhone}` : ''}
                  {complaint.orderId ? ` · buyurtma ${complaint.orderId.slice(0, 8)}` : ''}
                </p>

                {can('complaints.resolve') ? (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    {activeId === complaint.id ? (
                      <div className="space-y-2">
                        {error ? <Alert>{error}</Alert> : null}
                        <p className="text-sm text-slate-700">
                          Qaror: <strong>{STATUS_LABELS[pendingStatus ?? ''] ?? ''}</strong>
                        </p>
                        {pendingStatus && resolutionRequired(pendingStatus) ? (
                          <Input
                            value={resolution}
                            onChange={(event) => setResolution(event.target.value)}
                            placeholder="Qaror izohi — shikoyat qilgan odam koʻradi"
                            aria-label="Qaror izohi"
                            autoFocus
                          />
                        ) : null}
                        <div className="flex gap-2">
                          <Button onClick={() => submit(complaint)} loading={resolve.isPending}>
                            Tasdiqlash
                          </Button>
                          <Button variant="ghost" onClick={close} disabled={resolve.isPending}>
                            Bekor
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {ACTIONS.filter((action) => action.status !== complaint.status).map(
                          (action) => (
                            <Button
                              key={action.status}
                              variant={action.variant}
                              onClick={() => {
                                setActiveId(complaint.id);
                                setPendingStatus(action.status);
                                setResolution('');
                                setError(null);
                              }}
                            >
                              {action.label}
                            </Button>
                          ),
                        )}
                      </div>
                    )}
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
