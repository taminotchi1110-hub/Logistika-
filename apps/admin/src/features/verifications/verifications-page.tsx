import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';

import { Alert, Button, Card, Input } from '@/components/ui';
import { api } from '@/lib/api';
import { ApiError } from '@/lib/api-error';

import { DocumentViewer, type DocumentView } from './document-viewer';
import {
  KIND_LABELS,
  nextAfterRemoval,
  reviewPath,
  toQueue,
  type QueueItem,
  type QueueResponse,
} from './queue';

/**
 * Verifikatsiya navbati.
 *
 * ENG KO'P ISHLATILADIGAN EKRAN va u TEZLIKKA optimallashtirilgan:
 * maqsad — bitta element ≤ 20 soniya (`docs/08-admin.md`).
 *
 * Tezlik uchta qarordan keladi:
 *   1. Uch ro'yxat bitta navbatga qo'shiladi — "qaysi turni ochaman?"
 *      degan savol yo'q
 *   2. Qarordan keyin KEYINGISI o'zi tanlanadi — sichqonchaga qaytish
 *      shart emas
 *   3. Klaviatura: `A` tasdiq, `R` rad, `↓`/`↑` harakat
 */

/** Rad etishning tayyor sabablari — yozishga vaqt ketmasin. */
const REJECT_REASONS = [
  'Rasm xira, matn o‘qilmaydi',
  'Hujjat to‘liq tushmagan, chetlari kesilgan',
  'Hujjat muddati tugagan',
  'Hujjat egasi ma’lumotlarga mos kelmaydi',
  'Noto‘g‘ri hujjat turi yuklangan',
];

