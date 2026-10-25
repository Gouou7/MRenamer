export type Position = {
  mode: string;
  index: number;
  fromEnd: boolean;
  marker: string;
  occurrence: number;
};
export type Selection = {
  mode: string;
  index: number;
  length: number;
  fromEnd: boolean;
  marker: string;
  right: string;
  occurrence: number;
  include: boolean;
};
export type RuleConfig =
  | {
      type: "add";
      text: string;
      pad: boolean;
      width: number;
      position: Position;
    }
  | {
      type: "replace";
      find: string;
      replacement: string;
      regex: boolean;
      sensitive: boolean;
      occurrence: number;
    }
  | {
      type: "remove";
      mode: string;
      keep: boolean;
      selection: Selection;
      text: string;
      category: string;
    }
  | {
      type: "number";
      start: number;
      step: number;
      width: number;
      fill: string;
      perDirectory: boolean;
      position: Position;
    }
  | { type: "move"; selection: Selection; distance: number; left: boolean }
  | { type: "case"; mode: string; delimiters: string };
export type RuleType = RuleConfig["type"];
export type RenameRule = {
  id: string;
  enabled: boolean;
  scope: string;
  config: RuleConfig;
};
export type FileEntry = {
  id: string;
  path: string;
  name: string;
  kind: string;
  fingerprint: unknown;
  error: string | null;
};
export type PreviewRow = {
  id: string;
  originalPath: string;
  targetPath: string;
  originalName: string;
  newName: string;
  kind: string;
  selected: boolean;
  status: string;
  error: string | null;
};
export type RenamePlan = {
  id: string;
  revision: number;
  rows: PreviewRow[];
  changes: number;
  conflicts: number;
};
export type HistoryEntry = {
  id: string;
  created: number;
  status: string;
  count: number;
  detail: string;
  pendingPaths: string[];
};
export type Progress = { phase: string; done: number; total: number };
export const ruleTypes: RuleType[] = [
  "add",
  "replace",
  "remove",
  "number",
  "move",
  "case",
];
export const defaultPosition = (): Position => ({
  mode: "suffix",
  index: 1,
  fromEnd: false,
  marker: "",
  occurrence: 1,
});
export const defaultSelection = (): Selection => ({
  mode: "range",
  index: 1,
  length: 1,
  fromEnd: false,
  marker: "",
  right: "",
  occurrence: 1,
  include: false,
});
export function createRule(type: RuleType): RenameRule {
  const configs: Record<RuleType, RuleConfig> = {
    add: {
      type: "add",
      text: "",
      pad: false,
      width: 8,
      position: defaultPosition(),
    },
    replace: {
      type: "replace",
      find: "",
      replacement: "",
      regex: false,
      sensitive: true,
      occurrence: 0,
    },
    remove: {
      type: "remove",
      mode: "trim",
      keep: false,
      selection: defaultSelection(),
      text: "",
      category: "digits",
    },
    number: {
      type: "number",
      start: 1,
      step: 1,
      width: 1,
      fill: "0",
      perDirectory: false,
      position: { ...defaultPosition(), mode: "prefix" },
    },
    move: {
      type: "move",
      selection: defaultSelection(),
      distance: 1,
      left: false,
    },
    case: { type: "case", mode: "upper", delimiters: " _-." },
  };
  return {
    id: crypto.randomUUID(),
    enabled: true,
    scope: "stem",
    config: configs[type],
  };
}
export function summarize(
  rule: RenameRule,
  tr: (key: string) => string,
): string {
  const c = rule.config;
  switch (c.type) {
    case "add":
      return c.text
        ? `${tr(c.pad ? "pad" : "insert")} ${c.text}`
        : tr("notConfigured");
    case "replace":
      return c.find
        ? `${c.find} → ${c.replacement || tr("emptyText")}`
        : tr("notConfigured");
    case "remove":
      return tr(c.mode === "selection" ? (c.keep ? "keep" : "delete") : c.mode);
    case "number":
      return `${tr("start")} ${c.start} · ${tr("width")} ${c.width}`;
    case "move":
      return `${tr(c.left ? "left" : "right")} ${c.distance}`;
    case "case":
      return tr(c.mode);
  }
}
