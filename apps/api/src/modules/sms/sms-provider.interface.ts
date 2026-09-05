export interface SmsMessage {
  /** E.164: +998901234567 */
  to: string;
  text: string;
}

export interface SmsSendResult {
  providerMessageId?: string;
}

/**
 * SMS provayder shartnomasi.
 *
 * Nega interfeys: Oʻzbekistonda bitta provayderga tayanish xavfli — moderatsiya,
 * texnik uzilish yoki narx oʻzgarishi butun roʻyxatdan oʻtishni toʻxtatadi.
 * Adapter ortida turgani uchun ikkinchi provayderni qoʻshish bir fayl ishi,
 * failover esa `SmsService` darajasida hal qilinadi.
 */
export interface SmsProvider {
  readonly name: string;
  send(message: SmsMessage): Promise<SmsSendResult>;
}

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');
