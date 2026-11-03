/**
 * Hijri date conversion utility
 * Converts Gregorian dates to Hijri (Islamic) calendar
 */

const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

const toArabic = (n: number) => n.toString().split('').map(d => arabicDigits[parseInt(d)]).join('');

export interface HijriDate {
  year: number;
  month: number;
  day: number;
  formatted: string;
}

/**
 * Convert Gregorian date to Hijri date
 * Uses the standard astronomical calculation
 */
export const gregorianToHijri = (date: Date): HijriDate => {
  const gregYear = date.getFullYear();
  const gregMonth = date.getMonth() + 1;
  const gregDay = date.getDate();
  
  let jd = Math.floor((1461 * (gregYear + 4800 + Math.floor((gregMonth - 14) / 12))) / 4) +
           Math.floor((367 * (gregMonth - 2 - 12 * Math.floor((gregMonth - 14) / 12))) / 12) -
           Math.floor((3 * Math.floor((gregYear + 4900 + Math.floor((gregMonth - 14) / 12)) / 100)) / 4) +
           gregDay - 32075;
           
  let l = jd - 1948440 + 10632;
  let n = Math.floor((l - 1) / 10631);
  l = l - 10631 * n + 354;
  
  let j = (Math.floor((10985 - l) / 5316)) * (Math.floor((50 * l) / 17719)) + 
          (Math.floor(l / 5670)) * (Math.floor((43 * l) / 15238));
          
  l = l - (Math.floor((30 - j) / 15)) * (Math.floor((17719 * j) / 50)) - 
      (Math.floor(j / 16)) * (Math.floor((15238 * j) / 43)) + 29;
      
  const hijriMonth = Math.floor((24 * l) / 709);
  const hijriDay = l - Math.floor((709 * hijriMonth) / 24);
  const hijriYear = 30 * n + j - 30;
  
  return { 
    year: hijriYear, 
    month: hijriMonth, 
    day: hijriDay, 
    formatted: `${toArabic(hijriYear)}/${toArabic(hijriMonth).padStart(2, '٠')}/${toArabic(hijriDay).padStart(2, '٠')}` 
  };
};

/**
 * Format date for display
 */
export const formatDate = (date: Date | string, options?: Intl.DateTimeFormatOptions): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options
  });
};

/**
 * Get relative time string (e.g., "2 days ago")
 */
export const getRelativeTime = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
};
