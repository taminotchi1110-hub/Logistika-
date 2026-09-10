import { useEffect, useState } from 'react';

import { Button } from '@/components/ui';

export interface DocumentView {
  id: string;
  type: string;
  fileName: string | null;
  mimeType: string | null;
  pageSide: string | null;
  url: string;
}

/**
 * Hujjat ko'ruvchi.
 *
 * ZOOM VA AYLANTIRISH SHART, BEZAK EMAS: pasport telefonda qo'lda
 * suratga olinadi — u yonboshlab tushadi, seriya raqami esa mayda
 * yozuvda bo'ladi. Bu ikki tugmasiz operator hujjatni yuklab olishga
 * majbur bo'ladi va 20 soniyalik maqsad buziladi.
 */
export function DocumentViewer({ document }: { document: DocumentView }) {
  const [rotation, setRotation] = useState(0);
  const [zoomed, setZoomed] = useState(false);

  // Yangi hujjatda holat NOLDAN boshlanadi: oldingi hujjat 90 daraja
  // aylantirilgan bo'lsa, keyingisi ham qiyshiq ko'rinardi va operator
  // buni hujjatning aybi deb o'ylardi
  useEffect(() => {
    setRotation(0);
    setZoomed(false);
  }, [document.id]);

  const isPdf = document.mimeType === 'application/pdf';

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2">
        <Button variant="secondary" onClick={() => setRotation((value) => (value + 90) % 360)}>
          Aylantirish
        </Button>
        <Button variant="secondary" onClick={() => setZoomed((value) => !value)}>
          {zoomed ? 'Kichraytirish' : 'Kattalashtirish'}
        </Button>
        {document.pageSide ? (
          <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">
            {document.pageSide === 'FRONT' ? 'Old tomoni' : 'Orqa tomoni'}
          </span>
        ) : null}
        <span className="ml-auto truncate text-xs text-slate-400">{document.fileName}</span>
      </div>

      <div className="flex-1 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
        {isPdf ? (
          // PDF ni `<img>` ko'rsata olmaydi. `<object>` brauzerning o'z
          // ko'ruvchisini ishlatadi — u zoom va sahifalarni o'zi beradi
          <object data={document.url} type="application/pdf" className="h-[60vh] w-full">
            <p className="p-4 text-sm text-slate-600">
              PDF ko‘rsatilmadi.{' '}
              <a className="text-brand-600 underline" href={document.url} rel="noreferrer">
                Yangi oynada ochish
              </a>
            </p>
          </object>
        ) : (
          <img
            src={document.url}
            alt={document.fileName ?? 'Hujjat'}
            style={{ transform: `rotate(${rotation}deg)` }}
            className={
              zoomed
                ? 'max-w-none origin-center transition-transform'
                : 'mx-auto max-h-[60vh] origin-center transition-transform'
            }
          />
        )}
      </div>
    </div>
  );
}
