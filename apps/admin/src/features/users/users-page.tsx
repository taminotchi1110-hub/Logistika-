import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { useEffect, useState } from 'react';

import { Alert, Input } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { api } from '@/lib/api';
import { ApiError } from '@/lib/api-error';

import { UserDetailPanel } from './user-detail';
import {
  cancelRate,
  formatRating,
  fullName,
  ROLE_LABELS,
  shortDateTime,
  STATUS_LABELS,
  statusTone,
  type UserRow,
} from './users';

/**
 * Foydalanuvchilar ro'yxati.
 *
 * Chapda jadval, o'ngda tanlangan foydalanuvchi tafsiloti. Support
 * operatori odatda telefon raqami bilan keladi ("shu odam qo'ng'iroq
 * qildi"), shuning uchun qidiruv birinchi va u fokusda.
 */

const TONE_CLASSES = {
  ok: 'bg-ok/10 text-ok',
  warn: 'bg-warn/10 text-warn',
  danger: 'bg-danger/10 text-danger',
  muted: 'bg-slate-100 text-slate-600',
};

/**
 * Qidiruvni kechiktirish.
 *
 * Har bosilgan harfda so'rov yuborish — "+998" yozganda uchta so'rov,
 * to'liq raqamda o'n uchta. Ular serverga behuda yuklama va javoblar
 * tartibsiz kelib, oxirgisi eng eski natijani ko'rsatishi mumkin.
 */
function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

export function UsersPage() {
  const { can } = useSession();

  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const debouncedSearch = useDebounced(search);

  const users = useQuery({
    queryKey: ['users', debouncedSearch, role, status],
    queryFn: () =>
      api.get<UserRow[]>('/admin/users', {
        search: debouncedSearch,
        role,
        status,
        limit: 100,
      }),
    // Filtr o'zgarganda eski ro'yxat ekranda qoladi: jadval "sakramaydi"
    placeholderData: (previous) => previous,
  });

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      <header className="mb-4 flex items-baseline gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Foydalanuvchilar</h1>
        {users.data ? (
          <span className="text-sm text-slate-500">{users.data.length} ta koʻrsatilmoqda</span>
        ) : null}
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="min-w-64 flex-1">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Telefon yoki ism boʻyicha qidirish"
            aria-label="Qidirish"
            autoFocus
          />
        </div>

        <Select
          label="Rol"
          value={role}
          onChange={setRole}
          options={[
            { value: '', label: 'Barcha rollar' },
            { value: 'SHIPPER', label: ROLE_LABELS.SHIPPER },
            { value: 'DRIVER', label: ROLE_LABELS.DRIVER },
            { value: 'BOTH', label: ROLE_LABELS.BOTH },
          ]}
        />

        <Select
          label="Holat"
          value={status}
          onChange={setStatus}
          options={[
            { value: '', label: 'Barcha holatlar' },
            { value: 'ACTIVE', label: STATUS_LABELS.ACTIVE },
            { value: 'SUSPENDED', label: STATUS_LABELS.SUSPENDED },
            { value: 'BANNED', label: STATUS_LABELS.BANNED },
            { value: 'PENDING_PROFILE', label: STATUS_LABELS.PENDING_PROFILE },
          ]}
        />
      </div>

      {users.isError ? (
        <Alert>
          {users.error instanceof ApiError ? users.error.message : 'Roʻyxatni yuklab boʻlmadi'}
        </Alert>
      ) : (
        <div className="flex min-h-0 flex-1 gap-4">
          <div className="min-w-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white">
            {users.isPending ? (
              <p className="p-4 text-sm text-slate-500">Yuklanmoqda…</p>
            ) : users.data.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">
                Hech kim topilmadi. Qidiruv shartini oʻzgartirib koʻring.
              </p>
            ) : (
              <UsersTable
                users={users.data}
                selectedId={selectedId}
                onSelect={(user) => setSelectedId(user.id)}
              />
            )}
          </div>

          {selectedId ? (
            <aside className="w-96 shrink-0 overflow-y-auto">
              <UserDetailPanel
                userId={selectedId}
                canBan={can('users.ban')}
                onClose={() => setSelectedId(null)}
              />
            </aside>
          ) : null}
        </div>
      )}
    </div>
  );
}

function UsersTable({
  users,
  selectedId,
  onSelect,
}: {
  users: UserRow[];
  selectedId: string | null;
  onSelect: (user: UserRow) => void;
}) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
        <tr>
          <th className="px-4 py-2 font-medium">Ism</th>
          <th className="px-4 py-2 font-medium">Telefon</th>
          <th className="px-4 py-2 font-medium">Rol</th>
          <th className="px-4 py-2 font-medium">Holat</th>
          <th className="px-4 py-2 font-medium">Reyting</th>
          <th className="px-4 py-2 font-medium">Buyurtmalar</th>
          <th className="px-4 py-2 font-medium">Roʻyxatdan</th>
        </tr>
      </thead>
      <tbody>
        {users.map((user) => {
          const rate = cancelRate(user);
          return (
            <tr
              key={user.id}
              onClick={() => onSelect(user)}
              aria-selected={user.id === selectedId}
              className={clsx(
                'cursor-pointer border-t border-slate-100',
                user.id === selectedId ? 'bg-brand-50' : 'hover:bg-slate-50',
              )}
            >
              <td className="px-4 py-2 font-medium text-slate-900">{fullName(user)}</td>
              {/* `tabular` — raqamlar bir xil kenglikda va ustun boʻyicha
                  solishtirsa boʻladi */}
              <td className="tabular px-4 py-2 text-slate-700">{user.phone}</td>
              <td className="px-4 py-2 text-slate-600">{ROLE_LABELS[user.role]}</td>
              <td className="px-4 py-2">
                <span
                  className={clsx(
                    'rounded px-2 py-0.5 text-xs font-medium',
                    TONE_CLASSES[statusTone(user.status)],
                  )}
                >
                  {STATUS_LABELS[user.status]}
                </span>
              </td>
              <td className="tabular px-4 py-2 text-slate-700">
                {formatRating(user.ratingAvg, user.ratingCount)}
              </td>
              <td className="tabular px-4 py-2 text-slate-700">
                {user.completedOrders}
                {/* Bekor qilish ulushi faqat maʼnoli boʻlganda: 1 tadan
                    1 tasi bekor qilingan "100%" hech narsani anglatmaydi */}
                {rate !== null ? (
                  <span className={clsx('ml-2 text-xs', rate >= 30 ? 'text-danger' : 'text-slate-400')}>
                    {rate}% bekor
                  </span>
                ) : null}
              </td>
              <td className="tabular px-4 py-2 text-slate-500">{shortDateTime(user.createdAt)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
