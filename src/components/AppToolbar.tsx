import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, History, LoaderCircle } from "lucide-react";
import { appVersion } from "@/lib/version";
import { Button } from "@/components/ui/button";
import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarGroup,
  MenubarItem,
  MenubarSeparator,
} from "@/components/ui/menubar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";

type Props = {
  busy: boolean;
  desktop: boolean;
  executeDisabled: boolean;
  undoDisabled: boolean;
  removeDisabled: boolean;
  clearDisabled: boolean;
  onAdd: (directory: boolean) => void;
  onExecute: () => void;
  onUndo: () => void;
  onRemove: () => void;
  onClear: () => void;
  onSettings: () => void;
  onHistory: () => void;
  onExit: () => void;
};

export function AppToolbar(props: Props) {
  const { t } = useTranslation();
  const [aboutOpen, setAboutOpen] = useState(false);
  return (
    <>
      <header className="app-header">
        <div className="header-left">
          <Menubar className="h-5 border-0 p-0" aria-label={t("mainMenu")}>
            <MenubarMenu>
              <MenubarTrigger>{t("fileMenu")}</MenubarTrigger>
              <MenubarContent>
                <MenubarGroup>
                  <MenubarItem
                    disabled={props.busy}
                    onClick={() => props.onAdd(false)}
                  >
                    {t("addFiles")}
                  </MenubarItem>
                  <MenubarItem
                    disabled={props.busy}
                    onClick={() => props.onAdd(true)}
                  >
                    {t("addFolders")}
                  </MenubarItem>
                </MenubarGroup>
                <MenubarSeparator />
                <MenubarGroup>
                  <MenubarItem
                    disabled={props.busy || !props.desktop}
                    onClick={props.onExit}
                  >
                    {t("exit")}
                  </MenubarItem>
                </MenubarGroup>
              </MenubarContent>
            </MenubarMenu>
            <MenubarMenu>
              <MenubarTrigger>{t("editMenu")}</MenubarTrigger>
              <MenubarContent>
                <MenubarGroup>
                  <MenubarItem
                    disabled={props.undoDisabled}
                    onClick={props.onUndo}
                  >
                    {t("undo")}
                  </MenubarItem>
                  <MenubarItem
                    disabled={props.removeDisabled}
                    onClick={props.onRemove}
                  >
                    {t("removeSelected")}
                  </MenubarItem>
                  <MenubarItem
                    disabled={props.clearDisabled}
                    onClick={props.onClear}
                  >
                    {t("clear")}
                  </MenubarItem>
                </MenubarGroup>
                <MenubarSeparator />
                <MenubarGroup>
                  <MenubarItem onClick={props.onSettings}>
                    {t("settings")}
                  </MenubarItem>
                </MenubarGroup>
              </MenubarContent>
            </MenubarMenu>
            <MenubarMenu>
              <MenubarTrigger>{t("aboutMenu")}</MenubarTrigger>
              <MenubarContent>
                <MenubarGroup>
                  <MenubarItem onClick={() => setAboutOpen(true)}>
                    {t("aboutApp")}
                  </MenubarItem>
                </MenubarGroup>
              </MenubarContent>
            </MenubarMenu>
          </Menubar>
        </div>
        <div className="header-actions">
          <Button
            size="compact"
            disabled={props.executeDisabled}
            onClick={props.onExecute}
          >
            {props.busy ? (
              <LoaderCircle className="animate-spin" data-icon="inline-start" />
            ) : (
              <ArrowRight data-icon="inline-start" />
            )}
            {t("execute")}
          </Button>
          <Button variant="ghost" size="compact" onClick={props.onHistory}>
            <History data-icon="inline-start" />
            {t("history")}
          </Button>
        </div>
      </header>
      <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("aboutApp")}</DialogTitle>
            <DialogDescription>{t("aboutDescription")}</DialogDescription>
          </DialogHeader>
          <p>{t("version", { version: appVersion })}</p>
          <DialogClose render={<Button variant="outline" />}>
            {t("close")}
          </DialogClose>
        </DialogContent>
      </Dialog>
    </>
  );
}