export function VerificationsPage() {
  const queryClient = useQueryClient();

  const queue = useQuery({
    queryKey: ['verifications'],
    queryFn: () => api.get<QueueResponse>('/admin/verifications'),
    select: toQueue,
  });

  const items = useMemo(() => queue.data ?? [], [queue.data]);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const reasonRef = useRef<HTMLInputElement>(null);

  const selected = items.find((item) => item.key === selectedKey) ?? items[0] ?? null;

  // Ro'yxat kelgach birinchi elementni o'zi tanlaydi: operator ekranga
  // kirib, darhol ishlay boshlashi kerak
  useEffect(() => {
    if (!selectedKey && items.length > 0) setSelectedKey(items[0]?.key ?? null);
  }, [items, selectedKey]);

  const select = useCallback((item: QueueItem | null) => {
    setSelectedKey(item?.key ?? null);
    // Yangi element — eski rad etish formasi va sababi yopiladi.
    // Aks holda oldingi hujjatning sababi keyingisiga yopishib qolardi
    setRejecting(false);
    setReason('');
    setError(null);
  }, []);

  const review = useMutation({
    mutationFn: async (input: { item: QueueItem; approve: boolean; reason?: string }) => {
      await api.post(reviewPath(input.item), {
        approve: input.approve,
        ...(input.reason ? { reason: input.reason } : {}),
      });
      return input.item;
    },
    onSuccess: (item) => {
      const next = nextAfterRemoval(items, item.key);

      // Ro'yxatni SERVERDAN qayta so'ramaymiz: hal qilingan element
      // darhol yo'qolishi kerak. Qayta so'rov 200-300 ms kutish degani
      // va u har bir elementga qo'shilib, 20 soniyalik maqsadni buzadi
      queryClient.setQueryData<QueueResponse>(['verifications'], (previous) =>
        previous ? removeFromResponse(previous, item) : previous,
      );

      select(next);
    },
    onError: (cause: unknown) => {
      setError(cause instanceof ApiError ? cause.message : 'Amal bajarilmadi');
    },
  });

  const approve = useCallback(() => {
    if (!selected || review.isPending) return;
    setError(null);
    review.mutate({ item: selected, approve: true });
  }, [selected, review]);

  const startReject = useCallback(() => {
    if (!selected || review.isPending) return;
    setRejecting(true);
    setError(null);
    // Fokusni sababga: operator darhol yozishi yoki tayyor variantni
    // tanlashi mumkin
    setTimeout(() => reasonRef.current?.focus(), 0);
  }, [selected, review.isPending]);

  const confirmReject = useCallback(
    (text: string) => {
      if (!selected || review.isPending) return;
      const trimmed = text.trim();

      // SABAB MAJBURIY. Server uni ixtiyoriy qiladi, lekin sababsiz rad
      // etish foydalanuvchiga "hujjatingiz rad etildi" degan xabar
      // yuboradi va u nima qilishini bilmaydi — qayta yuklaydi, yana
      // rad etiladi va navbat aylanib qoladi
      if (!trimmed) {
        setError('Rad etish sababini koʻrsating — foydalanuvchi nima qilishini bilishi kerak');
        reasonRef.current?.focus();
        return;
      }

      setError(null);
      review.mutate({ item: selected, approve: false, reason: trimmed });
    },
    [selected, review],
  );

  const move = useCallback(
    (delta: number) => {
      if (items.length === 0) return;
      const index = items.findIndex((item) => item.key === selected?.key);
      const nextIndex = Math.min(Math.max((index === -1 ? 0 : index) + delta, 0), items.length - 1);
      select(items[nextIndex] ?? null);
    },
    [items, selected, select],
  );

  // ------------------------------------------------- klaviatura yorliqlari

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // MATN YOZILAYOTGANDA YORLIQLAR ISHLAMAYDI: rad etish sababida
      // "A" harfini yozish tasdiqlashni ishga tushirsa, hujjat xato
      // tasdiqlanadi va buni orqaga qaytarib bo'lmaydi
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      switch (event.key.toLowerCase()) {
        case 'a':
          event.preventDefault();
          approve();
          break;
        case 'r':
          event.preventDefault();
          startReject();
          break;
        case 'arrowdown':
          event.preventDefault();
          move(1);
          break;
        case 'arrowup':
          event.preventDefault();
          move(-1);
          break;
        default:
          break;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [approve, startReject, move]);

  // ----------------------------------------------------------- ko'rinish

  if (queue.isPending) {
    return <p className="text-sm text-slate-500">Navbat yuklanmoqda…</p>;
  }

  if (queue.isError) {
    return (
      <Alert>
        {queue.error instanceof ApiError ? queue.error.message : 'Navbatni yuklab boʻlmadi'}
      </Alert>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      <header className="mb-4 flex items-baseline gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Verifikatsiya navbati</h1>
        <span className="text-sm text-slate-500">{items.length} ta kutilmoqda</span>
        <span className="ml-auto text-xs text-slate-400">
          <kbd className="rounded border border-slate-300 px-1">A</kbd> tasdiq ·{' '}
          <kbd className="rounded border border-slate-300 px-1">R</kbd> rad ·{' '}
          <kbd className="rounded border border-slate-300 px-1">↑↓</kbd> harakat
        </span>
      </header>

      {items.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600">
            Navbat bo‘sh. Tekshirishni kutayotgan hujjat, haydovchi yoki transport yo‘q.
          </p>
        </Card>
      ) : (
        <div className="flex min-h-0 flex-1 gap-4">
          <QueueList items={items} selected={selected} onSelect={select} />

          <section className="flex min-w-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white p-5">
            {selected ? (
              <>
                <ItemHeader item={selected} />

                <div className="min-h-0 flex-1 py-4">
                  {selected.kind === 'document' ? (
                    <DocumentPane documentId={selected.id} />
                  ) : (
                    <NonDocumentPane item={selected} />
                  )}
                </div>

                {error ? (
                  <div className="mb-3">
                    <Alert>{error}</Alert>
                  </div>
                ) : null}

                {rejecting ? (
                  <RejectForm
                    inputRef={reasonRef}
                    reason={reason}
                    onReason={setReason}
                    onCancel={() => {
                      setRejecting(false);
                      setReason('');
                      setError(null);
                    }}
                    onConfirm={() => confirmReject(reason)}
                    pending={review.isPending}
                  />
                ) : (
                  <div className="flex gap-2">
                    <Button onClick={approve} loading={review.isPending}>
                      Tasdiqlash
                    </Button>
                    <Button variant="danger" onClick={startReject} disabled={review.isPending}>
                      Rad etish
                    </Button>
                  </div>
                )}
              </>
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ ro'yxat

function QueueList({
  items,
  selected,
  onSelect,
}: {
  items: QueueItem[];
  selected: QueueItem | null;
  onSelect: (item: QueueItem) => void;
}) {
  return (
    <nav
      aria-label="Navbat"
      className="w-80 shrink-0 overflow-y-auto rounded-xl border border-slate-200 bg-white"
    >
      <ul>
        {items.map((item) => {
          const isSelected = item.key === selected?.key;
          return (
            <li key={item.key}>
              <button
                onClick={() => onSelect(item)}
                aria-current={isSelected ? 'true' : undefined}
                className={clsx(
                  'w-full border-b border-slate-100 px-4 py-3 text-left transition',
                  isSelected ? 'bg-brand-50' : 'hover:bg-slate-50',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                    {KIND_LABELS[item.kind]}
                  </span>
                  <span className="truncate text-sm font-medium text-slate-900">{item.title}</span>
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-500">{item.subtitle}</p>
                <p className="mt-0.5 text-xs text-slate-400">{waitingFor(item.createdAt)}</p>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function ItemHeader({ item }: { item: QueueItem }) {
  return (
    <div className="border-b border-slate-100 pb-3">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-slate-900">{item.title}</h2>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
          {KIND_LABELS[item.kind]}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        {item.ownerName}
        {item.ownerPhone ? ` · ${item.ownerPhone}` : ''}
      </p>
    </div>
  );
}

// ------------------------------------------------------------ hujjat paneli

/**
 * Hujjat ko'rinishi.
 *
 * HAVOLA FAQAT TANLANGANDA SO'RALADI va bu ATAYLAB sekinroq:
 * `GET /admin/documents/:id/url` har chaqirilganda AUDITGA yozadi.
 * Keyingi hujjatni oldindan yuklab qo'yish (prefetch) tezroq bo'lardi,
 * lekin ochilmagan hujjatlar uchun soxta "ko'rildi" yozuvlari yaratardi
 * va audit jurnali ishonchsiz bo'lib qolardi.
 */
function DocumentPane({ documentId }: { documentId: string }) {
  const view = useQuery({
    queryKey: ['document-url', documentId],
    queryFn: () => api.get<DocumentView>(`/admin/documents/${documentId}/url`),
    // Havola 5 daqiqada o'ladi — undan oldin yangilash kerak
    staleTime: 4 * 60 * 1000,
    retry: false,
  });

  if (view.isPending) return <p className="text-sm text-slate-500">Hujjat yuklanmoqda…</p>;

  if (view.isError) {
    return (
      <Alert>
        {view.error instanceof ApiError ? view.error.message : 'Hujjatni ochib boʻlmadi'}
      </Alert>
    );
  }

  return <DocumentViewer document={view.data} />;
}

/**
 * Haydovchi va transport uchun.
 *
 * Bu ikkisida ko'riladigan fayl yo'q — qaror ularning hujjatlari
 * asosida qabul qilinadi. Shuning uchun ataylab aytiladi: operator
 * "rasm qani?" deb izlamasin.
 */
function NonDocumentPane({ item }: { item: QueueItem }) {
  return (
    <Card>
      <p className="text-sm text-slate-700">{item.subtitle}</p>
      <p className="mt-3 text-sm text-slate-500">
        Bu yozuvda ko‘riladigan fayl yo‘q. Qaror shu foydalanuvchining hujjatlari asosida qabul
        qilinadi — ular navbatda alohida turadi.
      </p>
    </Card>
  );
}

// -------------------------------------------------------- rad etish formasi

function RejectForm({
  inputRef,
  reason,
  onReason,
  onCancel,
  onConfirm,
  pending,
}: {
  inputRef: RefObject<HTMLInputElement>;
  reason: string;
  onReason: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="mb-2 text-sm font-medium text-slate-700">Rad etish sababi</p>

      {/* Tayyor variantlar: eng ko'p uchraydigan beshta sabab. Yozishga
          ketadigan 10-15 soniya bitta bosishga qisqaradi */}
      <div className="mb-3 flex flex-wrap gap-2">
        {REJECT_REASONS.map((text) => (
          <button
            key={text}
            onClick={() => onReason(text)}
            className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-100"
          >
            {text}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          ref={inputRef}
          value={reason}
          onChange={(event) => onReason(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onConfirm();
            if (event.key === 'Escape') onCancel();
          }}
          placeholder="Sabab — foydalanuvchi shu matnni koʻradi"
          aria-label="Rad etish sababi"
        />
        <Button variant="danger" onClick={onConfirm} loading={pending}>
          Rad etish
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          Bekor
        </Button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ yordam

/** Element navbatda qancha kutgani. SLA buzilishini ko'z bilan ko'rish uchun. */
export function waitingFor(createdAt: string, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - new Date(createdAt).getTime()) / 60000);
  if (minutes < 1) return 'hozir';
  if (minutes < 60) return `${minutes} daqiqa kutmoqda`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} soat kutmoqda`;
  return `${Math.floor(hours / 24)} kun kutmoqda`;
}

/** Hal qilingan elementni server javobidan olib tashlaydi. */
function removeFromResponse(response: QueueResponse, item: QueueItem): QueueResponse {
  const next: QueueResponse = {
    documents:
      item.kind === 'document'
        ? response.documents.filter((row) => row.id !== item.id)
        : response.documents,
    drivers:
      item.kind === 'driver'
        ? response.drivers.filter((row) => row.userId !== item.id)
        : response.drivers,
    vehicles:
      item.kind === 'vehicle'
        ? response.vehicles.filter((row) => row.id !== item.id)
        : response.vehicles,
    total: 0,
  };
  next.total = next.documents.length + next.drivers.length + next.vehicles.length;
  return next;
}
