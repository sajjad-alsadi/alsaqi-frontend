import i18next from 'i18next';

export type Language = 'en' | 'ar';

export const t = (key: string, lang: Language): string => {
  return i18next.t(key, { lng: lang });
};

export const formatNumber = (value: number, lang: Language): string => {
  return new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-US').format(value);
};

export const formatDate = (date: Date | string, lang: Language): string => {
  const d = new Date(date);
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(d);
};

export const translateStatus = (status: string, lang: Language): string => {
  return i18next.t(status, { lng: lang });
};
