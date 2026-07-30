import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Archive, CheckCircle2, Clock3, Copy, FileWarning, FolderOpen, Gauge, History, LayoutDashboard, RefreshCw, Settings, Sparkles, Undo2 } from "lucide-react";
import "./styles.css";

type Category = "document" | "image" | "video" | "audio" | "installer" | "archive" | "other" | "to_archive";
type FileStatus = "needs_sorting" | "archivable" | "duplicate" | "similar" | "keep";
type Source = { path: string; recursive: boolean; destinations: Record<Category, string> };
type Config = { sources: Source[]; pinned: string[] };
type DeskFile = { id: string; path: string; name: string; extension: string; size: number; modified_at: string; category: Category; status: FileStatus; duplicate_group?: string; similar_group?: string; suggested_destination: string };
type Scan = { scanned_at: string; files: DeskFile[]; duplicate_groups: Record<string, string[]>; similar_groups: Record<string, string[]>; errors: string[] };
type PlanItem = { source: string; destination: string; conflict: boolean; reason: string };
type Report = { date: string; total_files: number; needs_sorting: number; archivable: number; duplicate_groups: number; similar_groups: number; recent_operations: number };

const categoryNames: Record<Category, string> = { document: "文档", image: "图片", video: "视频", audio: "音频", installer: "安装包", archive: "压缩包", other: "其他", to_archive: "待归档" };
const statusNames: Record<FileStatus, string> = { needs_sorting: "待整理", archivable: "可归档", duplicate: "重复文件", similar: "相似文件", keep: "需保留" };
const destinationCategories: Category[] = ["document", "image", "video", "audio", "installer", "archive", "other"];

