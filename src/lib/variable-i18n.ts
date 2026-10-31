export const variableZh = {
  insertVariable: "插入变量",
  availableVariables: "可用变量",
  templateInputHelp: "可输入<Date>等变量，或右键插入变量",
  variablesHelp:
    "适用于添加与补齐的内容和替换内容，变量名不区分大小写。日期时间按本地时区在每次预览时统一取值，执行沿用预览值。<<和>>表示字面量尖括号。目录层数不足或文件时间不可用时，对应对象会标记错误。",
  variableExample: "示例 {{example}}",
  textCut: "剪切",
  textCopy: "复制",
  textPaste: "粘贴",
  textSelectAll: "全选",
  clipboardFailed: "无法访问剪贴板，输入内容已保留",
  clipboardChanged: "输入内容已更改，请重新执行剪贴板操作",
  variableCategories: {
    date: "日期与时间",
    name: "名称",
    parent: "上级目录",
    fileTime: "文件时间",
  },
  variableReasons: {
    parentMissing: "上级目录不存在",
    createdTimeUnavailable: "无法读取创建时间",
    modifiedTimeUnavailable: "无法读取修改时间",
  },
  variables: {
    Date: { label: "当前日期", description: "当前日期，格式为年-月-日" },
    Time: { label: "当前时间", description: "当前时间，格式为时-分-秒" },
    DateTime: { label: "当前日期时间", description: "当前日期和时间，以_连接" },
    Year: { label: "当前年份", description: "当前年份，固定4位" },
    Month: { label: "当前月份", description: "当前月份，固定2位" },
    Day: { label: "当前日", description: "当前日，固定2位" },
    Name: { label: "原完整名称", description: "对象原名称，包含扩展名" },
    Stem: {
      label: "原主名称",
      description: "原名称去除最后一个扩展名；文件夹保留完整名称",
    },
    Ext: {
      label: "原扩展名",
      description: "原名称最后一个扩展名，不含点；无扩展名或为文件夹时为空",
    },
    CName: {
      label: "当前完整名称",
      description: "当前规则开始前的完整名称，包含前面规则的处理结果",
    },
    CStem: {
      label: "当前主名称",
      description: "当前规则开始前的名称去除最后一个扩展名；文件夹保留完整名称",
    },
    CExt: {
      label: "当前扩展名",
      description:
        "当前规则开始前的最后一个扩展名，不含点；无扩展名或为文件夹时为空",
    },
    ParentDir: {
      label: "上级目录名称",
      description: "对象原路径中的上一级目录名称",
    },
    ParentDir2: {
      label: "上二级目录名称",
      description: "对象原路径中的上二级目录名称",
    },
    ParentDir3: {
      label: "上三级目录名称",
      description: "对象原路径中的上三级目录名称",
    },
    ParentDir4: {
      label: "上四级目录名称",
      description: "对象原路径中的上四级目录名称",
    },
    ParentDir5: {
      label: "上五级目录名称",
      description: "对象原路径中的上五级目录名称",
    },
    CreatedDate: {
      label: "创建日期",
      description: "文件或文件夹的创建日期，格式为年-月-日",
    },
    CreatedTime: {
      label: "创建时间",
      description: "文件或文件夹的创建时间，格式为时-分-秒",
    },
    CreatedDateTime: {
      label: "创建日期时间",
      description: "文件或文件夹的创建日期和时间，以_连接",
    },
    ModifiedDate: {
      label: "修改日期",
      description: "文件或文件夹的修改日期，格式为年-月-日",
    },
    ModifiedTime: {
      label: "修改时间",
      description: "文件或文件夹的修改时间，格式为时-分-秒",
    },
    ModifiedDateTime: {
      label: "修改日期时间",
      description: "文件或文件夹的修改日期和时间，以_连接",
    },
  },
};

export const variableEn = {
  insertVariable: "Insert variable",
  availableVariables: "Available variables",
  templateInputHelp: "Type variables such as <Date>, or right-click to insert",
  variablesHelp:
    "Available in Add and pad text and replacement text. Variable names are case-insensitive. Local date and time are captured once per preview and retained for execution. Use << and >> for literal angle brackets. Missing ancestors or unavailable file times mark the affected item as an error.",
  variableExample: "Example {{example}}",
  textCut: "Cut",
  textCopy: "Copy",
  textPaste: "Paste",
  textSelectAll: "Select all",
  clipboardFailed: "Cannot access the clipboard Your input has been preserved",
  clipboardChanged: "Input changed Repeat the clipboard action",
  variableCategories: {
    date: "Date and time",
    name: "Names",
    parent: "Parent folders",
    fileTime: "File times",
  },
  variableReasons: {
    parentMissing: "Parent folder does not exist",
    createdTimeUnavailable: "Creation time is unavailable",
    modifiedTimeUnavailable: "Modification time is unavailable",
  },
  variables: {
    Date: {
      label: "Current date",
      description: "Current date in YYYY-MM-DD format",
    },
    Time: {
      label: "Current time",
      description: "Current time in HH-mm-ss format",
    },
    DateTime: {
      label: "Current date and time",
      description: "Current date and time joined with _",
    },
    Year: {
      label: "Current year",
      description: "Current year with four digits",
    },
    Month: {
      label: "Current month",
      description: "Current month with two digits",
    },
    Day: {
      label: "Current day",
      description: "Current day of the month with two digits",
    },
    Name: {
      label: "Original full name",
      description: "Original item name including its extension",
    },
    Stem: {
      label: "Original base name",
      description:
        "Original name without its last extension Folders use the full name",
    },
    Ext: {
      label: "Original extension",
      description:
        "Last original extension without the dot Empty for folders and names without an extension",
    },
    CName: {
      label: "Current full name",
      description:
        "Full name before the current rule, including changes from preceding rules",
    },
    CStem: {
      label: "Current base name",
      description:
        "Name before the current rule without its last extension Folders use the full name",
    },
    CExt: {
      label: "Current extension",
      description:
        "Last extension before the current rule, without the dot Empty for folders and names without an extension",
    },
    ParentDir: {
      label: "Parent folder name",
      description: "Immediate parent folder name from the original path",
    },
    ParentDir2: {
      label: "Second parent folder name",
      description: "Folder name two levels above the original item",
    },
    ParentDir3: {
      label: "Third parent folder name",
      description: "Folder name three levels above the original item",
    },
    ParentDir4: {
      label: "Fourth parent folder name",
      description: "Folder name four levels above the original item",
    },
    ParentDir5: {
      label: "Fifth parent folder name",
      description: "Folder name five levels above the original item",
    },
    CreatedDate: {
      label: "Creation date",
      description: "File or folder creation date in YYYY-MM-DD format",
    },
    CreatedTime: {
      label: "Creation time",
      description: "File or folder creation time in HH-mm-ss format",
    },
    CreatedDateTime: {
      label: "Creation date and time",
      description: "File or folder creation date and time joined with _",
    },
    ModifiedDate: {
      label: "Modification date",
      description: "File or folder modification date in YYYY-MM-DD format",
    },
    ModifiedTime: {
      label: "Modification time",
      description: "File or folder modification time in HH-mm-ss format",
    },
    ModifiedDateTime: {
      label: "Modification date and time",
      description: "File or folder modification date and time joined with _",
    },
  },
};
