import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { api, request, setUnauthenticatedHandler } from '@/lib/api';
import { hasPermission } from '@/lib/permissions';
import { clearToken, readToken, writeToken } from '@/lib/token-store';

/** `GET /admin/me` va kirish javobidagi `admin` — backenddagi `AdminSession`. */
export interface AdminSession {
  adminId: string;
  email: string;
  fullName: string;
  role: string;
  permissions: string[];
}

interface LoginResponse {
  accessToken: string;
  admin: AdminSession;
}

/**
 * Nega chiqarildi — kirish ekranida sababni ko'rsatish uchun.
 *
 * "Sizni tizimdan chiqardik" degan xabar sababsiz bo'lsa, operator
 * xato deb o'ylaydi va qayta kirishga urinib, yana chiqib qoladi.
 */
export type LogoutReason = 'manual' | 'expired' | 'idle';

type SessionStatus = 'loading' | 'authenticated' | 'anonymous';

/**
 * Sessiya konteksti.
 *
 * MAYDONLAR METOD SINTAKSISIDA EMAS (`login(input): Promise<void>`),
 * balki XOSSA SINTAKSISIDA (`login: (input) => Promise<void>`). Farqi
 * muhim: metod sintaksisi TypeScript uchun "obyektga bog'langan metod"
 * degani va uni destrukturizatsiya qilish (`const { login } =
 * useSession()`) `this` ni yo'qotish xatosi deb belgilanadi. Bu yerdagi
 * qiymatlar esa `useCallback` bilan yasalgan yopilmalar — ularning
 * `this` i umuman yo'q.
 */
interface SessionValue {
  status: SessionStatus;
  admin: AdminSession | null;
  logoutReason: LogoutReason | null;
  login: (input: { email: string; password: string; totp: string }) => Promise<void>;
  logout: (reason?: LogoutReason) => void;
  /** Huquq bormi — tugmalarni yashirish uchun. Himoya emas, serverda qayta tekshiriladi. */
  can: (permission: string) => boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

/**
 * Harakatsizlik chegarasi.
 *
 * 30 daqiqa — `docs/08-admin.md` dagi talab. Token esa 2 soat yashaydi,
 * ya'ni bu chegara serverdan QATTIQROQ va ataylab shunday: ochiq
 * qoldirilgan admin paneli asosiy xavf, sessiya muddati emas.
 */
const IDLE_LIMIT_MS = 30 * 60 * 1000;

/** Har bir harakatda taymer qayta o'rnatilmasin — 1 daqiqada bir marta yetarli. */
const IDLE_THROTTLE_MS = 60 * 1000;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>(() =>
    readToken() ? 'loading' : 'anonymous',
  );
  const [admin, setAdmin] = useState<AdminSession | null>(null);
  const [logoutReason, setLogoutReason] = useState<LogoutReason | null>(null);

  const logout = useCallback((reason: LogoutReason = 'manual') => {
    clearToken();
    setAdmin(null);
    setStatus('anonymous');
    setLogoutReason(reason);
  }, []);

  /**
   * 401 — token eskirdi yoki bekor qilindi.
   *
   * `api.ts` React'ni bilmaydi, shuning uchun ishlov beruvchini shu
   * yerda ulaymiz. Bitta joyda: aks holda har bir so'rov o'zi
   * tekshirishi kerak bo'lardi.
   */
  useEffect(() => {
    setUnauthenticatedHandler(() => logout('expired'));
    return () => setUnauthenticatedHandler(null);
  }, [logout]);

  /**
   * Sahifa yangilandi, lekin token bor: u haqiqiyligini SERVERDAN
   * so'raymiz.
   *
   * Tokenni o'qib, ichidagi ma'lumotga ishonish mumkin emas:
   *   - admin bloklangan bo'lishi mumkin (token hali amal qiladi)
   *   - roli o'zgargan bo'lishi mumkin (huquqlar tokenda muzlab qolgan)
   * `GET /admin/me` esa har doim joriy holatni qaytaradi.
   */
  useEffect(() => {
    if (!readToken()) return;

    let cancelled = false;
    void (async () => {
      try {
        const session = await api.get<AdminSession>('/admin/me');
        if (cancelled) return;
        setAdmin(session);
        setStatus('authenticated');
      } catch {
        if (cancelled) return;
        // 401 bo'lsa `onUnauthenticated` allaqachon chiqardi; boshqa
        // xatolarda ham kirish ekraniga qaytamiz — yarim holatda
        // qolish operatorni chalg'itadi
        clearToken();
        setAdmin(null);
        setStatus('anonymous');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(
    async (input: { email: string; password: string; totp: string }) => {
      // `anonymous: true` MAJBURIY. Usiz noto'g'ri parolning 401 javobi
      // "token eskirdi" yo'lini ishga tushiradi va operator bir vaqtda
      // ikkita xabar ko'radi: "Email yoki parol noto'g'ri" va "Sessiya
      // muddati tugadi". Ikkinchisi yolg'on — hech qanday sessiya
      // bo'lmagan. Bu xatoni test ushlab oldi (ikkita `role="alert"`).
      const result = await request<LoginResponse>('/admin/auth/login', {
        method: 'POST',
        body: input,
        anonymous: true,
      });
      writeToken(result.accessToken);
      setAdmin(result.admin);
      setStatus('authenticated');
      setLogoutReason(null);
    },
    [],
  );

  // ------------------------------------------------- harakatsizlik taymeri

  const lastActivity = useRef(Date.now());

  useEffect(() => {
    if (status !== 'authenticated') return;

    lastActivity.current = Date.now();

    const touch = () => {
      const now = Date.now();
      if (now - lastActivity.current > IDLE_THROTTLE_MS) {
        lastActivity.current = now;
      }
    };

    // `pointerdown` va `keydown` — haqiqiy harakat. `mousemove` ataylab
    // yo'q: sichqonchani tasodifan turtib qo'yish "ish qilmoqda" degani
    // emas va u taymerni cheksiz uzaytiradi.
    window.addEventListener('pointerdown', touch);
    window.addEventListener('keydown', touch);

    // TAYMER EMAS, INTERVAL: `setTimeout(30 daqiqa)` kompyuter uxlab
    // qolganda ishonchsiz — brauzer uni kechiktiradi yoki umuman
    // o'tkazib yuboradi. Har daqiqada VAQTNI o'zini tekshirish esa
    // uyqudan keyin ham to'g'ri ishlaydi.
    const interval = setInterval(() => {
      if (Date.now() - lastActivity.current >= IDLE_LIMIT_MS) {
        logout('idle');
      }
    }, IDLE_THROTTLE_MS);

    return () => {
      window.removeEventListener('pointerdown', touch);
      window.removeEventListener('keydown', touch);
      clearInterval(interval);
    };
  }, [status, logout]);

  const value = useMemo<SessionValue>(
    () => ({
      status,
      admin,
      logoutReason,
      login,
      logout,
      can: (permission: string) =>
        admin ? hasPermission(admin.permissions, permission) : false,
    }),
    [status, admin, logoutReason, login, logout],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession faqat SessionProvider ichida ishlaydi');
  return value;
}
