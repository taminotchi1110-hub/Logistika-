import clsx from 'clsx';
import { NavLink, Outlet } from 'react-router-dom';

import { useSession } from '@/features/auth/session';
import { GROUP_LABELS, visibleNavItems, type NavItem } from '@/nav';

import { Button } from './ui';

/**
 * Panel qobig'i: yon menyu + kontent.
 *
 * Menyu HUQUQ BO'YICHA filtrlanadi. Bu himoya emas (server har safar
 * qayta tekshiradi), lekin interfeys to'g'riligi: moderator moliya
 * bo'limini ko'rib, bosib, 403 olishi kerak emas.
 */
export function AppShell() {
  const { admin, can, logout } = useSession();

  const items = visibleNavItems(can);
  const groups = groupBy(items);

  return (
    <div className="flex min-h-screen bg-slate-100">
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <p className="text-lg font-semibold text-slate-900">Karvon</p>
          <p className="text-xs text-slate-500">Admin paneli</p>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          {groups.map(([group, groupItems]) => (
            <div key={group} className="mb-4">
              <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {GROUP_LABELS[group]}
              </p>
              <ul className="flex flex-col gap-0.5">
                {groupItems.map((item) => (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      // `end` faqat ildiz uchun: aks holda "/" har qanday
                      // sahifada faol ko'rinadi
                      end={item.path === '/'}
                      className={({ isActive }) =>
                        clsx(
                          'block rounded-lg px-3 py-2 text-sm transition',
                          isActive
                            ? 'bg-brand-50 font-medium text-brand-700'
                            : 'text-slate-700 hover:bg-slate-100',
                        )
                      }
                    >
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-slate-200 p-3">
          <p className="truncate px-2 text-sm font-medium text-slate-800">{admin?.fullName}</p>
          {/* Rol KO'RINIB TURADI: operator o'zi nima qila olishini
              bilishi kerak, "tugma qayerda?" savoli o'rniga */}
          <p className="truncate px-2 pb-2 text-xs text-slate-500">
            {admin?.email} · {admin?.role}
          </p>
          <Button variant="secondary" className="w-full" onClick={() => logout('manual')}>
            Chiqish
          </Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}

/** Guruhlarni menyudagi tartibda saqlaymiz — `Object.entries` tartibi kafolatlanmagan. */
function groupBy(items: NavItem[]): [NavItem['group'], NavItem[]][] {
  const order: NavItem['group'][] = ['ish', 'moliya', 'tizim'];
  return order
    .map((group): [NavItem['group'], NavItem[]] => [
      group,
      items.filter((item) => item.group === group),
    ])
    .filter(([, groupItems]) => groupItems.length > 0);
}
