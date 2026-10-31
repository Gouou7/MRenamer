import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
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
  FieldSet,
  FieldLegend,
  FieldDescription,
} from "@/components/ui/field";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import { Choice, Flag } from "@/components/RuleEditor";
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
                  variant="ghost"
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
                  popupClassName="settings-options"
                  onChange={(theme) =>
                    onChange({ theme: theme as Preferences["theme"] })
                  }
                />
                <Choice
                  label={t("language")}
                  value={preferences.language}
                  values={[
                    ["zh-CN", "简体中文"],
                    ["en", "English"],
                  ]}
                  popupClassName="settings-options"
                  onChange={(language) =>
                    onChange({ language: language as Preferences["language"] })
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
                  onChange={(contents) => onChange({ contents })}
                />
                <Flag
                  label={t("recursive")}
                  value={preferences.recursive}
                  disabled={!preferences.contents}
                  onChange={(recursive) => onChange({ recursive })}
                />
                <FieldDescription>{t("importHint")}</FieldDescription>
              </FieldGroup>
            </FieldSet>
            <Separator />
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
