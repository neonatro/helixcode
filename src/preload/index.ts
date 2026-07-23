import { contextBridge, ipcRenderer } from 'electron';
import type { HelixApi } from '../shared/types';
const api: HelixApi = {
  chooseFolder: () => ipcRenderer.invoke('folder:choose'), closeWorkspace: () => ipcRenderer.invoke('workspace:close'), getWorkspaceRoot: () => ipcRenderer.invoke('workspace:get'), getTree: p => ipcRenderer.invoke('tree:get', p), readFile: p => ipcRenderer.invoke('file:read', p), writeFile: (p,c) => ipcRenderer.invoke('file:write', p,c),
  renamePath: (a,b) => ipcRenderer.invoke('file:rename',a,b), createPath: (p,d) => ipcRenderer.invoke('file:create',p,d), deletePath: p => ipcRenderer.invoke('file:delete',p),
  getSettings: () => ipcRenderer.invoke('settings:get'), saveSettings: s => ipcRenderer.invoke('settings:save',s), getAudit: () => ipcRenderer.invoke('audit:get'),
  getChatHistory: () => ipcRenderer.invoke('chat-history:get'), saveChatHistory: history => ipcRenderer.invoke('chat-history:save', history),
  listModels: s => ipcRenderer.invoke('models:list', s),
  respondTool: (id, result) => ipcRenderer.send('agent:tool-result', id, result),
  onAgentEvent: callback => { const fn = (_: unknown, event: any) => callback(event); ipcRenderer.on('agent:event', fn); return () => ipcRenderer.removeListener('agent:event', fn); },
  startAgent: (m,h) => ipcRenderer.invoke('agent:start',m,h), cancelAgent: () => ipcRenderer.invoke('agent:cancel')
  , minimizeWindow: () => ipcRenderer.send('window:minimize'), toggleMaximizeWindow: () => ipcRenderer.send('window:toggle-maximize'), closeWindow: () => ipcRenderer.send('window:close'), openExternal: url => ipcRenderer.invoke('external:open', url)
};
contextBridge.exposeInMainWorld('helix', api);
window.addEventListener('contextmenu', event => { event.preventDefault(); const target = event.target as HTMLElement | null; const editable = !!target && (target.matches('input, textarea') || target.isContentEditable); ipcRenderer.send('context:menu', { editable, hasSelection: !!window.getSelection()?.toString() }); });
