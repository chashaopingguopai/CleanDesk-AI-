# CleanDesk AI V1

An intelligent desktop organizer that keeps your workspace clean automatically.  
一个会理解你的电脑使用习惯、自动保持桌面干净的 AI 桌面管家。

当前 V1 为 Windows 优先、完全本地运行的数字空间管理器。它只扫描用户选择的目录，给出可解释的整理建议；移动前必须确认，且每次移动均可撤销。

## 已实现能力

- 默认管理 Windows 桌面，并支持添加任意磁盘目录。
- 按文件类型给出文档、图片、视频、音频、安装包、压缩包和其他分类建议。
- 状态规则：7 天内修改或固定的文件为“需保留”；30 天未修改的为“可归档”；其余为“待整理”。
- 用 SHA-256 判定完全重复文件；DOCX/PDF 的文本相似度和图片感知哈希仅作为“相似”提示。
- 整理预览、同名文件安全编号、SQLite 本地历史与撤销。

## 本地开发

需要 Node.js 20+、pnpm、Rust stable 以及 Windows WebView2。

```powershell
pnpm install
pnpm tauri dev
```

打包：

```powershell
pnpm tauri build
```

所有扫描快照、配置和操作记录均保存在 Windows 本地应用数据目录的 `CleanDesk/cleandesk.db` 中；不会上传文件内容或路径。

## V1 边界

不包含删除、云同步、后台定时扫描或生成式 AI。重复/相似文件只显示给用户决策，绝不自动处理。
