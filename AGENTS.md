# MRenamer开发指南

## 项目约定

MRenamer是Tauri 2桌面批量重命名工具。React前端负责配置和展示，Rust负责扫描、规则计算、校验、执行和撤销，SQLite保存操作日志。不要在前端另写预览算法。

- 先遵循[构建准则](docs/构建准则.md)，不要修改该文档
- 产品功能与使用方式见[README](README.md)，规则行为以Rust实现及测试为准
- 使用pnpm，保留`pnpm-lock.yaml`、`src-tauri/Cargo.lock`及`skills-lock.json`
- 应用版本由Git Tag生成，`package.json`、`src-tauri/Cargo.toml`和`src-tauri/tauri.conf.json`中的`0.0.0`仅作静态占位，不手工提升发布版本
- 应用标识`dev.govo.mrenamer`与状态存储键保持稳定，避免更新后丢失历史或布局

## 模块职责

| 位置                           | 职责                                       |
| ------------------------------ | ------------------------------------------ |
| `src/App.tsx`                  | 对象、规则、预览请求和执行状态协调         |
| `src/components`               | 菜单、规则编辑、执行项目、预览表格和状态栏 |
| `src/components/ui`            | 官方shadcn组件及项目内定制                 |
| `src/lib`                      | 数据类型、翻译、列表排序和面板宽度记忆     |
| `src-tauri/src/rules.rs`       | 纯规则计算和参数校验                       |
| `src-tauri/src/engine.rs`      | 扫描、预览计划、重命名与恢复流程           |
| `src-tauri/src/platform.rs`    | 不覆盖目标的平台文件操作                   |
| `src-tauri/src/storage.rs`     | SQLite日志和旧版历史兼容                   |
| `src-tauri/src/lib.rs`         | Tauri命令、插件和应用初始化                |
| `src-tauri/tests`、`tests/e2e` | 临时目录集成测试、浏览器交互测试           |
| `scripts/toolchain.mjs`        | 定位本机Rust工具链并启动项目命令           |
| `scripts/version.ts`           | Git版本解析、构建快照和Tauri版本配置       |

## 界面与文案

修改界面前阅读仓库内[shadcn技能](.agents/skills/shadcn/SKILL.md)。保持Base UI、Nova、Tailwind CSS和Lucide，组件通过官方注册表与CLI添加，不混用其他UI库，不批量覆盖已定制组件。

- 使用语义颜色变量，表单使用Field组件，保持按钮尺寸协调和键盘焦点可见
- 保留文件、编辑、关于菜单，顶部快捷工具为执行重命名和操作记录，设置从编辑菜单进入
- 三栏始终显示，空状态显示提示；详情选项使用单选组，执行项目数量紧邻标题
- 名称搜索和处理对象筛选暂不在范围内，用户未要求时不要重新加入
- 文案简洁、正式、准确，减少不必要的标点；新增文本同时维护简体中文和英文
- 使用稳定错误码和参数返回错误，界面翻译错误摘要，系统详情按需展开
- 界面文字默认禁止拖选，输入框、可编辑区域和错误详情保留文字选择与复制

窗口状态由Tauri window-state插件保存。侧栏按像素保存，上下区域按比例保存，自动布局和窄窗口约束不要覆盖用户偏好。不要因调整界面而更换面板存储键。

## 文件操作约束

- 规则按顺序处理，预览和执行使用同一Rust实现
- 计划由后端持有，执行时提交计划标识，再次核对文件身份和目标占用
- 保持不覆盖目标的系统调用，不要改用普通`std::fs::rename`替代
- 每个实际步骤执行前写入持久日志，执行后更新状态；恢复步骤必须可重入
- 保留名称交换、仅大小写变化和父子目录同时改名的处理顺序
- 不跟随符号链接、目录联接或链接祖先进行文件操作
- 不要为了通过测试放宽身份检查、名称校验和冲突检测
- 旧标识`app.renamer.desktop`的历史兼容逻辑需要保留，不覆盖已有日志
- 文件测试只使用临时目录，浏览器测试使用隔离上下文，不使用用户文件或个人浏览器配置

## 开发与验证

按README安装依赖并启动桌面开发。`pnpm dev`只启动浏览器界面。Rust命令优先使用项目的`pnpm cargo`包装器，无需修改用户PATH。

常规前端检查：

```bash
pnpm typecheck
pnpm test
pnpm format:check
```

`pnpm test`也运行临时Git仓库中的版本场景和真实前端构建测试，需要Git。版本逻辑改动要覆盖精确Tag、祖先Tag、无Tag、无提交、无效Tag、不可达Tag、浅克隆和构建快照一致性。

修改界面、交互或布局时，先安装测试浏览器，再验证生产构建和交互：

```bash
pnpm exec playwright install chromium
pnpm build
pnpm test:e2e
```

检查中英文、深浅色、760像素窄窗口、键盘操作和一万条记录的虚拟滚动。修改布局记忆时，验证关闭重开、不同窗口宽度和添加或删除规则后的恢复。

修改Rust规则、文件操作、日志或桌面接入时：

```bash
pnpm check:rust
pnpm cargo fmt --manifest-path src-tauri/Cargo.toml --check
pnpm cargo clippy --locked --manifest-path src-tauri/Cargo.toml -- -D warnings
```

目录处理变动需要覆盖父子目录、名称交换、大小写变化、执行失败恢复和重启后撤销。桌面插件或构建配置变动还需执行`pnpm tauri build --no-bundle`。

优先输出到项目构建目录。若程序正在运行导致文件被占用，使用项目内独立目标目录构建，不要关闭用户窗口。不要同时重写`dist`并运行依赖它的界面测试。未实际运行的平台或桌面流程，不标记为已验证。

## 版本生成

Tag严格使用`vMAJOR.MINOR.PATCH`，数字无多余前导零。最近祖先Tag由Git describe在符合格式的可达Tag中选择，短哈希至少7位。工作区是否有未提交改动不额外改变版本格式。

通过`pnpm tauri dev`或`pnpm tauri build`调用构建包装器。包装器解析一次Git版本，将同一快照传给Vite，并注入去除`v`前缀的Tauri SemVer配置。界面读取`__APP_VERSION__`，不要再读取静态包版本。`MRENAMER_BUILD_VERSION`是该进程链内部的版本快照，不作为手动发布版本入口。

保留CI的完整历史和Tag获取配置。没有提交、缺失Git元数据或开发构建历史不完整时应明确报错，不使用旧版本或伪造哈希兜底。验证这些场景使用临时仓库，不在用户仓库创建测试提交或Tag。

## 文档与生成文件

README保持简短，面向使用者；本文件维护开发约束；CHANGELOG按实际测试版本记录用户可感知的变化，不写开发流水账。行为变化同步相关文档，纯文档调整无需提升程序版本。

生成物、本地缓存、环境文件和操作数据库按`.gitignore`排除。源码、源图标、锁文件和仓库内`.agents/skills`需要保留，不添加笼统的压缩包、可执行文件或数据库扩展名忽略规则。
