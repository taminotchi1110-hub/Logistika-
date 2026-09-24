import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Alert, Button, Card, Input } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { api } from '@/lib/api';
import { ApiError } from '@/lib/api-error';

/**
 * Platforma sozlamalari.
 *
 * BU EKRAN KODNI QAYTA YIGʻMASDAN PLATFORMANI OʻZGARTIRADI: komissiya
 * foizi, matching ogʻirliklari, jarima, offer TTL. Ya'ni bu yerdagi
 * bitta xato butun platformaga darhol taʼsir qiladi.
 *
 * Shuning uchun qiymat JSON sifatida tahrirlanadi va yuborishdan oldin
 * tekshiriladi: server `value` ni ixtiyoriy turda qabul qiladi
 * (`@Allow()`) va notoʻgʻri shakl jimgina saqlanib qolardi.
 */

export interface Setting {
  key: string;
  value: unknown;
  description: string | null;
  updatedAt: string | null;
}

/**
 * Kiritilgan matnni qiymatga aylantiradi.
 *
 * `JSON.parse` ATAYLAB: sozlama soni ham, obyekti ham, massivi ham
 * boʻlishi mumkin (`matching.weights` — obyekt, `radius.steps_km` —
 * massiv). Matnni shunchaki satr sifatida yuborish sozlamani buzardi:
 * `0.05` oʻrniga `"0.05"` yozilsa, uni oʻqiydigan kod NaN oladi.
 */
export function parseValue(
  input: string,
): { ok: true; value: unknown } | { ok: false; error: string } {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: false, error: 'Qiymat boʻsh boʻlishi mumkin emas' };

  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch {
    return {
      ok: false,
      error:
        'Qiymat JSON boʻlishi kerak. Son: 0.05 · Satr: "matn" · Massiv: [10, 50] · Obyekt: {"a": 1}',
    };
  }
}

/** Qiymatni tahrirlash uchun matnga — obyekt va massiv oʻqiladigan koʻrinishda. */
export function formatValue(value: unknown): string {
  return JSON.stringify(value, null, typeof value === 'object' && value !== null ? 2 : 0);
}

export interface MaintenanceSummary {
  partitions: string[];
  expiredOffers: number;
  expiredLoads: number;
  autoCompletedOrders: number;
  deletedOtpRequests: number;
  deletedLoginHistory: number;
  skipped: boolean;
}

/** Natijani odam o'qiydigan qatorlarga aylantiradi. */
export function summaryLines(summary: MaintenanceSummary): string[] {
  if (summary.skipped) {
    return ['Boshqa nusxa shu ishni bajarayotgan edi — oʻtkazib yuborildi'];
  }

  return [
    `Yakunlangan buyurtmalar: ${summary.autoCompletedOrders}`,
    `Muddati oʻtgan takliflar: ${summary.expiredOffers}`,
    `Muddati oʻtgan eʼlonlar: ${summary.expiredLoads}`,
    `Yangi GPS boʻlinmalari: ${summary.partitions.length > 0 ? summary.partitions.join(', ') : 'yoʻq'}`,
    `Tozalangan OTP soʻrovlari: ${summary.deletedOtpRequests}`,
    `Tozalangan kirish tarixi: ${summary.deletedLoginHistory}`,
  ];
}

/**
 * Davriy texnik xizmatni QOʻLDA ishga tushirish.
 *
 * Odatda uni server oʻzi bajaradi (`MAINTENANCE_INTERVAL_MINUTES`).
 * Bu tugma ikki holat uchun: server uzoq oʻchib turganidan keyin
 * navbatni darhol tozalash va ishlayotganini tekshirish.
 *
 * ZARARSIZ, LEKIN BEFARQ EMAS: yetkazilgan buyurtmalar yakunlanadi va
 * pul haydovchilarga oʻtadi. Shuning uchun tasdiqlash soʻraladi va
 * natija audit jurnaliga yoziladi.
 */
