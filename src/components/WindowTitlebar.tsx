import {
  useEffect,
  useState,
  type ReactNode,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTranslation } from "react-i18next";
import { Copy, Minus, Square, X } from "lucide-react";
import { cn } from "cn";
import appIcon from "../../assets/icon.svg";
import { Button } from "@/components/ui/button";

type Props = {
  title: string;
  className?: string;
  children?: ReactNode;
  actions?: ReactNode;
  blocked?: boolean;
  closeDisabled?: boolean;
  onClose: () => void;
  onError: (error: unknown) => void;
};

export function WindowTitlebar({
  title,
  className,
  children,
  actions,
  blocked = false,
  closeDisabled = false,
  onClose,
  onError,
}: Props) {
  const { t } = useTranslation();
  const desktop = isTauri();
  const [maximized, setMaximized] = useState(false);
  const [focused, setFocused] = useState(true);
  useEffect(() => {
    if (!desktop) return;
    const window = getCurrentWindow();
    let cancelled = false;
    const cleanups: (() => void)[] = [];
    const report = (error: unknown) => {
      if (!cancelled) onError({ code: "windowControl", detail: String(error) });
    };
    const update = () =>
      void window
        .isMaximized()
        .then((value) => {
          if (!cancelled) setMaximized(value);
        })
        .catch(report);
    const keep = (unlisten: () => void) => {
      if (cancelled) unlisten();
      else cleanups.push(unlisten);
    };
    void window
      .onResized(update)
      .then((unlisten) => {
        keep(unlisten);
        update();
      })
      .catch(report);
    void window
      .onFocusChanged(({ payload }) => {
        if (!cancelled) setFocused(payload);
      })
      .then(keep)
      .catch(report);
    return () => {
      cancelled = true;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [desktop, onError]);
  const run = (action: () => Promise<unknown>) => {
    if (desktop)
      void action().catch((error) =>
        onError({ code: "windowControl", detail: String(error) }),
      );
  };
  const toggleMaximize = () =>
    run(async () => {
      const window = getCurrentWindow();
      await window.toggleMaximize();
      setMaximized(await window.isMaximized());
    });
  const onMouseDown = (event: MouseEvent) => {
    if (blocked || event.button !== 0) return;
    if (event.detail === 2) toggleMaximize();
    else run(() => getCurrentWindow().startDragging());
  };
  const onPointerDown = (event: PointerEvent) => {
    if (
      blocked ||
      !event.isPrimary ||
      event.button !== 0 ||
      event.pointerType === "mouse"
    )
      return;
    event.preventDefault();
    run(() => getCurrentWindow().startDragging());
  };
  const dragProps = { onMouseDown, onPointerDown };
  return (
    <header
      className={cn("window-titlebar", className)}
      data-focused={focused}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="titlebar-brand" {...dragProps}>
        <img src={appIcon} alt="" draggable={false} />
        <span className="titlebar-name">{title}</span>
      </div>
      {children}
      <div
        className="titlebar-drag-region"
        data-testid="titlebar-drag-region"
        {...dragProps}
      />
      {actions}
      {desktop && (
        <div
          className="window-controls"
          role="group"
          aria-label={t("windowControls")}
        >
          {desktop && (
            <>
              <Button
                variant="window"
                size="window"
                aria-label={t("minimize")}
                title={t("minimize")}
                disabled={blocked}
                onClick={() => run(() => getCurrentWindow().minimize())}
              >
                <Minus />
              </Button>
              {/* Remount without the snap target while a modal covers the titlebar.
                This makes the plugin remove its native hit area as well. */}
              <Button
                key={blocked ? "blocked" : "active"}
                id={blocked ? undefined : "window-maximize"}
                variant="window"
                size="window"
                aria-label={t(maximized ? "restoreWindow" : "maximize")}
                title={t(maximized ? "restoreWindow" : "maximize")}
                disabled={blocked}
                onClick={toggleMaximize}
              >
                {maximized ? <Copy /> : <Square />}
              </Button>
            </>
          )}
          <Button
            variant="window-close"
            size="window"
            aria-label={t("close")}
            title={t("close")}
            disabled={blocked || closeDisabled}
            onClick={onClose}
          >
            <X />
          </Button>
        </div>
      )}
    </header>
  );
}
