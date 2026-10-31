import { useId, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from "@/components/ui/field";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from "@/components/ui/context-menu";
import { variableCategories, useVariables } from "@/lib/variables";
import { readClipboardText, writeClipboardText } from "@/lib/clipboard";

export function TemplateField({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const variables = useVariables();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const latestOnChange = useRef(onChange);
  useLayoutEffect(() => {
    latestOnChange.current = onChange;
  }, [onChange]);
  const selection = useRef({ start: 0, end: 0, value });
  const [selected, setSelected] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const captureSelection = () => {
    const element = input.current;
    if (!element) return;
    selection.current = {
      start: element.selectionStart ?? 0,
      end: element.selectionEnd ?? 0,
      value: element.value,
    };
    setSelected(selection.current.start !== selection.current.end);
  };
  const restoreSelection = (start: number, end = start) => {
    const element = input.current;
    requestAnimationFrame(() => {
      if (element !== input.current || !element || element.matches(":disabled"))
        return;
      element.focus({ preventScroll: true });
      element.setSelectionRange(start, end);
    });
  };
  const replaceSelection = (text: string) => {
    const { start, end, value: previous } = selection.current;
    latestOnChange.current(
      previous.slice(0, start) + text + previous.slice(end),
    );
    setError("");
    restoreSelection(start + text.length);
  };
  const editClipboard = async (action: "copy" | "cut" | "paste") => {
    const saved = { ...selection.current };
    const element = input.current;
    setPending(true);
    setError("");
    try {
      let text = "";
      if (action === "paste") text = await readClipboardText();
      else await writeClipboardText(saved.value.slice(saved.start, saved.end));
      if (element !== input.current || !element || element.matches(":disabled"))
        return;
      if (element.value !== saved.value) {
        setError("clipboardChanged");
        return;
      }
      if (action === "copy") restoreSelection(saved.start, saved.end);
      else {
        selection.current = saved;
        // Match single-line input paste behavior rather than inserting hidden newlines.
        replaceSelection(text.replace(/[\r\n]/g, ""));
      }
    } catch {
      if (element === input.current) {
        setError("clipboardFailed");
        restoreSelection(saved.start, saved.end);
      }
    } finally {
      setPending(false);
    }
  };
  return (
    <Field data-invalid={!!error} data-disabled={disabled}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <ContextMenu disabled={disabled || pending}>
        <ContextMenuTrigger onContextMenuCapture={captureSelection}>
          <Input
            id={id}
            ref={input}
            value={value}
            disabled={disabled}
            readOnly={pending}
            aria-invalid={!!error}
            aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}
            onChange={(event) => {
              setError("");
              onChange(event.target.value);
            }}
            onKeyDown={(event) => {
              if (
                event.key === "ContextMenu" ||
                (event.shiftKey && event.key === "F10")
              ) {
                event.preventDefault();
                const bounds = event.currentTarget.getBoundingClientRect();
                event.currentTarget.dispatchEvent(
                  new MouseEvent("contextmenu", {
                    bubbles: true,
                    cancelable: true,
                    clientX: bounds.left + 8,
                    clientY: bounds.bottom,
                  }),
                );
              }
            }}
          />
        </ContextMenuTrigger>
        <ContextMenuContent finalFocus={input}>
          <ContextMenuGroup>
            <ContextMenuItem
              disabled={!selected}
              onClick={() => void editClipboard("cut")}
            >
              {t("textCut")}
            </ContextMenuItem>
            <ContextMenuItem
              disabled={!selected}
              onClick={() => void editClipboard("copy")}
            >
              {t("textCopy")}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => void editClipboard("paste")}>
              {t("textPaste")}
            </ContextMenuItem>
            <ContextMenuItem
              disabled={!value}
              onClick={() => restoreSelection(0, value.length)}
            >
              {t("textSelectAll")}
            </ContextMenuItem>
          </ContextMenuGroup>
          <ContextMenuSeparator />
          <ContextMenuGroup>
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                {t("insertVariable")}
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="variable-menu">
                {variableCategories.map((category) => (
                  <ContextMenuGroup key={category}>
                    <ContextMenuLabel>
                      {t(`variableCategories.${category}`)}
                    </ContextMenuLabel>
                    {variables
                      .filter((variable) => variable.category === category)
                      .map((variable) => (
                        <ContextMenuItem
                          key={variable.name}
                          label={t(variable.labelKey)}
                          onClick={() => replaceSelection(`<${variable.name}>`)}
                        >
                          <span>{t(variable.labelKey)}</span>
                          <code className="ml-auto">{`<${variable.name}>`}</code>
                        </ContextMenuItem>
                      ))}
                  </ContextMenuGroup>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
          </ContextMenuGroup>
        </ContextMenuContent>
      </ContextMenu>
      <FieldDescription id={`${id}-help`}>
        {t("templateInputHelp")}
      </FieldDescription>
      {error && <FieldError id={`${id}-error`}>{t(error)}</FieldError>}
    </Field>
  );
}
