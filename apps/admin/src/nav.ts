/**
 * Yon menyu.
 *
 * HAR BIR BO'LIM BACKENDDAGI HUQUQ BILAN BOG'LANGAN — `permission`
 * qiymatlari `admin.controller.ts` dagi `@RequirePermission(...)` dan
 * bir-bir olingan. Sabab: menyuda ko'rinib turgan, lekin bosilganda
 * 403 beradigan bo'lim — buzilgan interfeys. Moderator moliya bo'limini
 * umuman ko'rmasligi kerak.
 *
 * ROʻYXAT API DA MAVJUD BOʻLGANIGA MOS. `docs/08-admin.md` da bundan
 * kengroq reja bor (impersonate, reconciliation, kanban, feature flags),
 * lekin backend ularni hali bermaydi. Mavjud boʻlmagan endpointga
 * menyu qoʻyish — ishlamaydigan panel degani.
 */
export interface NavItem {
  path: string;
  label: string;
  /** Backenddagi `@RequirePermission` qiymati. */
  permission: string;
  /** Menyu guruhi — uzun ro'yxatni ko'z bilan bo'lish uchun. */
  group: 'ish' | 'moliya' | 'tizim';
}

export const NAV_ITEMS: readonly NavItem[] = [
  { path: '/', label: 'Boshqaruv paneli', permission: 'dashboard.view', group: 'ish' },
  { path: '/verifications', label: 'Verifikatsiya navbati', permission: 'docs.verify', group: 'ish' },
  { path: '/users', label: 'Foydalanuvchilar', permission: 'users.view', group: 'ish' },
  { path: '/orders', label: 'Buyurtmalar', permission: 'orders.view', group: 'ish' },
  { path: '/complaints', label: 'Shikoyatlar', permission: 'complaints.view', group: 'ish' },

  { path: '/payouts', label: 'Pul yechish navbati', permission: 'payments.view', group: 'moliya' },
  { path: '/ledger', label: 'Ledger butunligi', permission: 'payments.view', group: 'moliya' },

  { path: '/settings', label: 'Sozlamalar', permission: 'settings.view', group: 'tizim' },
  { path: '/audit', label: 'Audit jurnali', permission: 'audit.view', group: 'tizim' },
];

export const GROUP_LABELS: Record<NavItem['group'], string> = {
  ish: 'Operatsiya',
  moliya: 'Moliya',
  tizim: 'Tizim',
};

/**
 * Ko'rinadigan bo'limlar.
 *
 * `can` — sessiyadan keladi va backend mantiqining aynan nusxasi
 * (`lib/permissions.ts`).
 */
export function visibleNavItems(can: (permission: string) => boolean): NavItem[] {
  return NAV_ITEMS.filter((item) => can(item.permission));
}