function bytes(size: number) { return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`; }
function invokeSafe<T>(cmd: string, args?: Record<string, unknown>) { return invoke<T>(cmd, args); }
function FileBadge({ file }: { file: Pick<DeskFile, "extension" | "category"> }) { const label = file.extension ? file.extension.slice(0, 4).toUpperCase() : "FILE"; const tone = ["doc", "docx", "txt", "pdf"].includes(file.extension.toLowerCase()) ? "doc" : ["xls", "xlsx", "csv"].includes(file.extension.toLowerCase()) ? "sheet" : ["ppt", "pptx"].includes(file.extension.toLowerCase()) ? "slide" : file.category; return <span className={`file-badge ${tone}`} aria-label={`${label} 文件`}>{label}</span>; }

function App() {
  const [view, setView] = useState("overview");
  const [config, setConfig] = useState<Config | null>(null);
  const [scan, setScan] = useState<Scan | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [plan, setPlan] = useState<PlanItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = async () => {
    const [nextConfig, nextScan, nextReport] = await Promise.all([invokeSafe<Config>("get_config"), invokeSafe<Scan | null>("get_last_scan"), invokeSafe<Report>("get_daily_report")]);
    setConfig(nextConfig); setScan(nextScan); setReport(nextReport);
  };
  useEffect(() => { refresh().catch(e => setMessage(String(e))); }, []);
  const files = scan?.files ?? [];
  const visibleFiles = useMemo(() => view === "sorting" ? files.filter(f => f.status === "needs_sorting" || f.status === "archivable") : view === "duplicates" ? files.filter(f => f.status === "duplicate" || f.status === "similar") : files, [files, view]);
  const groupedFiles = useMemo(() => visibleFiles.reduce((groups, file) => { (groups[file.category] ??= []).push(file); return groups; }, {} as Partial<Record<Category, DeskFile[]>>), [visibleFiles]);
  const doScan = async () => { setBusy(true); setMessage(""); try { const result = await invokeSafe<Scan>("scan_files"); setScan(result); setSelected([]); setReport(await invokeSafe<Report>("get_daily_report")); setMessage(`扫描完成：发现 ${result.files.length} 个文件`); } catch (e) { setMessage(`扫描失败：${String(e)}`); } finally { setBusy(false); } };
  const buildPlan = async () => { const paths = selected.length ? selected : files.filter(f => f.status === "needs_sorting" || f.status === "archivable").map(f => f.path); const next = await invokeSafe<PlanItem[]>("build_plan", { paths }); setPlan(next); };
  const execute = async () => { setBusy(true); try { await invokeSafe("execute_plan", { items: plan }); setPlan([]); await refresh(); setMessage("已完成整理；可在历史记录中撤销。"); } catch (e) { setMessage(`整理未完成：${String(e)}`); } finally { setBusy(false); } };
  const chooseSource = async () => { const path = await open({ directory: true, multiple: false, title: "选择要管理的目录" }); if (!path) return; const updated: Config = { sources: [...(config?.sources ?? []), { path, recursive: false, destinations: {} as Record<Category, string> }], pinned: config?.pinned ?? [] }; await invokeSafe("save_config", { config: updated }); setConfig(updated); };
  const chooseDestination = async (sourceIndex: number, category: Category) => { if (!config) return; const path = await open({ directory: true, multiple: false, title: `选择“${categoryNames[category]}”的归档位置` }); if (!path) return; const sources = config.sources.map((source, index) => index === sourceIndex ? { ...source, destinations: { ...source.destinations, [category]: path } } : source); const updated = { ...config, sources }; await invokeSafe("save_config", { config: updated }); setConfig(updated); };
  const addPin = async (file: DeskFile) => { const updated = { ...(config as Config), pinned: [...(config?.pinned ?? []), file.path] }; await invokeSafe("save_config", { config: updated }); await doScan(); };
  const nav = [{ id: "overview", label: "概览", icon: LayoutDashboard }, { id: "sorting", label: "待整理", icon: Archive }, { id: "duplicates", label: "重复与相似", icon: Copy }, { id: "history", label: "整理历史", icon: History }, { id: "settings", label: "设置", icon: Settings }];
  const stats = [{ label: "待整理", value: report?.needs_sorting ?? 0, icon: FileWarning, accent: "amber" }, { label: "可归档", value: report?.archivable ?? 0, icon: Archive, accent: "blue" }, { label: "重复 / 相似组", value: (report?.duplicate_groups ?? 0) + (report?.similar_groups ?? 0), icon: Copy, accent: "violet" }, { label: "近期整理", value: report?.recent_operations ?? 0, icon: CheckCircle2, accent: "green" }];
  return <main className="app-shell"><aside><div className="brand"><span className="brand-mark">C</span><span>CleanDesk<small>空间管理器</small></span></div><nav>{nav.map(item => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><item.icon size={18} />{item.label}</button>)}</nav><div className="sidebar-bottom"><div className="ai-note"><Sparkles size={16}/><span>AI 生命周期管理<br/><em>即将推出</em></span></div><button className="scan-button" onClick={doScan} disabled={busy}><RefreshCw size={17} className={busy ? "spin" : ""}/>{busy ? "正在扫描" : "扫描空间"}</button></div></aside>
  <section className="workspace"><header><div><p className="eyebrow">YOUR DIGITAL SPACE</p><h1>{view === "overview" ? "让桌面保持轻盈" : nav.find(n => n.id === view)?.label}</h1></div><div className="header-actions"><span className="scan-time"><Clock3 size={15}/>{scan ? `上次扫描 ${new Date(scan.scanned_at).toLocaleString("zh-CN")}` : "尚未扫描"}</span><button className="outline" onClick={doScan}><RefreshCw size={16}/>刷新</button></div></header>{message && <div className="notice">{message}</div>}
  {view === "overview" && <><section className="hero"><div><span className="eyebrow">DESKTOP STATUS</span><h2>{report?.total_files ? "你的空间，已准备好整理。" : "从一次扫描开始。"}</h2><p>CleanDesk 只在你的设备上分析文件。先看建议，再决定是否移动。</p><button className="primary" onClick={doScan}><Gauge size={17}/>开始扫描</button></div><div className="ring"><strong>{report?.total_files ?? 0}</strong><span>已扫描文件</span></div></section><section className="stats">{stats.map(s => <article key={s.label} className={`stat ${s.accent}`}><s.icon size={20}/><strong>{s.value}</strong><span>{s.label}</span></article>)}</section><section className="panel capability"><div><p className="eyebrow">V1 能力范围</p><h3>清晰判断，始终由你决定。</h3></div><ul><li><CheckCircle2/>扫描桌面与指定目录</li><li><CheckCircle2/>规则化分类建议</li><li><CheckCircle2/>完全重复与相似文件提示</li><li><CheckCircle2/>一键整理与撤销</li><li><CheckCircle2/>应用内每日摘要</li></ul></section></>}
  {(view === "sorting" || view === "duplicates") && <section className="panel list-panel"><div className="panel-head"><div><p className="eyebrow">FILE CATEGORIES</p><h3>{view === "sorting" ? "按类别整理你的文件" : "需要你决定的文件组"}</h3><p>{view === "sorting" ? "文件已按建议类型归类；勾选后可预览移动位置。" : "重复和相似项不会自动移动或删除。"}</p></div>{view === "sorting" && <button className="primary" disabled={!visibleFiles.length} onClick={buildPlan}>预览整理 {selected.length ? `(${selected.length})` : ""}</button>}</div>{visibleFiles.length ? <div className="category-list">{(Object.entries(groupedFiles) as [Category, DeskFile[]][]).map(([category, categoryFiles]) => <section className="file-category" key={category}><div className="category-head"><span>{categoryNames[category]}</span><small>{categoryFiles.length} 个文件</small></div>{categoryFiles.map(file => <label className="file-row" key={file.id}><input type="checkbox" checked={selected.includes(file.path)} onChange={() => setSelected(old => old.includes(file.path) ? old.filter(p => p !== file.path) : [...old, file.path])}/><FileBadge file={file}/><div className="file-name"><strong>{file.name}</strong><span>{bytes(file.size)} · 修改于 {new Date(file.modified_at).toLocaleDateString("zh-CN")}</span></div><span className={`pill ${file.status}`}>{statusNames[file.status]}</span><span className="destination">→ {categoryNames[file.category]}</span>{file.status !== "keep" && <button type="button" className="pin" onClick={() => addPin(file)}>保留</button>}</label>)}</section>)}</div> : <div className="empty"><FolderOpen size={28}/><p>还没有可显示的文件。请先扫描一个目录。</p></div>}</section>}
  {view === "history" && <HistoryView onUndo={async id => { await invokeSafe("undo_operation", { id }); await refresh(); }} />}
  {view === "settings" && <section className="panel settings"><div className="panel-head"><div><h3>管理目录</h3><p>默认只扫描所选目录的第一层文件，不扫描隐藏项。</p></div><button className="outline" onClick={chooseSource}><FolderOpen size={16}/>添加目录</button></div>{config?.sources.map((source, index) => <div className="source" key={source.path}><FolderOpen size={18}/><div className="source-content"><strong>{source.path}</strong><span>为每个类别指定独立归档位置；留空时会在当前目录创建默认分类文件夹。</span><div className="destination-grid">{destinationCategories.map(category => <button className="destination-choice" key={category} onClick={() => chooseDestination(index, category)}><b>{categoryNames[category]}</b><small>{source.destinations[category] ?? "默认：当前目录"}</small></button>)}</div></div></div>)}</section>}
  </section>{plan.length > 0 && <div className="modal-backdrop"><section className="modal"><p className="eyebrow">MOVE PREVIEW</p><h2>确认整理方案</h2><p>以下 {plan.length} 个文件将被移动。重复与相似文件未包含在此计划中。</p><div className="plan-list">{plan.map(item => <div key={item.source}><strong>{item.source.split(/[\\/]/).pop()}</strong><span>→ {item.destination}{item.conflict ? "（将追加序号）" : ""}</span></div>)}</div><div className="modal-actions"><button className="outline" onClick={() => setPlan([])}>取消</button><button className="primary" onClick={execute} disabled={busy}>确认并移动</button></div></section></div>}</main>;
}

function HistoryView({ onUndo }: { onUndo: (id: number) => Promise<void> }) {
  type HistoryItem = { id: number; moved_at: string; entries: PlanItem[]; undone: boolean };
  const [history, setHistory] = useState<HistoryItem[]>([]);
  useEffect(() => { invokeSafe<HistoryItem[]>("get_history").then(setHistory); }, []);
  return <section className="panel list-panel"><div className="panel-head"><div><p className="eyebrow">ACTIVITY LOG</p><h3>每一次整理，都有去向</h3><p>你可以查看文件从哪里来、被整理到哪里；撤销会尽可能恢复原路径。</p></div></div>{history.length ? <div className="history-list">{history.map(row => <article className="history-card" key={row.id}><div className="history-title"><div><span className="history-symbol"><History size={16}/></span><strong>整理了 {row.entries.length} 个文件</strong><small>{new Date(row.moved_at).toLocaleString("zh-CN")}</small></div><div><span className={`pill ${row.undone ? "keep" : "needs_sorting"}`}>{row.undone ? "已撤销" : "已完成"}</span>{!row.undone && <button className="outline" onClick={() => onUndo(row.id)}><Undo2 size={15}/>撤销</button>}</div></div><div className="history-entries">{row.entries.map(entry => <div className="history-entry" key={entry.destination}><FileBadge file={{ extension: entry.source.split(".").pop() ?? "", category: "other" }}/><div><strong>{entry.source.split(/[\\/]/).pop()}</strong><span title={entry.source}>原位置：{entry.source}</span><span title={entry.destination}>新位置：{entry.destination}</span></div></div>)}</div></article>)}</div> : <div className="empty"><History size={28}/><p>还没有整理记录。</p></div>}</section>
}
createRoot(document.getElementById("root")!).render(<App />);
