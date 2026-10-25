import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Info, LoaderCircle, TriangleAlert } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Progress as ProgressBar } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import type { Progress } from "@/lib/types";

type Props = {
  total: number;
  changes: number;
  conflicts: number;
  busy: boolean;
  pending: boolean;
  desktop: boolean;
  message: string;
  progress: Progress | null;
  error: { message: string; detail: string } | null;
  recovery: boolean;
  onRecover: () => void;
};
export function StatusBar(props: Props) {
  const { t } = useTranslation();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const text =
    props.error?.message ||
    (props.recovery
      ? t("recovery")
      : props.busy
        ? t(props.progress?.phase === "scan" ? "scan" : "busy")
        : props.pending
          ? t("refreshing")
          : props.message || t(props.desktop ? "ready" : "browserOnly"));
  const Icon =
    props.error || props.recovery
      ? TriangleAlert
      : props.busy || props.pending
        ? LoaderCircle
        : props.desktop
          ? Check
          : Info;
  return (
    <>
      <footer className="status-bar">
        <div className="status-counts">
          <span>
            {t("total")} <b>{props.total}</b>
          </span>
          <span>
            {t("changes")} <b>{props.changes}</b>
          </span>
          <span>
            {t("conflicts")} <b>{props.conflicts}</b>
          </span>
        </div>
        <div
          className={cn(
            "status-message",
            props.error && "status-error",
            !props.error && props.recovery && "status-warning",
          )}
          role="status"
          aria-live="polite"
        >
          <Icon
            className={cn(
              "status-icon",
              (props.busy || props.pending) &&
                !props.error &&
                !props.recovery &&
                "animate-spin",
            )}
          />
          <span className="status-text" title={text}>
            {text}
          </span>
          {props.busy && !!props.progress?.total && (
            <span className="status-fraction">
              {props.progress.done}/{props.progress.total}
            </span>
          )}
          {props.recovery && (
            <Button
              size="xs"
              variant="outline"
              disabled={props.busy}
              onClick={props.onRecover}
            >
              {t("recover")}
            </Button>
          )}
          {props.error?.detail && (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => setDetailsOpen(true)}
            >
              {t("showDetails")}
            </Button>
          )}
        </div>
        <div className="status-tail">
          {props.busy && (
            <ProgressBar
              value={
                props.progress?.total
                  ? Math.min(
                      100,
                      (100 * props.progress.done) / props.progress.total,
                    )
                  : null
              }
              aria-label={t("busy")}
            />
          )}
        </div>
      </footer>
      <Dialog
        open={detailsOpen && !!props.error?.detail}
        onOpenChange={setDetailsOpen}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("showDetails")}</DialogTitle>
            <DialogDescription>{props.error?.message}</DialogDescription>
          </DialogHeader>
          <pre className="notification-details">{props.error?.detail}</pre>
          <DialogClose render={<Button variant="outline" />}>
            {t("close")}
          </DialogClose>
        </DialogContent>
      </Dialog>
    </>
  );
}
