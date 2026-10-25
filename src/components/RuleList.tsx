import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  ChevronUp,
  ChevronDown,
  Copy,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "cn";
import { summarize, type RenameRule } from "@/lib/types";
type Props = {
  rules: RenameRule[];
  active: string | null;
  disabled: boolean;
  onSelect: (id: string) => void;
  onChange: (rules: RenameRule[]) => void;
};
function RuleItem({
  rule,
  index,
  ...props
}: Props & { rule: RenameRule; index: number }) {
  const { t } = useTranslation();
  const sort = useSortable({ id: rule.id, disabled: props.disabled });
  const move = (delta: number) =>
    props.onChange(arrayMove(props.rules, index, index + delta));
  return (
    <div
      ref={sort.setNodeRef}
      style={{
        transform: CSS.Transform.toString(sort.transform),
        transition: sort.transition,
      }}
      className={cn(
        "rule-item",
        props.active === rule.id && "is-active",
        !rule.enabled && "is-disabled",
        sort.isDragging && "is-dragging",
      )}
      data-testid="rule-item"
    >
      <div className="rule-item-heading">
        <button
          className="rule-select"
          disabled={props.disabled}
          onClick={() => props.onSelect(rule.id)}
        >
          <span className="rule-index">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="rule-name" title={t(rule.config.type)}>
            {t(rule.config.type)}
          </span>
        </button>
        <button
          className="rule-summary"
          title={summarize(rule, t)}
          disabled={props.disabled}
          onClick={() => props.onSelect(rule.id)}
        >
          {summarize(rule, t)}
        </button>
      </div>
      <div className="rule-item-footer">
        <div className="rule-actions">
          <Button
            variant="ghost"
            size="icon-compact"
            aria-label={t("drag")}
            disabled={props.disabled}
            {...sort.attributes}
            {...sort.listeners}
          >
            <GripVertical />
          </Button>
          <Button
            size="icon-compact"
            variant="ghost"
            disabled={props.disabled || index === 0}
            aria-label={t("up")}
            onClick={() => move(-1)}
          >
            <ChevronUp />
          </Button>
          <Button
            size="icon-compact"
            variant="ghost"
            disabled={props.disabled || index === props.rules.length - 1}
            aria-label={t("down")}
            onClick={() => move(1)}
          >
            <ChevronDown />
          </Button>
          <span className="flex-1" />
          <Button
            size="icon-compact"
            variant="ghost"
            disabled={props.disabled}
            aria-label={t("duplicate")}
            onClick={() => {
              const copy = {
                ...structuredClone(rule),
                id: crypto.randomUUID(),
              };
              props.onChange([
                ...props.rules.slice(0, index + 1),
                copy,
                ...props.rules.slice(index + 1),
              ]);
              props.onSelect(copy.id);
            }}
          >
            <Copy />
          </Button>
          <Button
            size="icon-compact"
            variant="ghost"
            disabled={props.disabled}
            aria-label={t("deleteRule")}
            onClick={() =>
              props.onChange(props.rules.filter((r) => r.id !== rule.id))
            }
          >
            <Trash2 />
          </Button>
          <Switch
            checked={rule.enabled}
            disabled={props.disabled}
            aria-label={t("enabled")}
            className="ml-1.5"
            onCheckedChange={(enabled) =>
              props.onChange(
                props.rules.map((r) =>
                  r.id === rule.id ? { ...r, enabled } : r,
                ),
              )
            }
          />
        </div>
      </div>
    </div>
  );
}
export function RuleList(props: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={({ active, over }) => {
        if (over && active.id !== over.id)
          props.onChange(
            arrayMove(
              props.rules,
              props.rules.findIndex((r) => r.id === active.id),
              props.rules.findIndex((r) => r.id === over.id),
            ),
          );
      }}
    >
      <SortableContext
        items={props.rules.map((r) => r.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="rule-list">
          {props.rules.map((rule, index) => (
            <RuleItem key={rule.id} rule={rule} index={index} {...props} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
