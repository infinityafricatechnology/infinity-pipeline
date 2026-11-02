import { createContext, useContext } from "react";
import type { Me } from "./types";

/** Personne connectée, fournie par la garde de session une fois `/me` chargé. */
export const MeContext = createContext<Me | null>(null);

export function useMe(): Me {
  const me = useContext(MeContext);
  if (!me) throw new Error("useMe() hors de la garde de session");
  return me;
}
