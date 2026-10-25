# MRenamer

本地批量重命名工具，支持文件和文件夹。先预览新名称，再执行重命名，文件内容不会上传到服务器。

## 功能

- 六类操作：添加补齐、替换、删除与保留、自动编号、移动、字母大小写
- 自由组合操作，支持拖动排序、复制、启停和实时预览
- 名称冲突检查、操作记录、撤销和中断恢复
- 简体中文与英文，浅色与深色主题，窗口尺寸和面板布局记忆

## 使用

Windows免安装版解压后运行`MRenamer.exe`，需要系统已安装Microsoft Edge WebView2运行时。当前提供Windows测试包，macOS和Linux已配置构建检查，仍待对应系统验证。

1. 从**文件**菜单添加文件或文件夹，也可直接拖入。
2. 在左栏添加重命名操作，在中栏调整顺序，在右栏设置参数。
3. 检查预览并解决冲突，通过勾选决定要处理的对象。
4. 点击顶部的**执行重命名**。需要恢复时，从**编辑 → 撤销**或**操作记录**进入。

文件夹默认载入自身，载入内容和递归选项位于**编辑 → 设置**。编号按列表排序生成。关闭软件后保留窗口布局，待处理列表和操作配置不会自动恢复。

例如，在添加补齐中选择名称之前并输入`样品_`，可将`01.txt`预览为`样品_01.txt`。

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

## 版本号

构建自动读取Git：HEAD精确匹配规范Tag时显示`v1.2.3`，否则显示最近祖先Tag加短哈希，如`v1.2.3-g1a2b3c4`；没有规范祖先Tag时显示`0.0.0-g1a2b3c4`。可用`pnpm version:print`查看。

请通过上述项目命令构建，版本会同时注入界面和Tauri打包配置，打包版本去掉`v`前缀。构建需要已有提交和完整历史；浅克隆可先运行`git fetch --unshallow --tags`。`dist/version.json`记录本次构建版本和完整commit哈希。

## 使用范围

只在对象原所在目录内改名，存在冲突时阻止执行，不覆盖已有目标。符号链接和目录联接不参与处理。暂不提供名称搜索、类型筛选、脚本、规则预设和跨目录搬移。

撤销依赖本机操作历史，删除应用数据会失去记录。批次执行失败时会尝试恢复，恢复未完成时可从操作记录重试。

版本变化见[CHANGELOG](CHANGELOG.md)。
