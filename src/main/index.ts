import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import path from 'node:path';
import { loadState, getSettings, setSettings, getWorkspaceRoot, setWorkspaceRoot, addAudit, getAudit, commandAllowed, allowCommand, getChatHistory, setChatHistory } from './state';
import * as tools from './fs-tools';
import { searchWeb } from './web-tools';
import { runAnthropic, runGemini, runOpenAi } from './agent';
import { listModels } from './providers';
import type { AgentEvent, ToolRequest, ToolResult } from '../shared/types';

let window: BrowserWindow | null = null; let controller: AbortController | null = null;
const pending = new Map<string, (result: ToolResult) => void>();
function send(event: AgentEvent) { window?.webContents.send('agent:event', event); }

async function executeTool(request: ToolRequest): Promise<ToolResult> {
  const args = request.args as any;
  try {
    let content = '';
    switch (request.tool) {
      case 'list_dir': content = JSON.stringify(await tools.tree(args.path), null, 2); break;
      case 'read_file': content = await tools.readFile(args.path); break;
      case 'write_file': content = `File ${await tools.writeFile(args.path, args.content)}.`; break;
      case 'create_directory': await tools.createPath(args.path, true); content = 'Directory created.'; break;
      case 'edit_file': content = await tools.applyPatch(args.path, args.patch); break;
      case 'delete_file': await tools.deletePath(args.path); content = 'Deleted.'; break;
      case 'search_in_files': content = await tools.searchInFiles(args.query, args.path); break;
      case 'search_web': {
        if (!getSettings().webSearchEnabled) throw new Error('Web research is turned off in Settings.');
        const result = await searchWeb(args.query);
        return result;
      }
      case 'run_command': content = (await tools.runCommand(args.cmd, args.cwd)).content; break;
      default: throw new Error(`Unknown tool: ${request.tool}`);
    }
    return { content };
  } catch (error: any) { return { content: error.message || String(error), error: true }; }
}
async function requestTool(request: ToolRequest) {
  const args = request.args as any; const target = args.path || args.cwd || args.cmd || '(workspace)';
  const mustConfirm = request.tool === 'delete_file' || (request.tool === 'run_command' && !commandAllowed(args.cmd)) || getSettings().permissionMode === 'extended';
  send({ type: 'tool', request: { ...request, reason: mustConfirm ? 'approval-required' : 'automatic' } });
  if (!mustConfirm) { addAudit({ tool: request.tool, target, approved: 'automatic' }); return executeTool(request); }
  const response = await new Promise<ToolResult>(resolve => pending.set(request.id, resolve));
  addAudit({ tool: request.tool, target, approved: response.error ? 'blocked' : 'confirmed', detail: response.error ? response.content : undefined });
  if (response.error) return response;
  if (request.tool === 'run_command' && args.alwaysAllow) await allowCommand(args.cmd);
  return executeTool(request);
}
function createWindow() {
  Menu.setApplicationMenu(null);
  const icon = app.isPackaged ? path.join(process.resourcesPath, 'app_logo.png') : path.join(app.getAppPath(), 'app_logo.png');
  window = new BrowserWindow({ width: 1500, height: 940, minWidth: 1050, minHeight: 700, frame: false, backgroundColor: '#101318', icon, webPreferences: { preload: path.join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false } });
  const url = process.env.VITE_DEV_SERVER_URL; if (url) window.loadURL(url); else window.loadFile(path.join(app.getAppPath(), 'dist', 'renderer', 'index.html'));
}
app.whenReady().then(async () => { await loadState(); createWindow(); app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); }); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('folder:choose', async () => { const result = await dialog.showOpenDialog(window!, { properties: ['openDirectory'] }); if (result.canceled) return null; await setWorkspaceRoot(result.filePaths[0]); return result.filePaths[0]; });
ipcMain.handle('workspace:get', () => getWorkspaceRoot()); ipcMain.handle('workspace:close', () => setWorkspaceRoot(null));
ipcMain.handle('tree:get', (_, p) => tools.tree(p)); ipcMain.handle('file:read', (_, p) => tools.readFile(p)); ipcMain.handle('file:write', (_, p, c) => tools.writeFile(p, c));
ipcMain.handle('file:create', (_, p, d) => tools.createPath(p, d)); ipcMain.handle('file:rename', (_, a, b) => tools.renamePath(a, b)); ipcMain.handle('file:delete', (_, p) => tools.deletePath(p));
ipcMain.handle('settings:get', () => getSettings()); ipcMain.handle('settings:save', async (_, s) => { if (s.permissionMode === 'extended' && getSettings().permissionMode !== 'extended') { const ok = await dialog.showMessageBox(window!, { type: 'warning', buttons: ['Cancel', 'Enable extended mode'], defaultId: 0, cancelId: 0, message: 'Extended / Full PC mode can expose files outside your open project to the agent.', detail: 'Every outside-project operation and deletion will still require your confirmation.' }); if (ok.response !== 1) throw new Error('Extended mode was not enabled.'); } await setSettings(s); });
ipcMain.handle('models:list', (_, settings) => listModels(settings));
ipcMain.handle('audit:get', () => getAudit());
ipcMain.handle('chat-history:get', () => getChatHistory());
ipcMain.handle('chat-history:save', (_, history) => setChatHistory(history));
ipcMain.handle('agent:start', async (_, message, history) => {
  if (controller) throw new Error('An agent run is already active.');
  const settings = getSettings();
  if (!settings.apiKey.trim() && !['ollama', 'lmstudio'].includes(settings.provider)) {
    throw new Error(`Add a valid ${settings.provider === 'openrouter' ? 'OpenRouter' : ''} API key in Settings first, then click Save settings.`);
  }
  if (!getWorkspaceRoot()) throw new Error('Open a project folder first.');
  controller = new AbortController();
  let webContext = '';
  if (settings.webSearchEnabled) {
    const request: ToolRequest = { id: crypto.randomUUID(), tool: 'search_web', args: { query: message } };
    send({ type: 'tool', request: { ...request, reason: 'automatic' } });
    const result = await searchWeb(message);
    addAudit({ tool: 'search_web', target: message.slice(0, 120), approved: 'automatic', detail: result.error ? result.content : undefined });
    send({ type: 'tool-result', request, result });
    webContext = result.content;
  }
  const completedMutations = new Set<string>();
  const approvedDeleteScopes = new Set<string>();
  const projectRoot = path.resolve(getWorkspaceRoot()!);
  const coveredByApprovedDeleteScope = (target: string) => [...approvedDeleteScopes].some(scope => {
    const relative = path.relative(scope, target);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  });
  const guardedTool = async (request: ToolRequest) => {
    if (!['write_file', 'create_directory', 'delete_file'].includes(request.tool)) return requestTool(request);
    const key = `${request.tool}:${JSON.stringify(request.args)}`;
    if (completedMutations.has(key)) return { content: 'Skipped: this exact file change already succeeded.' };
    const target = typeof request.args.path === 'string' ? path.resolve(projectRoot, request.args.path) : '';
    if (request.tool === 'delete_file' && target && coveredByApprovedDeleteScope(target)) {
      send({ type: 'tool', request: { ...request, reason: 'automatic' } });
      addAudit({ tool: request.tool, target, approved: 'automatic', detail: 'Covered by a prior deletion approval in this folder.' });
      const result = await executeTool(request);
      if (!result.error) completedMutations.add(key);
      return result;
    }
    const result = await requestTool(request);
    if (!result.error) {
      completedMutations.add(key);
      if (request.tool === 'delete_file' && target) {
        const scope = path.dirname(target);
        if (scope !== projectRoot && !path.relative(projectRoot, scope).startsWith('..')) approvedDeleteScopes.add(scope);
      }
    }
    return result;
  };
  try {
    const runner = settings.provider === 'anthropic' ? runAnthropic : settings.provider === 'gemini' ? runGemini : runOpenAi;
    await runner(settings, [...history, { role: 'user', content: message }], guardedTool, send, controller.signal, webContext);
    send({ type: 'done' });
  } catch (e: any) {
    const failure = e.name === 'AbortError' ? 'Run stopped.' : String(e.message || e);
    const providerName = ({ openrouter: 'OpenRouter', gemini: 'Gemini', groq: 'Groq', openai: 'OpenAI', anthropic: 'Anthropic', ollama: 'Ollama', lmstudio: 'LM Studio', compatible: 'Custom provider' } as Record<string,string>)[settings.provider] ?? settings.provider;
    const errorText = failure.includes('429') ? settings.provider === 'lmstudio' ? `LM Studio returned HTTP 429. This is a local-server/queue response, not an OpenRouter free-tier limit. Check the LM Studio server and loaded model. Details: ${failure}` : `${providerName} returned HTTP 429. The request was rate-limited by that provider. Details: ${failure}` : failure.includes('401') && settings.provider === 'openrouter' ? 'OpenRouter rejected the API key (401). Open Settings, paste your sk-or- key, and click Save settings.' : failure;
    send({ type: 'error', content: errorText });
  } finally { controller = null; }
});
ipcMain.handle('agent:cancel', () => controller?.abort());
ipcMain.on('window:minimize', () => window?.minimize());
ipcMain.on('window:toggle-maximize', () => { if (!window) return; window.isMaximized() ? window.unmaximize() : window.maximize(); });
ipcMain.on('window:close', () => window?.close());
ipcMain.handle('external:open', async (_, url: string) => { const target = new URL(url); if (target.protocol !== 'https:') throw new Error('Only secure HTTPS links can be opened.'); await shell.openExternal(target.toString()); });
ipcMain.on('agent:tool-result', (_, id: string, result: ToolResult) => { const done = pending.get(id); if (done) { pending.delete(id); done(result); } });
ipcMain.on('context:menu', (_, input: { editable: boolean; hasSelection: boolean }) => { Menu.buildFromTemplate([{ role: 'cut', enabled: input.editable && input.hasSelection }, { role: 'copy', enabled: input.hasSelection }, { role: 'paste', enabled: input.editable }, { type: 'separator' }, { role: 'selectAll' }]).popup({ window: window ?? undefined }); });
