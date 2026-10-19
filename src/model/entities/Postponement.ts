/** Категории причин переноса пуска (для детализации в отчёте). */
export const POSTPONE_REASONS = ['weather', 'technical', 'payload', 'other'] as const;
export type PostponeReason = (typeof POSTPONE_REASONS)[number];

export const POSTPONE_REASON_TITLES: Record<PostponeReason, string> = {
  weather: 'Метеоусловия',
  technical: 'Техническая неготовность',
  payload: 'Неготовность полезной нагрузки',
  other: 'Прочее',
};

/** Запись журнала переносов. */
export interface Postponement {
  launchId: number;
  oldWindowStart: string;
  newWindowStart: string;
  category: PostponeReason;
  reason: string;
  weatherReportId: number | null;
}
