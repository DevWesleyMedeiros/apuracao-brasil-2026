import * as React from "react";

const MOBILE_BREAKPOINT = 768;

/**
 * @description Um hook que retorna um valor booleano indicando se o tamanho atual da tela é considerado móvel com base em um ponto de interrupção (*breakpoint*) predefinido.
 * @returns {boolean} Verdadeiro se o tamanho atual da tela for considerado móvel; caso contrário, falso.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(
    undefined,
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}
