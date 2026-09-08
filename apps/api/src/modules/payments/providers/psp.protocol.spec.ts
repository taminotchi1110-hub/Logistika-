import { createHash } from 'node:crypto';

import {
  CLICK_ACTION,
  CLICK_ERROR,
  clickAmountToTiyin,
  clickError,
  clickSignature,
  tiyinToClickAmount,
  verifyClickSignature,
  type ClickRequest,
} from './click.protocol';
import {
  PAYME_ERROR,
  PAYME_STATE,
  extractPaymentId,
  isPaymeTimedOut,
  paymeFailure,
  paymeSuccess,
  paymeTime,
  verifyPaymeAuth,
} from './payme.protocol';

const SECRET = 'test_secret_key';

const prepareRequest = (over: Partial<ClickRequest> = {}): ClickRequest => {
  const base = {
    click_trans_id: '123456789',
    service_id: '12345',
    merchant_trans_id: 'a1b2c3',
    amount: '240000.00',
    action: '0',
    sign_time: '2026-09-08 12:00:00',
    sign_string: '',
    ...over,
  };
  return { ...base, sign_string: over.sign_string ?? clickSignature(base, SECRET) };
};

describe('Click imzosi', () => {
  it('Prepare uchun toʻgʻri hisoblanadi', () => {
    const request = prepareRequest();
    const expected = createHash('md5')
      .update(`123456789${'12345'}${SECRET}a1b2c3240000.0002026-09-08 12:00:00`)
      .digest('hex');

    expect(clickSignature(request, SECRET)).toBe(expected);
  });

  it('Complete uchun merchant_prepare_id ham qoʻshiladi', () => {
    const prepare = clickSignature(
      { ...prepareRequest(), action: String(CLICK_ACTION.PREPARE) },
      SECRET,
    );
    const complete = clickSignature(
      {
        ...prepareRequest(),
        action: String(CLICK_ACTION.COMPLETE),
        merchant_prepare_id: '42',
      },
      SECRET,
    );

    expect(complete).not.toBe(prepare);
  });

  it('toʻgʻri imzo qabul qilinadi', () => {
    expect(verifyClickSignature(prepareRequest(), SECRET)).toBe(true);
  });

  it('notoʻgʻri imzo rad etiladi', () => {
    const request = prepareRequest({ sign_string: 'a'.repeat(32) });
    expect(verifyClickSignature(request, SECRET)).toBe(false);
  });

  it('summa oʻzgartirilsa imzo buziladi', () => {
    const request = prepareRequest();
    const tampered = { ...request, amount: '1.00' };
    expect(verifyClickSignature(tampered, SECRET)).toBe(false);
  });

  it('boshqa kalit bilan imzo mos kelmaydi', () => {
    expect(verifyClickSignature(prepareRequest(), 'boshqa_kalit')).toBe(false);
  });

  it('imzo yoʻq boʻlsa yiqilmaydi', () => {
    const request = { ...prepareRequest(), sign_string: undefined as unknown as string };
    expect(verifyClickSignature(request, SECRET)).toBe(false);
  });
});

describe('Click summasi', () => {
  it('soʻmni tiyinga oʻgiradi', () => {
    expect(clickAmountToTiyin('240000.00')).toBe(24_000_000n);
    expect(clickAmountToTiyin('1000')).toBe(100_000n);
    expect(clickAmountToTiyin('1000.5')).toBe(100_050n);
  });

  it('vergul ham qabul qilinadi', () => {
    expect(clickAmountToTiyin('1000,25')).toBe(100_025n);
  });

  it('suzuvchi nuqta xatosi yuzaga kelmaydi', () => {
    // parseFloat('1000.10') * 100 = 100009.99999999999
    expect(clickAmountToTiyin('1000.10')).toBe(100_010n);
  });

  it('notoʻgʻri qiymat null qaytaradi', () => {
    expect(clickAmountToTiyin('abc')).toBeNull();
    expect(clickAmountToTiyin('-100')).toBeNull();
    expect(clickAmountToTiyin('100.123')).toBeNull();
  });

  it('teskari oʻgirish', () => {
    expect(tiyinToClickAmount(24_000_000n)).toBe('240000.00');
    expect(tiyinToClickAmount(100_050n)).toBe('1000.50');
  });
});

