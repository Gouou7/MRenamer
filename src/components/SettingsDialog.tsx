import { useTranslation } from "react-i18next";
import { Braces, FolderPlus, Settings2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import {
  FieldGroup,
  Field,
  FieldLabel,
  FieldSet,
  FieldLegend,
} from "@/components/ui/field";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { VariablesReference } from "@/components/VariablesReference";
import type { Preferences } from "@/lib/preferences";
import type { AppError } from "@/lib/types";
import { Alert, AlertDescription } from "@/components/ui/alert";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preferences: Preferences;
  onChange: (patch: Partial<Preferences>) => void;
  error: AppError | null;
};

export function SettingsDialog({
  open,
  onOpenChange,
  preferences,
  onChange,
  error,
}: Props) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="settings-dialog"
        showCloseButton={false}
        finalFocus={() =>
          document.querySelector<HTMLButtonElement>("[data-settings-entry]")
        }
      >
        <DialogHeader className="settings-dialog-header">
          <div className="flex items-center justify-between">
            <DialogTitle>{t("settings")}</DialogTitle>
            <DialogClose
              render={
                <Button
                  variant="secondary"
                  size="icon-compact"
                  aria-label={t("close")}
                  title={t("close")}
                />
              }
            >
              <X />
            </DialogClose>
          </div>
          <DialogDescription className="sr-only">
            {t("settingsDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="settings-content">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>
                {t(`errors.${error.code}`, {
                  defaultValue: t("errors.internal"),
                })}
              </AlertDescription>
            </Alert>
          )}
          <FieldGroup>
            <FieldSet className="settings-section">
              <FieldLegend variant="label">
                <span className="flex items-center gap-2">
                  <Settings2 className="size-4" aria-hidden="true" />
                  {t("general")}
                </span>
              </FieldLegend>
              <FieldGroup className="settings-section-body">
                <Field>
                  <FieldLabel htmlFor="settings-appearance">
                    {t("appearance")}
                  </FieldLabel>
                  <NativeSelect
                    id="settings-appearance"
                    value={preferences.theme}
                    onChange={(event) =>
                      onChange({
                        theme: event.target.value as Preferences["theme"],
                      })
                    }
                  >
                    {["dark", "light", "system"].map((value) => (
                      <NativeSelectOption key={value} value={value}>
                        {t(value)}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Separator />
                <Field>
                  <FieldLabel htmlFor="settings-language">
                    {t("language")}
                  </FieldLabel>
                  <NativeSelect
                    id="settings-language"
                    value={preferences.language}
                    onChange={(event) =>
                      onChange({
                        language: event.target.value as Preferences["language"],
                      })
                    }
                  >
                    <NativeSelectOption value="zh-CN">
                      中文简体
                    </NativeSelectOption>
                    <NativeSelectOption value="en">English</NativeSelectOption>
                    <NativeSelectOption value="system">
                      {t("system")}
                    </NativeSelectOption>
                  </NativeSelect>
                </Field>
              </FieldGroup>
            </FieldSet>
            <FieldSet className="settings-section">
              <FieldLegend variant="label">
                <span className="flex items-center gap-2">
                  <FolderPlus className="size-4" aria-hidden="true" />
                  {t("addPreferences")}
                </span>
              </FieldLegend>
              <FieldGroup className="settings-section-body">
                <FieldSet>
                  <FieldLegend
                    variant="label"
                    className="settings-preference-label"
                  >
                    {t("folderContentsPreferences")}
                  </FieldLegend>
                  <FieldGroup>
                    {(
                      ["includeFiles", "includeFolders", "recursive"] as const
                    ).map((key) => (
                      <Field key={key} orientation="horizontal">
                        <Checkbox
                          id={`settings-${key}`}
                          checked={preferences[key]}
                          onCheckedChange={(checked) =>
                            onChange({ [key]: checked })
                          }
                        />
                        <FieldLabel htmlFor={`settings-${key}`}>
                          {t(key)}
                        </FieldLabel>
                      </Field>
                    ))}
                  </FieldGroup>
                </FieldSet>
              </FieldGroup>
            </FieldSet>
            <FieldSet className="settings-section">
              <FieldLegend variant="label">
                <span className="flex items-center gap-2">
                  <Braces className="size-4" aria-hidden="true" />
                  {t("variables")}
                </span>
              </FieldLegend>
              <FieldGroup className="settings-section-body">
                <Accordion defaultValue={[]}>
                  <AccordionItem value="variables">
                    <AccordionTrigger className="settings-variables-trigger">
                      {t("availableVariables")}
                    </AccordionTrigger>
                    <AccordionContent>
                      <VariablesReference />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </FieldGroup>
            </FieldSet>
          </FieldGroup>
        </div>
      </DialogContent>
    </Dialog>
  );
}
