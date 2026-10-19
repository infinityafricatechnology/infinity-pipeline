import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { api } from "./api";

/**
 * Ouvre la fiche désignée dans l'adresse (ex. /affaires?affaire=8), pour les liens partagés et ceux
 * que donne Claude. Renvoie la fonction à appeler à la fermeture, qui retire le paramètre de l'adresse.
 */
export function useDeepLink<T>(param: string, path: (value: string) => string, open: (item: T) => void) {
  const [params, setParams] = useSearchParams();
  const value = params.get(param);

  useEffect(() => {
    if (!value) return;
    api
      .get<T | { results: T[] }>(path(value))
      .then((body) => {
        const item = body && typeof body === "object" && "results" in body ? body.results[0] : (body as T);
        if (item) open(item);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return () => {
    if (!value) return;
    const next = new URLSearchParams(params);
    next.delete(param);
    setParams(next, { replace: true });
  };
}