describe('Click xato javobi', () => {
  it('standart izoh bilan qaytadi', () => {
    const response = clickError(CLICK_ERROR.SIGN_CHECK_FAILED, 'a1b2c3', 123);
    expect(response.error).toBe(-1);
    expect(response.error_note).toBe('SIGN CHECK FAILED!');
    expect(response.merchant_trans_id).toBe('a1b2c3');
  });
});

describe('Payme autentifikatsiyasi', () => {
  const key = 'merchant_secret_key';
  const header = `Basic ${Buffer.from(`Paycom:${key}`).toString('base64')}`;

  it('toʻgʻri kalit qabul qilinadi', () => {
    expect(verifyPaymeAuth(header, key)).toBe(true);
  });

  it('notoʻgʻri kalit rad etiladi', () => {
    const bad = `Basic ${Buffer.from('Paycom:wrong').toString('base64')}`;
    expect(verifyPaymeAuth(bad, key)).toBe(false);
  });

  it('login Paycom boʻlishi shart', () => {
    const bad = `Basic ${Buffer.from(`admin:${key}`).toString('base64')}`;
    expect(verifyPaymeAuth(bad, key)).toBe(false);
  });

  it('sarlavha yoʻq yoki notoʻgʻri formatda', () => {
    expect(verifyPaymeAuth(undefined, key)).toBe(false);
    expect(verifyPaymeAuth('Bearer token', key)).toBe(false);
    expect(verifyPaymeAuth('Basic !!!notbase64!!!', key)).toBe(false);
  });

  it('kalitda ikki nuqta boʻlsa ham toʻgʻri ajratiladi', () => {
    const trickyKey = 'a:b:c';
    const trickyHeader = `Basic ${Buffer.from(`Paycom:${trickyKey}`).toString('base64')}`;
    expect(verifyPaymeAuth(trickyHeader, trickyKey)).toBe(true);
  });
});

describe('Payme JSON-RPC', () => {
  it('muvaffaqiyatli javob', () => {
    const response = paymeSuccess(7, { allow: true });
    expect(response).toEqual({ jsonrpc: '2.0', id: 7, result: { allow: true } });
  });

  it('xato javobi uch tilda', () => {
    const response = paymeFailure(7, PAYME_ERROR.INVALID_AMOUNT);
    expect(response.error.code).toBe(-31001);
    expect(response.error.message.uz).toBeTruthy();
    expect(response.error.message.ru).toBeTruthy();
    expect(response.error.message.en).toBeTruthy();
  });

  it('id boʻlmasa null', () => {
    expect(paymeSuccess(undefined, {}).id).toBeNull();
  });

  it('nomaʼlum kod uchun ham xabar bor', () => {
    expect(paymeFailure(1, -99999).error.message.uz).toBeTruthy();
  });
});

describe('Payme account', () => {
  it('payment_id ni oladi', () => {
    expect(extractPaymentId({ account: { payment_id: 'abc' } })).toBe('abc');
  });

  it('notoʻgʻri kalitda null', () => {
    expect(extractPaymentId({ account: { order_id: 'abc' } })).toBeNull();
    expect(extractPaymentId({})).toBeNull();
    expect(extractPaymentId(undefined)).toBeNull();
    expect(extractPaymentId({ account: 'abc' })).toBeNull();
  });
});

describe('Payme vaqt', () => {
  it('millisekundga oʻgiradi', () => {
    const date = new Date('2026-09-08T12:00:00Z');
    expect(paymeTime(date)).toBe(date.getTime());
    expect(paymeTime(null)).toBe(0);
  });

  it('12 soatdan keyin muddati oʻtadi', () => {
    const created = new Date('2026-09-08T00:00:00Z');
    expect(isPaymeTimedOut(created, new Date('2026-09-08T11:00:00Z'))).toBe(false);
    expect(isPaymeTimedOut(created, new Date('2026-09-08T13:00:00Z'))).toBe(true);
  });
});

describe('Payme holatlari', () => {
  it('qiymatlar oʻzgarmaydi (Payme protokoli)', () => {
    expect(PAYME_STATE.CREATED).toBe(1);
    expect(PAYME_STATE.PERFORMED).toBe(2);
    expect(PAYME_STATE.CANCELLED_BEFORE_PERFORM).toBe(-1);
    expect(PAYME_STATE.CANCELLED_AFTER_PERFORM).toBe(-2);
  });
});
