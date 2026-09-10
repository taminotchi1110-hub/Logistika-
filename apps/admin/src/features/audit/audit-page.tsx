import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Alert, Card, Input } from '@/components/ui';
import { api } from '@/lib/api';
import { ApiError } from '@/lib/api-error';

/**
 * Audit jurnali.
 *
 * O'CHIRIB BO'LMAYDI (append-only) va bu ekranda ham hech qanday
 * o'zgartirish amali yo'q — faqat o'qish. Bu ataylab: audit jurnali
 * admin o'zboshimchaligiga qarshi yagona himoya va uni tahrirlash
 * imkoniyati butun ma'nosini yo'q qiladi.
 */

export interface AuditLog {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  /** Serverda JSONB — obyekt yoki `null`. */
  before: unknown;
  after: unknown;
  ip: string | null;
  createdAt: string;
  adminEmail: string | null;
  adminName: string | null;
}

/**
 * Oldingi va keyingi holat farqi.
 *
 * BUTUN JSON KO'RSATILMAYDI, faqat O'ZGARGAN maydonlar. "kim
 * komissiyani 5% dan 12% ga ko'tardi?" degan savolga javob bir
 * qarashda ko'rinishi kerak — o'ttiz qatorli JSON ichidan izlab emas.
 */
export function diffFields(
  before: unknown,
  after: unknown,
): { field: string; from: string; to: string }[] {
  const beforeObject = asRecord(before);
  const afterObject = asRecord(after);

  const keys = new Set([...Object.keys(beforeObject), ...Object.keys(afterObject)]);
  const changes: { field: string; from: string; to: string }[] = [];

  for (const key of keys) {
    const from = stringify(beforeObject[key]);
    const to = stringify(afterObject[key]);
    if (from !== to) changes.push({ field: key, from, to });
  }

  return changes;
}

function asRecord(value: unknown): Record<string, unknown> {
  // Server `before`/`after` ni `null` yoki obyekt qilib yuboradi, lekin
  // massiv ham kelishi mumkin — `Object.keys` unda indekslarni beradi
  // va bu ham to'g'ri natija
  if (value === null || value === undefined || typeof value !== 'object') return {};
  return value as Record<string, unknown>;
}

function stringify(value: unknown): string {
  if (value === undefined) return '—';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export function formatMoment(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AuditPage() {
  const [action, setAction] = useState('');

  const logs = useQuery({
    queryKey: ['audit-logs', action],
    queryFn: () => api.get<AuditLog[]>('/admin/audit-logs', { action, limit: 100 }),
    placeholderData: (previous) => previous,
  });

  const rows = logs.data ?? [];

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Audit jurnali</h1>
        <span className="text-sm text-slate-500">{rows.length} ta yozuv</span>
        <div className="ml-auto w-64">
          <Input
            value={action}
            onChange={(event) => setAction(event.target.value)}
            placeholder="Amal turi: user.ban"
            aria-label="Amal turi"
          />
        </div>
      </header>

      {logs.isError ? (
        <Alert>
          {logs.error instanceof ApiError ? logs.error.message : 'Jurnalni yuklab boʻlmadi'}
        </Alert>
      ) : logs.isPending ? (
        <p className="text-sm text-slate-500">Yuklanmoqda…</p>
      ) : rows.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600">
            Yozuv topilmadi. Amal turini toʻliq yozing, masalan <code>user.ban</code>.
          </p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {rows.map((log) => {
            const changes = diffFields(log.before, log.after);
            return (
              <li key={log.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <code className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800">
                      {log.action}
                    </code>
                    {log.entityType ? (
                      <span className="text-xs text-slate-500">
                        {log.entityType}
                        {log.entityId ? ` · ${log.entityId.slice(0, 8)}` : ''}
                      </span>
                    ) : null}
                    <span className="ml-auto tabular text-xs text-slate-400">
                      {formatMoment(log.createdAt)}
                    </span>
                  </div>

                  <p className="mt-1 text-sm text-slate-700">
                    {log.adminName ?? log.adminEmail ?? 'Nomaʼlum admin'}
                    {/* IP — kim qayerdan kirganini aniqlash uchun.
                        Ichki xavf tekshiruvida asosiy dalil */}
                    {log.ip ? <span className="tabular text-slate-400"> · {log.ip}</span> : null}
                  </p>

                  {changes.length > 0 ? (
                    <ul className="mt-2 space-y-0.5">
                      {changes.map((change) => (
                        <li key={change.field} className="text-sm">
                          <span className="text-slate-500">{change.field}:</span>{' '}
                          <span className="tabular text-danger line-through">{change.from}</span>{' '}
                          <span className="text-slate-400">→</span>{' '}
                          <span className="tabular text-ok">{change.to}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
