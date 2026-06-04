import i18n from '../i18n';

/**
 * Converts numbers to Eastern Arabic numerals (٠١٢٣٤٥٦٧٨٩) if the current language is Arabic.
 * Otherwise, returns the number as a string in Western Arabic numerals.
 */
export const formatNumber = (num: number | string): string => {
  const currentLng = i18n.language || 'ar';
  
  if (currentLng.startsWith('ar')) {
    const id = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    return String(num).replace(/[0-9]/g, (w) => id[+w]);
  }
  
  const n = typeof num === 'string' ? parseFloat(num) : num;
  if (isNaN(n)) return String(num);
  
  return n.toLocaleString('en-US');
};

/**
 * Formats a date according to the current language.
 */
export const formatDate = (date: Date | string): string => {
  const d = new Date(date);
  if (isNaN(d.getTime())) return String(date);
  
  const currentLng = i18n.language || 'ar';
  return new Intl.DateTimeFormat(currentLng.startsWith('ar') ? 'ar-EG' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(d);
};
