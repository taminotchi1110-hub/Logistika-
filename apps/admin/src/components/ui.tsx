import clsx from 'clsx';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

/**
 * Asosiy UI primitivlari.
 *
 * NEGA BITTA FAYL: bular juda kichik va har doim birga o'zgaradi
 * (masalan asosiy rang o'zgarsa — tugma ham, input fokusi ham). Har
 * biriga alohida fayl ochish bu yerda tartib emas, shovqin bo'lardi.
 *
 * NEGA shadcn/ui GENERATORI ISHLATILMADI: shadcn — bog'liqlik emas,
 * "komponentni loyihaga ko'chirib ol" to'plami. Uning `init` buyrug'i
 * interaktiv va Radix'ni butunlay tortadi. Hozircha kerak bo'lgan
 * primitivlar shu qadar oddiy. Dialog, dropdown va tooltip kerak
 * bo'lganda Radix qo'shiladi — ularni qo'lda yozish klaviatura
 * navigatsiyasi va ARIA jihatidan xato bo'ladi.
 */

// -------------------------------------------------------------- tugma

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 focus-visible:outline-brand-600',
  secondary:
    'bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 focus-visible:outline-slate-400',
  danger: 'bg-danger text-white hover:brightness-110 focus-visible:outline-danger',
  ghost: 'text-slate-700 hover:bg-slate-100 focus-visible:outline-slate-400',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  loading = false,
  className,
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      // `type` ataylab ko'rsatiladi: HTML'da standart qiymat `submit` va
      // formadagi oddiy tugma sahifani tasodifan yuborib qo'yadi
      type={rest.type ?? 'button'}
      // Yuklanayotganda ham o'chirilgan: ikki marta bosish payoutni
      // ikki marta bajarishi mumkin
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium',
        'transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}

// --------------------------------------------------------------- maydon

export interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, hint, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {/* Xato va izoh BIR VAQTDA ko'rsatilmaydi: ikkisi birga chiqsa
          operator qaysi biri muhimligini bilmaydi */}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-sm text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900',
        'placeholder:text-slate-400',
        'focus:border-brand-500 focus:outline focus:outline-2 focus:outline-offset-0 focus:outline-brand-200',
        'disabled:bg-slate-50 disabled:text-slate-500',
        className,
      )}
      {...rest}
    />
  );
}

// ---------------------------------------------------------------- karta

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={clsx(
        'rounded-xl border border-slate-200 bg-white p-5 shadow-sm',
        className,
      )}
    >
      {children}
    </div>
  );
}

// ------------------------------------------------------------ ogohlantirish

type AlertTone = 'error' | 'warn' | 'info';

const ALERT_TONES: Record<AlertTone, string> = {
  error: 'border-danger/30 bg-danger/5 text-danger',
  warn: 'border-warn/30 bg-warn/5 text-warn',
  info: 'border-brand-200 bg-brand-50 text-brand-800',
};

export function Alert({
  tone = 'error',
  children,
}: {
  tone?: AlertTone;
  children: ReactNode;
}) {
  return (
    <div
      // `role="alert"` — ekran o'qiydigan dastur xabarni DARHOL aytadi.
      // Kirish xatosi shunday bo'lishi kerak: fokus inputda qoladi,
      // lekin sabab eshitiladi.
      role="alert"
      className={clsx('rounded-lg border px-4 py-3 text-sm', ALERT_TONES[tone])}
    >
      {children}
    </div>
  );
}
