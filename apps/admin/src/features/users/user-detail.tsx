import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Alert, Button, Card, Input } from '@/components/ui';
import { api } from '@/lib/api';
import { ApiError } from '@/lib/api-error';

import {
  cancelRate,
  formatRating,
  fullName,
  reasonRequired,
  ROLE_LABELS,
  shortDateTime,
  STATUS_LABELS,
  type UserDetail,
  type UserStatus,
} from './users';

/**
 * Foydalanuvchi tafsiloti va bloklash.
 *
 * BLOKLASH ORQAGA QAYTARILADI, LEKIN OQIBATI DARHOL: `token_version`
 * oshadi va odam ilovadan uchib tushadi — reys o'rtasida ham. Shuning
 * uchun interfeys uni "bir bosishlik" qilmaydi: sabab yozilishi shart
 * va tugmada kimni bloklayotgani yozilgan.
 */
export function UserDetailPanel({
  userId,
  canBan,
  onClose,
}: {
  userId: string;
  canBan: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const detail = useQuery({
    queryKey: ['user', userId],
    queryFn: () => api.get<UserDetail>(`/admin/users/${userId}`),
  });

  const [pendingStatus, setPendingStatus] = useState<UserStatus | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const changeStatus = useMutation({
    mutationFn: (input: { status: UserStatus; reason?: string }) =>
      api.post(`/admin/users/${userId}/status`, {
        status: input.status,
        ...(input.reason ? { reason: input.reason } : {}),
      }),
    onSuccess: () => {
      // Ikkalasi ham eskirdi: tafsilotdagi holat va roʻyxatdagi belgi
      void queryClient.invalidateQueries({ queryKey: ['user', userId] });
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      setPendingStatus(null);
      setReason('');
      setError(null);
    },
    onError: (cause: unknown) => {
      setError(cause instanceof ApiError ? cause.message : 'Amal bajarilmadi');
    },
  });

  if (detail.isPending) {
    return (
      <Card>
        <p className="text-sm text-slate-500">Yuklanmoqda…</p>
      </Card>
    );
  }

  if (detail.isError) {
    return (
      <Card>
        <Alert>
          {detail.error instanceof ApiError
            ? detail.error.message
            : 'Foydalanuvchini yuklab boʻlmadi'}
        </Alert>
      </Card>
    );
  }

  const { user, wallet, ordersCount, documents } = detail.data;
  const rate = cancelRate(user);

  function submit() {
    if (!pendingStatus) return;
    const trimmed = reason.trim();

    if (reasonRequired(pendingStatus) && !trimmed) {
      // Sababsiz bloklash: odam ilovadan uchib tushadi, qoʻllab-
      // quvvatlashga qoʻngʻiroq qiladi va operator nima uchun
      // bloklanganini auditdan topa olmaydi
      setError('Sabab majburiy — u audit jurnaliga yoziladi');
      return;
    }

    setError(null);
    changeStatus.mutate({ status: pendingStatus, ...(trimmed ? { reason: trimmed } : {}) });
  }

  return (
    <Card>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold text-slate-900">{fullName(user)}</h2>
          <p className="tabular text-sm text-slate-600">{user.phone}</p>
        </div>
        <Button variant="ghost" onClick={onClose} aria-label="Yopish">
          ✕
        </Button>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <Fact label="Rol" value={ROLE_LABELS[user.role]} />
        <Fact label="Holat" value={STATUS_LABELS[user.status]} />
        <Fact label="Reyting" value={formatRating(user.ratingAvg, user.ratingCount)} />
        <Fact label="Hamyon" value={wallet.formatted} />
        <Fact label="Buyurtmalar" value={String(ordersCount)} />
        <Fact
          label="Yakunlangan / bekor"
          value={`${user.completedOrders} / ${user.cancelledOrders}${
            rate !== null ? ` (${rate}%)` : ''
          }`}
        />
        <Fact label="Roʻyxatdan oʻtgan" value={shortDateTime(user.createdAt)} />
      </dl>

      <section className="mt-5">
        <h3 className="mb-2 text-sm font-medium text-slate-700">Hujjatlar</h3>
        {documents.length === 0 ? (
          <p className="text-sm text-slate-500">Hujjat yuklanmagan.</p>
        ) : (
          <ul className="space-y-1">
            {documents.map((document) => (
              <li key={document.id} className="flex items-center gap-2 text-sm">
                <span className="text-slate-700">{document.type}</span>
                <span className="text-xs text-slate-500">{document.verificationStatus}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Huquq boʻlmasa amal UMUMAN koʻrinmaydi */}
      {canBan ? (
        <section className="mt-5 border-t border-slate-100 pt-4">
          {error ? (
            <div className="mb-3">
              <Alert>{error}</Alert>
            </div>
          ) : null}

          {pendingStatus ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-700">
                {fullName(user)} — <strong>{STATUS_LABELS[pendingStatus]}</strong>
              </p>
              {reasonRequired(pendingStatus) ? (
                <>
                  <Input
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Sabab (audit jurnaliga yoziladi)"
                    aria-label="Sabab"
                    autoFocus
                  />
                  <p className="text-xs text-warn">
                    Bloklash barcha sessiyalarni darhol bekor qiladi — odam ilovadan chiqib
                    ketadi, reys o‘rtasida ham.
                  </p>
                </>
              ) : null}
              <div className="flex gap-2">
                <Button
                  variant={reasonRequired(pendingStatus) ? 'danger' : 'primary'}
                  onClick={submit}
                  loading={changeStatus.isPending}
                >
                  Tasdiqlash
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setPendingStatus(null);
                    setReason('');
                    setError(null);
                  }}
                  disabled={changeStatus.isPending}
                >
                  Bekor
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {user.status === 'ACTIVE' ? (
                <>
                  <Button variant="secondary" onClick={() => setPendingStatus('SUSPENDED')}>
                    Vaqtincha toʻxtatish
                  </Button>
                  <Button variant="danger" onClick={() => setPendingStatus('BANNED')}>
                    Bloklash
                  </Button>
                </>
              ) : (
                <Button onClick={() => setPendingStatus('ACTIVE')}>Blokni ochish</Button>
              )}
            </div>
          )}
        </section>
      ) : null}
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="tabular mt-0.5 text-slate-900">{value}</dd>
    </div>
  );
}
