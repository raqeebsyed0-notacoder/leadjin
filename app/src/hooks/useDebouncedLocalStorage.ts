import { useEffect } from 'react';

export function useDebouncedLocalStorage<T>(key: string, value: T, delay = 300) {
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
      } catch (e) {
        console.error(`Failed to write to localStorage key "${key}":`, e);
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [key, value, delay]);
}
