import { useId } from "react";
import { useTranslation } from "react-i18next";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
  FieldSet,
  FieldLegend,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { Position, Selection, RenameRule, RuleConfig } from "@/lib/types";

export function Choice({
  label,
  value,
  values,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  values: [string, string][];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        items={values.map(([value, label]) => ({ value, label }))}
        value={value}
        onValueChange={(v) => v !== null && onChange(v)}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {values.map(([v, l]) => (
              <SelectItem key={v} value={v}>
                {l}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}
function RuleChoice({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: [string, string][];
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <FieldSet className="rule-choice">
      <FieldLegend id={`${id}-label`} variant="label">
        {label}
      </FieldLegend>
      <RadioGroup
        aria-labelledby={`${id}-label`}
        value={value}
        onValueChange={(value) => onChange(String(value))}
        className="rule-options"
      >
        {values.map(([option, text]) => (
          <Field key={option} orientation="horizontal">
            <RadioGroupItem id={`${id}-${option}`} value={option} />
            <FieldLabel htmlFor={`${id}-${option}`}>{text}</FieldLabel>
          </Field>
        ))}
      </RadioGroup>
    </FieldSet>
  );
}
export function TextField({
  label,
  value,
  onChange,
  number = false,
  min = 0,
  help,
  disabled = false,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  number?: boolean;
  min?: number;
  help?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const invalid =
    number && (!Number.isSafeInteger(Number(value)) || Number(value) < min);
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        value={value}
        type={number ? "number" : "text"}
        min={number ? min : undefined}
        aria-invalid={invalid}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
      {help && <FieldDescription>{help}</FieldDescription>}
    </Field>
  );
}
export function Flag({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <Field orientation="horizontal">
      <FieldLabel htmlFor={id} className="flex-1">
        {label}
      </FieldLabel>
      <Switch
        id={id}
        checked={value}
        onCheckedChange={onChange}
        disabled={disabled}
      />
    </Field>
  );
}
function PositionEditor({
  value,
  onChange,
}: {
  value: Position;
  onChange: (v: Position) => void;
}) {
  const { t } = useTranslation();
  const patch = (p: Partial<Position>) => onChange({ ...value, ...p });
  return (
    <FieldGroup>
      <RuleChoice
        label={t("position")}
        value={value.mode}
        values={["prefix", "suffix", "index", "before", "after"].map((v) => [
          v,
          t(v),
        ])}
        onChange={(mode) => patch({ mode })}
      />
      {value.mode === "index" && (
        <>
          <TextField
            label={t("startPosition")}
            value={value.index}
            number
            min={1}
            onChange={(v) => patch({ index: Number(v) })}
          />
          <Flag
            label={t("fromEnd")}
            value={value.fromEnd}
            onChange={(fromEnd) => patch({ fromEnd })}
          />
        </>
      )}
      {["before", "after"].includes(value.mode) && (
        <>
          <TextField
            label={t("marker")}
            value={value.marker}
            onChange={(marker) => patch({ marker })}
          />
          <TextField
            label={t("occurrence")}
            value={value.occurrence}
            number
            min={1}
            onChange={(v) => patch({ occurrence: Number(v) })}
          />
        </>
      )}
    </FieldGroup>
  );
}
function SelectionEditor({
  value,
  onChange,
  moving = false,
}: {
  value: Selection;
  onChange: (v: Selection) => void;
  moving?: boolean;
}) {
  const { t } = useTranslation();
  const patch = (p: Partial<Selection>) => onChange({ ...value, ...p });
  const modes = moving
    ? ["range", "literal", "between"]
    : ["range", "literal", "before", "after", "between"];
  return (
    <FieldGroup>
      <RuleChoice
        label={t("selection")}
        value={value.mode}
        values={modes.map((v) => [v, t(v === "range" ? "index" : v)])}
        onChange={(mode) => patch({ mode })}
      />
      {value.mode === "range" ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label={t("startPosition")}
              value={value.index}
              number
              min={1}
              onChange={(v) => patch({ index: Number(v) })}
            />
            <TextField
              label={t("length")}
              value={value.length}
              number
              min={1}
              onChange={(v) => patch({ length: Number(v) })}
            />
          </div>
          <Flag
            label={t("fromEnd")}
            value={value.fromEnd}
            onChange={(fromEnd) => patch({ fromEnd })}
          />
        </>
      ) : (
        <>
          <TextField
            label={t(value.mode === "between" ? "leftMarker" : "marker")}
            value={value.marker}
            onChange={(marker) => patch({ marker })}
          />
          {value.mode === "between" && (
            <TextField
              label={t("rightMarker")}
              value={value.right}
              onChange={(right) => patch({ right })}
            />
          )}
          <TextField
            label={t("occurrence")}
            value={value.occurrence}
            number
            min={1}
            onChange={(v) => patch({ occurrence: Number(v) })}
          />
          {value.mode !== "literal" && (
            <Flag
              label={t("include")}
              value={value.include}
              onChange={(include) => patch({ include })}
            />
          )}
        </>
      )}
    </FieldGroup>
  );
}
export function RuleEditor({
  rule,
  onChange,
  disabled,
}: {
  rule: RenameRule;
  onChange: (rule: RenameRule) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const c = rule.config;
  const patch = (p: Record<string, unknown>) =>
    onChange({ ...rule, config: { ...c, ...p } as RuleConfig });
  return (
    <fieldset inert={disabled} disabled={disabled} className="editor-fields">
      <FieldGroup>
        <RuleChoice
          label={t("scope")}
          value={rule.scope}
          values={["stem", "extension", "full"].map((v) => [v, t(v)])}
          onChange={(scope) => onChange({ ...rule, scope })}
        />
        {c.type === "add" && (
          <>
            <RuleChoice
              label={t("mode")}
              value={c.pad ? "pad" : "insert"}
              values={["insert", "pad"].map((v) => [v, t(v)])}
              onChange={(v) => patch({ pad: v === "pad" })}
            />
            <TextField
              label={t("text")}
              value={c.text}
              onChange={(text) => patch({ text })}
            />
            {c.pad && (
              <TextField
                label={t("targetLength")}
                value={c.width}
                number
                min={1}
                onChange={(v) => patch({ width: Number(v) })}
              />
            )}
            <PositionEditor
              value={c.position}
              onChange={(position) => patch({ position })}
            />
          </>
        )}
        {c.type === "replace" && (
          <>
            <TextField
              label={t("find")}
              value={c.find}
              onChange={(find) => patch({ find })}
            />
            <TextField
              label={t("replacement")}
              value={c.replacement}
              onChange={(replacement) => patch({ replacement })}
            />
            <Flag
              label={t("regex")}
              value={c.regex}
              onChange={(regex) => patch({ regex })}
            />
            <Flag
              label={t("sensitive")}
              value={c.sensitive}
              onChange={(sensitive) => patch({ sensitive })}
            />
            <TextField
              label={t("replaceOccurrence")}
              value={c.occurrence}
              number
              help={t("occurrenceHelp")}
              onChange={(v) => patch({ occurrence: Number(v) })}
            />
            {c.regex && <p className="help-text">{t("regexHelp")}</p>}
          </>
        )}
        {c.type === "remove" && (
          <>
            <RuleChoice
              label={t("mode")}
              value={c.mode}
              values={["trim", "clear", "selection", "text", "category"].map(
                (v) => [v, t(v === "clear" ? "clearName" : v)],
              )}
              onChange={(mode) => patch({ mode })}
            />
            {c.mode === "selection" && (
              <>
                <RuleChoice
                  label={t("mode")}
                  value={c.keep ? "keep" : "delete"}
                  values={["delete", "keep"].map((v) => [v, t(v)])}
                  onChange={(v) => patch({ keep: v === "keep" })}
                />
                <SelectionEditor
                  value={c.selection}
                  onChange={(selection) => patch({ selection })}
                />
              </>
            )}
            {c.mode === "text" && (
              <TextField
                label={t("text")}
                value={c.text}
                onChange={(text) => patch({ text })}
              />
            )}{" "}
            {c.mode === "category" && (
              <RuleChoice
                label={t("category")}
                value={c.category}
                values={["digits", "letters", "whitespace", "punctuation"].map(
                  (v) => [v, t(v)],
                )}
                onChange={(category) => patch({ category })}
              />
            )}
          </>
        )}
        {c.type === "number" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label={t("start")}
                value={c.start}
                number
                min={Number.MIN_SAFE_INTEGER}
                onChange={(v) => patch({ start: Number(v) })}
              />
              <TextField
                label={t("step")}
                value={c.step}
                number
                min={1}
                onChange={(v) => patch({ step: Number(v) })}
              />
              <TextField
                label={t("width")}
                value={c.width}
                number
                min={1}
                onChange={(v) => patch({ width: Number(v) })}
              />
              <TextField
                label={t("fill")}
                value={c.fill}
                onChange={(fill) => patch({ fill })}
              />
            </div>
            <Flag
              label={t("perDirectory")}
              value={c.perDirectory}
              onChange={(perDirectory) => patch({ perDirectory })}
            />
            <PositionEditor
              value={c.position}
              onChange={(position) => patch({ position })}
            />
          </>
        )}
        {c.type === "move" && (
          <>
            <SelectionEditor
              value={c.selection}
              onChange={(selection) => patch({ selection })}
              moving
            />
            <RuleChoice
              label={t("direction")}
              value={c.left ? "left" : "right"}
              values={["left", "right"].map((v) => [v, t(v)])}
              onChange={(v) => patch({ left: v === "left" })}
            />
            <TextField
              label={t("distance")}
              value={c.distance}
              number
              onChange={(v) => patch({ distance: Number(v) })}
            />
          </>
        )}
        {c.type === "case" && (
          <>
            <RuleChoice
              label={t("mode")}
              value={c.mode}
              values={["upper", "lower", "title", "sentence", "toggle"].map(
                (v) => [v, t(v)],
              )}
              onChange={(mode) => patch({ mode })}
            />
            {c.mode === "title" && (
              <TextField
                label={t("delimiters")}
                value={c.delimiters}
                onChange={(delimiters) => patch({ delimiters })}
              />
            )}
          </>
        )}
      </FieldGroup>
    </fieldset>
  );
}