export function MaintenanceCard() {
  const { can } = useSession();
  const [confirming, setConfirming] = useState(false);
  const [summary, setSummary] = useState<MaintenanceSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useMutation({
    mutationFn: () => api.post<MaintenanceSummary>('/admin/maintenance/run'),
    onSuccess: (result) => {
      setSummary(result);
      setError(null);
      setConfirming(false);
    },
    onError: (cause: unknown) => {
      setError(cause instanceof ApiError ? cause.message : 'Ishga tushirib boʻlmadi');
      setConfirming(false);
    },
  });

  if (!can('maintenance.run')) return null;

  return (
    <Card className="mt-6">
      <h2 className="font-semibold text-slate-900">Texnik xizmat</h2>
      <p className="mt-1 text-sm text-slate-600">
        Yetkazilgan buyurtmalarni yakunlaydi (pul haydovchiga oʻtadi), muddati oʻtgan taklif va
        eʼlonlarni yopadi, GPS boʻlinmalarini tayyorlaydi, eski OTP va kirish tarixini tozalaydi.
        Server buni oʻzi davriy bajaradi — bu tugma shoshilinch holat uchun.
      </p>

      {error ? (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {summary ? (
        <ul className="mt-3 space-y-1 text-sm text-slate-700">
          {summaryLines(summary).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        {confirming ? (
          <>
            <span className="text-sm text-slate-700">Ishga tushirilsinmi?</span>
            <Button onClick={() => run.mutate()} loading={run.isPending}>
              Ha, ishga tushirilsin
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={run.isPending}>
              Bekor
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={() => setConfirming(true)}>
            Hozir ishga tushirish
          </Button>
        )}
      </div>
    </Card>
  );
}

export function SettingsPage() {
  const { can } = useSession();
  const queryClient = useQueryClient();

  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Setting[]>('/admin/settings'),
  });

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (input: { key: string; value: unknown }) =>
      api.put(`/admin/settings/${input.key}`, { value: input.value }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
      setEditingKey(null);
      setDraft('');
      setError(null);
    },
    onError: (cause: unknown) => {
      setError(cause instanceof ApiError ? cause.message : 'Saqlab boʻlmadi');
    },
  });

  function startEdit(setting: Setting) {
    setEditingKey(setting.key);
    setDraft(formatValue(setting.value));
    setError(null);
  }

  function submit(setting: Setting) {
    const parsed = parseValue(draft);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    save.mutate({ key: setting.key, value: parsed.value });
  }

  if (settings.isError) {
    return (
      <Alert>
        {settings.error instanceof ApiError
          ? settings.error.message
          : 'Sozlamalarni yuklab boʻlmadi'}
      </Alert>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-4">
        <h1 className="text-xl font-semibold text-slate-900">Sozlamalar</h1>
        <p className="mt-1 text-sm text-slate-500">
          O‘zgarish <strong>darhol</strong> kuchga kiradi va audit jurnaliga yoziladi.
        </p>
      </header>

      {settings.isPending ? (
        <p className="text-sm text-slate-500">Yuklanmoqda…</p>
      ) : (
        <ul className="space-y-3">
          {settings.data.map((setting) => (
            <li key={setting.key}>
              <Card>
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm font-medium text-slate-900">{setting.key}</p>
                    {setting.description ? (
                      <p className="mt-0.5 text-sm text-slate-600">{setting.description}</p>
                    ) : null}
                  </div>

                  {editingKey !== setting.key ? (
                    <>
                      <code className="tabular rounded bg-slate-50 px-2 py-1 text-sm text-slate-800">
                        {formatValue(setting.value)}
                      </code>
                      {can('settings.update') ? (
                        <Button variant="secondary" onClick={() => startEdit(setting)}>
                          Oʻzgartirish
                        </Button>
                      ) : null}
                    </>
                  ) : null}
                </div>

                {editingKey === setting.key ? (
                  <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                    {error ? <Alert>{error}</Alert> : null}
                    <Input
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      aria-label={`${setting.key} qiymati`}
                      className="font-mono"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button onClick={() => submit(setting)} loading={save.isPending}>
                        Saqlash
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setEditingKey(null);
                          setDraft('');
                          setError(null);
                        }}
                        disabled={save.isPending}
                      >
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

      <MaintenanceCard />
    </div>
  );
}
