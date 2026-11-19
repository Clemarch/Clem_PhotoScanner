import { useEffect, useState } from 'react';

/** Vrai dès que la page a défilé sous le grand titre : la barre compacte du haut apparaît (comme dans les apps d'Apple). */
export function useScrolled(threshold = 56): boolean {
  const [scrolled, setScrolled] = useState(() => typeof window !== 'undefined' && window.scrollY > threshold);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);
  return scrolled;
}
