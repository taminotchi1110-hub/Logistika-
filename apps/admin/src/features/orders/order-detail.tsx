import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Alert, Button, Card } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { api } from '@/lib/api';
import { ApiError } from '@/lib/api-error';

import {
  gapLabel,
  gapMinutes,
  moment,
  ORDER_STATUS_LABELS,
  personName,
  type ChatMessage,
  type OrderDetail,
} from './orders';

/**
 * Buyurtma tafsiloti.
 *
 * Support operatorining "nima bo'lgan?" degan savoliga javob: status
 * chizig'i, moliya, ishtirokchilar va — talab bo'yicha — haqiqiy
 * raqamlar hamda yozishma.
 */
export function OrderDetailPanel({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const { can } = useSession();

  const detail = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => api.get<OrderDetail>(`/admin/orders/${orderId}`),
  });

  /**
   * Raqamlar TALAB BO'YICHA yuklanadi.
   *
   * `enabled: false` — so'rov faqat tugma bosilganda ketadi. Har bir
   * chaqiruv auditga yoziladi: buyurtmani ochish bilan raqamlarni
   * ko'rish bir xil narsa emas va jurnal buni ajratishi kerak.
   */
  const [contactsRequested, setContactsRequested] = useState(false);
  const contacts = useQuery({
    queryKey: ['order-contacts', orderId],
    queryFn: () =>
      api.get<{ shipperPhone: string; driverPhone: string }>(
        `/admin/orders/${orderId}/contacts`,
      ),
    enabled: contactsRequested,
    staleTime: 5 * 60 * 1000,
  });

  const [chatRequested, setChatRequested] = useState(false);
  const chat = useQuery({
    queryKey: ['order-chat', orderId],
    queryFn: () => api.get<{ messages: ChatMessage[] }>(`/admin/orders/${orderId}/chat`),
    enabled: chatRequested,
    staleTime: 60 * 1000,
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
            : 'Buyurtmani yuklab boʻlmadi'}
        </Alert>
      </Card>
    );
  }

  const { order, history, finance } = detail.data;

  return (
    <Card>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-slate-900">№ {order.publicNo}</h2>
          <p className="text-sm text-slate-600">
            {ORDER_STATUS_LABELS[order.status] ?? order.status}
          </p>
        </div>
        <Button variant="ghost" onClick={onClose} aria-label="Yopish">
          ✕
        </Button>
      </div>

      <section className="mt-4">
        <h3 className="mb-1 text-sm font-medium text-slate-700">Yoʻnalish</h3>
        <p className="text-sm text-slate-700">{order.pickupAddress ?? '—'}</p>
        <p className="text-sm text-slate-500">↓ {order.distanceKm ?? '—'} km</p>
        <p className="text-sm text-slate-700">{order.deliveryAddress ?? '—'}</p>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <Fact label="Narx" value={finance.priceFormatted} />
        <Fact label="Komissiya" value={finance.commissionFormatted} />
        <Fact label="Haydovchiga" value={finance.driverPayoutFormatted} />
        <Fact label="Jarima" value={finance.penaltyFormatted} />
        <Fact label="Toʻlov usuli" value={order.paymentMethod} />
        <Fact label="Toʻlov holati" value={order.paymentStatus} />
      </section>

      <section className="mt-4">
        <h3 className="mb-2 text-sm font-medium text-slate-700">Ishtirokchilar</h3>
        <Party
          role="Yuk beruvchi"
          name={personName({ firstName: order.shipperFirstName, lastName: order.shipperLastName })}
          maskedPhone={order.shipperPhone}
          realPhone={contacts.data?.shipperPhone}
        />
        <Party
          role="Haydovchi"
          name={personName({ firstName: order.driverFirstName, lastName: order.driverLastName })}
          maskedPhone={order.driverPhone}
          realPhone={contacts.data?.driverPhone}
          extra={
            order.vehiclePlate
              ? `${[order.vehicleBrand, order.vehicleModel].filter(Boolean).join(' ')} · ${order.vehiclePlate}`
              : null
          }
        />

        {!contactsRequested ? (
          <div className="mt-2">
            <Button variant="secondary" onClick={() => setContactsRequested(true)}>
              Raqamlarni koʻrsatish
            </Button>
            {/* Oqibat OLDINDAN aytiladi: operator bu amal kuzatilishini
                bilishi kerak, keyin bilib qolishi emas */}
            <p className="mt-1 text-xs text-slate-500">
              Ochilish audit jurnaliga yoziladi.
            </p>
          </div>
        ) : contacts.isError ? (
          <div className="mt-2">
            <Alert>
              {contacts.error instanceof ApiError
                ? contacts.error.message
                : 'Raqamlarni olib boʻlmadi'}
            </Alert>
          </div>
        ) : null}
      </section>

      <section className="mt-5">
        <h3 className="mb-2 text-sm font-medium text-slate-700">Status tarixi</h3>
        <ol className="space-y-1">
          {history.map((entry, index) => {
            const previous = history[index - 1];
            const gap = previous ? gapMinutes(previous.createdAt, entry.createdAt) : null;
            return (
              <li key={entry.id} className="flex items-baseline gap-2 text-sm">
                <span className="tabular text-xs text-slate-400">{moment(entry.createdAt)}</span>
                <span className="text-slate-800">
                  {ORDER_STATUS_LABELS[entry.toStatus] ?? entry.toStatus}
                </span>
                {/* Ikki bosqich orasidagi vaqt — tarixdagi eng foydali
                    raqam: kechikish qayerda boʻlganini koʻrsatadi */}
                {gap !== null && gap > 0 ? (
                  <span className="text-xs text-slate-400">{gapLabel(gap)}</span>
                ) : null}
                {entry.actorRole ? (
                  <span className="text-xs text-slate-400">· {entry.actorRole}</span>
                ) : null}
              </li>
            );
          })}
        </ol>
        {order.cancelReason ? (
          <p className="mt-2 text-sm text-danger">Bekor sababi: {order.cancelReason}</p>
        ) : null}
      </section>

      {/* `chat.view` — alohida huquq. Moliyachiga begonalarning
          yozishmasini oʻqish kerak emas */}
      {can('chat.view') ? (
        <section className="mt-5 border-t border-slate-100 pt-4">
          <h3 className="mb-2 text-sm font-medium text-slate-700">Yozishma</h3>
          {!chatRequested ? (
            <>
              <Button variant="secondary" onClick={() => setChatRequested(true)}>
                Yozishmani koʻrsatish
              </Button>
              <p className="mt-1 text-xs text-slate-500">Oʻqish audit jurnaliga yoziladi.</p>
            </>
          ) : chat.isPending ? (
            <p className="text-sm text-slate-500">Yuklanmoqda…</p>
          ) : chat.isError ? (
            <Alert>
              {chat.error instanceof ApiError ? chat.error.message : 'Yozishmani olib boʻlmadi'}
            </Alert>
          ) : chat.data.messages.length === 0 ? (
            <p className="text-sm text-slate-500">Yozishma boʻsh.</p>
          ) : (
            <ul className="max-h-64 space-y-2 overflow-y-auto">
              {chat.data.messages.map((message) => (
                <li key={message.id} className="text-sm">
                  <span className="text-xs text-slate-400">{moment(message.createdAt)}</span>{' '}
                  <span className="font-medium text-slate-700">
                    {personName({
                      firstName: message.senderFirstName,
                      lastName: message.senderLastName,
                    })}
                    :
                  </span>{' '}
                  {/* Matnsiz xabar (rasm, joylashuv) — turi koʻrsatiladi,
                      aks holda qator boʻsh koʻrinardi */}
                  <span className="text-slate-800">
                    {message.body ?? `[${message.type}]`}
                  </span>
                </li>
              ))}
            </ul>
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

function Party({
  role,
  name,
  maskedPhone,
  realPhone,
  extra,
}: {
  role: string;
  name: string;
  maskedPhone: string | null;
  // `| undefined` ANIQ yoziladi: `exactOptionalPropertyTypes` bilan
  // "maydon yoʻq" va "maydon undefined" — ikki xil narsa, va bu yerda
  // qiymat soʻrov tugamaguncha aynan `undefined` boʻladi
  realPhone?: string | undefined;
  extra?: string | null | undefined;
}) {
  return (
    <div className="mt-1">
      <p className="text-sm text-slate-800">
        <span className="text-xs uppercase tracking-wide text-slate-500">{role}:</span> {name}
      </p>
      <p className="tabular text-sm text-slate-600">
        {realPhone ?? maskedPhone ?? '—'}
        {extra ? <span className="text-slate-500"> · {extra}</span> : null}
      </p>
    </div>
  );
}
