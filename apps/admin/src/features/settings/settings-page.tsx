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
export function parseValue(input: string): { ok: true; value: unknown } | { ok: false; error: string } {
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
    </div>
  );
}
