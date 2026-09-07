import { AppError } from '@/common/errors/app.error';

import { buildPage, decodeCursor, encodeCursor } from './cursor.util';

describe('cursor kodlash', () => {
  it('kodlab-dekodlaganda qiymat oʻzgarmaydi', () => {
    const payload = { v: '2026-09-05T10:00:00.000Z', id: 'b4a1-uuid' };
    expect(decodeCursor(encodeCursor(payload))).toEqual(payload);
  });

  it('son qiymatni ham qoʻllab-quvvatlaydi (masalan match score)', () => {
    const payload = { v: 93.5, id: 'x1' };
    expect(decodeCursor(encodeCursor(payload))).toEqual(payload);
  });

  it('kursor ochiq matn emas — URL-xavfsiz base64', () => {
    const cursor = encodeCursor({ v: '2026-09-05T10:00:00.000Z', id: 'b4a1' });
    expect(cursor).not.toContain('2026');
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([['bekor-qiymat'], [''], ['eyJmb28iOiJiYXIifQ']])(
    'buzilgan kursorda tushunarli xato beradi: %s',
    (bad) => {
      expect(() => decodeCursor(bad)).toThrow(AppError);
    },
  );
});

describe('buildPage', () => {
  const rows = Array.from({ length: 6 }, (_, index) => ({
    id: `id-${index}`,
    createdAt: `2026-09-0${index + 1}T00:00:00.000Z`,
  }));

  const toCursor = (row: (typeof rows)[number]) => ({ v: row.createdAt, id: row.id });

  it('ortiqcha qator boʻlsa hasMore=true va oxirgisi kesiladi', () => {
    const page = buildPage(rows, 5, toCursor);

    expect(page.items).toHaveLength(5);
    expect(page.hasMore).toBe(true);
    expect(page.items.at(-1)?.id).toBe('id-4');
  });

  it('nextCursor oxirgi QAYTARILGAN qatorga ishora qiladi, kesilganiga emas', () => {
    const page = buildPage(rows, 5, toCursor);
    const decoded = decodeCursor(page.nextCursor!);

    expect(decoded.id).toBe('id-4');
  });

  it('oxirgi sahifada hasMore=false va nextCursor=null', () => {
    const page = buildPage(rows.slice(0, 3), 5, toCursor);

    expect(page.items).toHaveLength(3);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it('boʻsh natijada ham xato bermaydi', () => {
    const page = buildPage([], 20, toCursor);

    expect(page.items).toEqual([]);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it('aynan limitga teng boʻlsa yana bor demaydi', () => {
    const page = buildPage(rows.slice(0, 5), 5, toCursor);
    expect(page.hasMore).toBe(false);
  });
});
