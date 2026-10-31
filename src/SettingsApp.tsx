import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  FieldGroup,
  FieldSet,
  FieldLegend,
  FieldDescription,
} from "@/components/ui/field";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Choice, Flag } from "@/components/RuleEditor";
import { VariablesReference } from "@/components/VariablesReference";
import { VariableCatalogProvider } from "@/lib/variables";
import { usePreferences, type Preferences } from "@/lib/preferences";
import { useSystemAccent } from "@/lib/use-system-accent";
import type { AppError } from "@/lib/types";

export default function SettingsApp() {
  const { t } = useTranslation();
  const [error, setError] = useState<AppError | null>(null);
  const report = useCallback(
    (error: unknown) =>
      setError(
        typeof error === "object" && error !== null && "code" in error
          ? (error as AppError)
          : { code: "internal", detail: String(error) },
      ),
    [],
  );
  const { preferences, updatePreferences } = usePreferences(report);
  useSystemAccent(isTauri());
  const update = (patch: Partial<Preferences>) => {
    setError(null);
    updatePreferences(patch);
  };
  const close = useCallback(() => {
    if (isTauri()) void getCurrentWindow().close().catch(report);
    else window.close();
  }, [report]);
  useEffect(() => {
    const title = `${t("settings")} - MRenamer`;
    document.title = title;
    if (isTauri()) void getCurrentWindow().setTitle(title).catch(report);
  }, [t, report]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !document.querySelector('[role="listbox"], [role="menu"]')
      )
        close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);
  return (
    <VariableCatalogProvider onError={report}>
      <main className="settings-window">
        <header className="settings-header">
          <h1>{t("settings")}</h1>
          <Button variant="ghost" size="compact" onClick={close}>
            {t("close")}
          </Button>
        </header>
        {error && (
          <Alert variant="destructive">
            <AlertDescription role="alert">
              {t(`errors.${error.code}`, {
                defaultValue: t("errors.internal"),
              })}
            </AlertDescription>
          </Alert>
        )}
        <div className="settings-content">
          <FieldGroup>
            <FieldSet>
              <FieldLegend variant="label">{t("appearance")}</FieldLegend>
              <FieldGroup>
                <Choice
                  label={t("theme")}
                  value={preferences.theme}
                  values={["system", "light", "dark"].map((value) => [
                    value,
                    t(value),
                  ])}
                  onChange={(theme) =>
                    update({ theme: theme as Preferences["theme"] })
                  }
                />
                <Choice
                  label={t("language")}
                  value={preferences.language}
                  values={[
                    ["zh-CN", "简体中文"],
                    ["en", "English"],
                  ]}
                  onChange={(language) =>
                    update({ language: language as Preferences["language"] })
                  }
                />
              </FieldGroup>
            </FieldSet>
            <Separator />
            <FieldSet>
              <FieldLegend variant="label">{t("importOptions")}</FieldLegend>
              <FieldDescription>{t("futureImports")}</FieldDescription>
              <FieldGroup>
                <Flag
                  label={t("contents")}
                  value={preferences.contents}
                  onChange={(contents) => update({ contents })}
                />
                <Flag
                  label={t("recursive")}
                  value={preferences.recursive}
                  disabled={!preferences.contents}
                  onChange={(recursive) => update({ recursive })}
                />
                <FieldDescription>{t("importHint")}</FieldDescription>
              </FieldGroup>
            </FieldSet>
            <Separator />
            <Collapsible defaultOpen={false}>
              <h2 className="settings-section-heading">
                <CollapsibleTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="sm"
                      className="settings-variables-trigger"
                    />
                  }
                >
                  <ChevronRight data-icon="inline-start" />
                  {t("availableVariables")}
                </CollapsibleTrigger>
              </h2>
              <CollapsibleContent className="settings-reference-content">
                <VariablesReference />
              </CollapsibleContent>
            </Collapsible>
          </FieldGroup>
        </div>
      </main>
    </VariableCatalogProvider>
  );
}
