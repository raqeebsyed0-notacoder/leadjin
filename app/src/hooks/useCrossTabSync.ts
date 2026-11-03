import { useEffect } from 'react';

export function useCrossTabSync<T>(key: string, callback: (newValue: T) => void) {
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === key && e.newValue !== null) {
        try {
          const parsed = JSON.parse(e.newValue);
          callback(parsed);
        } catch {
          callback(e.newValue as T);
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [key, callback]);
}
