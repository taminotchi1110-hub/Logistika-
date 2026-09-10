import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { useEffect, useState } from 'react';

import { Alert, Input } from '@/components/ui';
import { api } from '@/lib/api';
import { ApiError } from '@/lib/api-error';
import { formatSoum } from '@/lib/money';

import { OrderDetailPanel } from './order-detail';
import {
  moment,
  ORDER_STATUS_LABELS,
  orderTone,
  personName,
  STATUS_FILTERS,
  type OrderRow,
} from './orders';

/**
 * Buyurtmalar — support ekrani.
 *
 * Operator odatda buyurtma raqami yoki telefon bilan keladi
 * ("№ 1042 bo'yicha shikoyat"), shuning uchun qidiruv birinchi va
 * fokusda. Nizoli buyurtmalar alohida tugma bilan ajratilgan: ular
 * darhol ish talab qiladi.
 */

const TONE_CLASSES = {
  ok: 'bg-ok/10 text-ok',
  warn: 'bg-warn/10 text-warn',
  danger: 'bg-danger/10 text-danger',
  muted: 'bg-slate-100 text-slate-500',
  active: 'bg-brand-50 text-brand-700',
};

function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function OrdersPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const debouncedSearch = useDebounced(search);

  const orders = useQuery({
    queryKey: ['orders', debouncedSearch, status],
    queryFn: () =>
      api.get<OrderRow[]>('/admin/orders', { search: debouncedSearch, status, limit: 100 }),
    placeholderData: (previous) => previous,
  });

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      <header className="mb-4 flex items-baseline gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Buyurtmalar</h1>
        {orders.data ? (
          <span className="text-sm text-slate-500">{orders.data.length} ta</span>
        ) : null}
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="min-w-64 flex-1">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buyurtma raqami yoki telefon"
            aria-label="Qidirish"
            autoFocus
          />
        </div>
        <div className="flex gap-1">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value || 'all'}
              onClick={() => setStatus(filter.value)}
              aria-pressed={status === filter.value}
              className={clsx(
                'rounded-lg px-3 py-1.5 text-sm transition',
                status === filter.value
                  ? 'bg-brand-600 text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-50',
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {orders.isError ? (
        <Alert>
          {orders.error instanceof ApiError ? orders.error.message : 'Roʻyxatni yuklab boʻlmadi'}
        </Alert>
      ) : (
        <div className="flex min-h-0 flex-1 gap-4">
          <div className="min-w-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white">
            {orders.isPending ? (
              <p className="p-4 text-sm text-slate-500">Yuklanmoqda…</p>
            ) : orders.data.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">Buyurtma topilmadi.</p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">№</th>
                    <th className="px-4 py-2 font-medium">Holat</th>
                    <th className="px-4 py-2 font-medium">Yoʻnalish</th>
                    <th className="px-4 py-2 font-medium">Yuk beruvchi</th>
                    <th className="px-4 py-2 font-medium">Haydovchi</th>
                    <th className="px-4 py-2 font-medium">Narx</th>
                    <th className="px-4 py-2 font-medium">Yaratilgan</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.data.map((order) => (
                    <tr
                      key={order.id}
                      onClick={() => setSelectedId(order.id)}
                      aria-selected={order.id === selectedId}
                      className={clsx(
                        'cursor-pointer border-t border-slate-100',
                        order.id === selectedId ? 'bg-brand-50' : 'hover:bg-slate-50',
                      )}
                    >
                      <td className="tabular px-4 py-2 font-medium text-slate-900">
                        {order.publicNo}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={clsx(
                            'rounded px-2 py-0.5 text-xs font-medium',
                            TONE_CLASSES[orderTone(order.status)],
                          )}
                        >
                          {ORDER_STATUS_LABELS[order.status] ?? order.status}
                        </span>
                      </td>
                      <td className="max-w-48 truncate px-4 py-2 text-slate-600">
                        {order.pickupAddress} → {order.deliveryAddress}
                      </td>
                      <td className="px-4 py-2 text-slate-700">
                        {personName({
                          firstName: order.shipperFirstName,
                          lastName: order.shipperLastName,
                        })}
                      </td>
                      <td className="px-4 py-2 text-slate-700">
                        {personName({
                          firstName: order.driverFirstName,
                          lastName: order.driverLastName,
                        })}
                      </td>
                      <td className="tabular px-4 py-2 text-slate-700">
                        {formatSoum(order.priceTiyin)}
                      </td>
                      <td className="tabular px-4 py-2 text-slate-500">
                        {moment(order.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {selectedId ? (
            <aside className="w-96 shrink-0 overflow-y-auto">
              <OrderDetailPanel orderId={selectedId} onClose={() => setSelectedId(null)} />
            </aside>
          ) : null}
        </div>
      )}
    </div>
  );
}
