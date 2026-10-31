import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import catalog from "./variables.json";

export type VariableDefinition = (typeof catalog)[number];
export const variableCategories = [
  "date",
  "name",
  "parent",
  "fileTime",
] as const;
const VariablesContext = createContext<VariableDefinition[]>(catalog);

export function VariableCatalogProvider({
  children,
  onError,
}: {
  children: ReactNode;
  onError: (error: unknown) => void;
}) {
  const [variables, setVariables] = useState(catalog);
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    void invoke<VariableDefinition[]>("list_variables")
      .then((variables) => {
        if (!cancelled) setVariables(variables);
      })
      .catch((error) => {
        if (!cancelled) onError(error);
      });
    return () => {
      cancelled = true;
    };
  }, [onError]);
  return (
    <VariablesContext.Provider value={variables}>
      {children}
    </VariablesContext.Provider>
  );
}

export function useVariables() {
  return useContext(VariablesContext);
}
