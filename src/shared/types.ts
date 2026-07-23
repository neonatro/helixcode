export type Provider = 'openai' | 'anthropic' | 'gemini' | 'openrouter' | 'groq' | 'ollama' | 'lmstudio' | 'compatible';
export type PermissionMode = 'project' | 'extended';
export interface Settings { provider: Provider; apiKey: string; apiKeys: Partial<Record<Provider, string>>; baseUrl: string; model: string; permissionMode: PermissionMode; webSearchEnabled: boolean; reasoningEnabled: boolean; onboardingComplete: boolean; }
export interface ChatHistoryItem { id: string; role: 'user' | 'assistant' | 'reasoning' | 'tool' | 'error' | 'system'; text: string; }
export interface ChatSession { id: string; title: string; createdAt: string; updatedAt: string; messages: ChatHistoryItem[]; }
export interface ModelInfo { id: string; label: string; free?: boolean; contextLength?: number; }
export interface FileNode { name: string; path: string; type: 'file' | 'directory'; children?: FileNode[]; }
export interface AuditEntry { id: string; time: string; tool: string; target: string; approved: 'automatic' | 'confirmed' | 'blocked'; detail?: string; }
export interface ToolRequest { id: string; tool: string; args: Record<string, unknown>; reason?: string; }
export interface ToolResult { content: string; error?: boolean; }
export interface AgentEvent { type: 'text' | 'reasoning' | 'tool' | 'tool-result' | 'done' | 'error'; content?: string; request?: ToolRequest; result?: ToolResult; }
export interface HelixApi {
  chooseFolder(): Promise<string | null>; closeWorkspace(): Promise<void>; getWorkspaceRoot(): Promise<string | null>; getTree(path?: string): Promise<FileNode[]>; readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>; renamePath(oldPath: string, newPath: string): Promise<void>;
  createPath(path: string, directory: boolean): Promise<void>; deletePath(path: string): Promise<void>;
  getSettings(): Promise<Settings>; saveSettings(settings: Settings): Promise<void>; getAudit(): Promise<AuditEntry[]>;
  getChatHistory(): Promise<ChatSession[]>; saveChatHistory(history: ChatSession[]): Promise<void>;
  listModels(settings: Pick<Settings, 'provider' | 'apiKey' | 'baseUrl'>): Promise<ModelInfo[]>;
  respondTool(id: string, result: ToolResult): void; onAgentEvent(callback: (event: AgentEvent) => void): () => void;
  startAgent(message: string, history: { role: 'user' | 'assistant'; content: string }[]): Promise<void>; cancelAgent(): Promise<void>;
  minimizeWindow(): void; toggleMaximizeWindow(): void; closeWindow(): void; openExternal(url: string): Promise<void>;
}
