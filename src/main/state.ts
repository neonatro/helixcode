import { app, safeStorage } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { AuditEntry, ChatSession, PermissionMode, Settings } from '../shared/types';

const defaults: Settings = { provider: 'openrouter', apiKey: '', apiKeys: {}, baseUrl: '', model: '', permissionMode: 'project', webSearchEnabled: false, reasoningEnabled: true, onboardingComplete: false };
let settings: Settings = { ...defaults };
let workspaceRoot: string | null = null;
let audit: AuditEntry[] = [];
let commandAllowlist = new Set<string>();
let chatHistory: ChatSession[] = [];
const statePath = () => path.join(app.getPath('userData'), 'helix-state.json');

export async function loadState() {
  try {
    const raw = JSON.parse(await fs.readFile(statePath(), 'utf8'));
    const encryptedKeys: Record<string, string> = raw.encryptedKeys ?? (raw.encryptedKey ? { [raw.settings?.provider ?? 'openrouter']: raw.encryptedKey } : {});
    const apiKeys: Partial<Record<any, string>> = {};
    if (safeStorage.isEncryptionAvailable()) for (const [provider, encrypted] of Object.entries(encryptedKeys)) { try { apiKeys[provider as keyof typeof apiKeys] = safeStorage.decryptString(Buffer.from(encrypted, 'base64')); } catch {} }
    const loaded = { ...defaults, ...raw.settings, apiKeys: { ...apiKeys } }; settings = { ...loaded, apiKey: apiKeys[loaded.provider] ?? '' };
    workspaceRoot = raw.workspaceRoot ?? null; commandAllowlist = new Set(raw.commandAllowlist ?? []); const storedHistory = raw.chatHistory ?? []; chatHistory = storedHistory[0]?.messages ? storedHistory : storedHistory.length ? [{ id: crypto.randomUUID(), title: 'Previous chat', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messages: storedHistory }] : [];
  } catch { /* first launch */ }
}
export async function persistState() {
  const { apiKey, apiKeys, ...publicSettings } = settings;
  const allKeys = { ...apiKeys, [settings.provider]: apiKey }; const encryptedKeys: Record<string, string> = {};
  if (safeStorage.isEncryptionAvailable()) for (const [provider, key] of Object.entries(allKeys)) if (key) encryptedKeys[provider] = safeStorage.encryptString(key).toString('base64');
  await fs.mkdir(path.dirname(statePath()), { recursive: true });
  await fs.writeFile(statePath(), JSON.stringify({ settings: publicSettings, encryptedKeys, workspaceRoot, commandAllowlist: [...commandAllowlist], chatHistory }), 'utf8');
}
export const getSettings = () => ({ ...settings });
export async function setSettings(next: Settings) { const apiKey = next.apiKey.trim(); settings = { ...next, apiKey, apiKeys: { ...settings.apiKeys, ...next.apiKeys, [next.provider]: apiKey }, baseUrl: next.baseUrl.trim(), model: next.model.trim() }; await persistState(); }
export const getWorkspaceRoot = () => workspaceRoot;
export async function setWorkspaceRoot(root: string | null) { workspaceRoot = root; await persistState(); }
export const getMode = (): PermissionMode => settings.permissionMode;
export function addAudit(entry: Omit<AuditEntry, 'id' | 'time'>) { audit.unshift({ id: crypto.randomUUID(), time: new Date().toISOString(), ...entry }); audit = audit.slice(0, 500); }
export const getAudit = () => audit;
export const commandAllowed = (cmd: string) => commandAllowlist.has(cmd);
export async function allowCommand(cmd: string) { commandAllowlist.add(cmd); await persistState(); }
export const getChatHistory = () => chatHistory;
export async function setChatHistory(history: ChatSession[]) { chatHistory = history.slice(0, 100).map(session => ({ ...session, messages: session.messages.slice(-500) })); await persistState(); }
