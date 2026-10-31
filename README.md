# MRenamer

批量重命名工具，支持文件和文件夹，重命名预览。

## 功能

- 六类重命名操作：添加与补齐、替换、删除与保留、自动编号、移动、字母大小写。
- 重命名操作可以自由组合。
- 自动编号支持数字、大写字母和小写字母，字母按A…Z、AA…AZ或a…z、aa…az连续编号，起始值1对应A或a。
- 实时预览重命名。
- 名称冲突检查、操作记录、撤销和中断恢复
- macOS和Windows支持跟随系统强调色，未读取到时使用`#3478F7`。

## 使用

使用示例：

1. 添加或拖入要命名的文件和文件夹。
2. 选择重命名操作，目标命名可实时预览。
3. 多个重命名操作可按顺序执行并更改名称。
4. 确认目标命名后 `执行重命名` 应用命名。
5. 可从操作记录中撤销命名。

## 开发与构建

使用Tauri 2、React、TypeScript、Vite、shadcn/ui和Rust，SQLite保存操作历史。

准备Git、Node.js 24、pnpm 12、Rust稳定版及[Tauri平台依赖](https://v2.tauri.app/start/prerequisites/)，然后运行：

```bash
pnpm install --frozen-lockfile
pnpm tauri dev
```

构建桌面程序：

```bash
pnpm tauri build --no-bundle
```

Windows程序输出到`src-tauri/target/release/mrenamer.exe`。构建需要在对应系统上进行。使用`pnpm dev`可预览界面，文件操作需要桌面版。
