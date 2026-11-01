import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, History, LoaderCircle } from "lucide-react";
import { appVersion } from "@/lib/version";
import { Button } from "@/components/ui/button";
import { WindowTitlebar } from "@/components/WindowTitlebar";
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
  modalOpen: boolean;
  onError: (error: unknown) => void;
  executeDisabled: boolean;
  undoDisabled: boolean;
  removeDisabled: boolean;
  clearDisabled: boolean;
  onAdd: (mode: "files" | "folders" | "contents") => void;
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
      <WindowTitlebar
        className="app-header"
        title="MRenamer"
        blocked={props.modalOpen || aboutOpen}
        closeDisabled={props.busy}
        onClose={props.onExit}
        onError={props.onError}
        actions={
          <div className="header-actions">
            <Button
              variant="default"
              size="compact"
              title={t("execute")}
              disabled={props.executeDisabled}
              onClick={props.onExecute}
            >
              {props.busy ? (
                <LoaderCircle
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : (
                <Check data-icon="inline-start" />
              )}
              {t("execute")}
            </Button>
            <Button
              variant="secondary"
              size="compact"
              onClick={props.onHistory}
              data-history-entry
            >
              <History data-icon="inline-start" />
              {t("history")}
            </Button>
          </div>
        }
      >
        <div className="header-left">
          <Menubar className="h-5 border-0 p-0" aria-label={t("mainMenu")}>
            <MenubarMenu>
              <MenubarTrigger>{t("fileMenu")}</MenubarTrigger>
              <MenubarContent>
                <MenubarGroup>
                  <MenubarItem
                    disabled={props.busy}
                    onClick={() => props.onAdd("files")}
                  >
                    {t("addFiles")}
                  </MenubarItem>
                  <MenubarItem
                    disabled={props.busy}
                    onClick={() => props.onAdd("folders")}
                  >
                    {t("addFolders")}
                  </MenubarItem>
                  <MenubarItem
                    disabled={props.busy}
                    onClick={() => props.onAdd("contents")}
                  >
                    {t("addFolderContents")}
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
              <MenubarTrigger data-settings-entry>
                {t("editMenu")}
              </MenubarTrigger>
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
      </WindowTitlebar>
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
