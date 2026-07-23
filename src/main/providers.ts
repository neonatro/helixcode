import type { ModelInfo, Provider, Settings } from '../shared/types';

const staticModels: Record<Provider, ModelInfo[]> = {
  openai: [{ id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' }, { id: 'gpt-4.1', label: 'GPT-4.1' }],
  anthropic: [{ id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' }, { id: 'claude-3-7-sonnet-latest', label: 'Claude 3.7 Sonnet' }],
  gemini: [{ id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' }, { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' }],
  openrouter: [], groq: [], ollama: [], lmstudio: [], compatible: []
};
const openRouterFreeIds = [
  'poolside/laguna-xs-2.1:free',
  'cohere/north-mini-code:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'poolside/laguna-m.1:free',
  'nvidia/nemotron-3-super-120b-a12b:free'
];
const popularPaidPrefixes = ['anthropic/claude', 'openai/gpt', 'google/gemini', 'deepseek/', 'qwen/', 'mistralai/'];
export function providerBase(settings: Settings) {
  if (settings.provider === 'ollama') {
    const base = (settings.baseUrl || 'http://localhost:11434').replace(/\/$/, '');
    return base.endsWith('/v1') ? base : `${base}/v1`;
  }
  if (settings.baseUrl) return settings.baseUrl.replace(/\/$/, '');
  return ({ openai: 'https://api.openai.com/v1', openrouter: 'https://openrouter.ai/api/v1', groq: 'https://api.groq.com/openai/v1', ollama: 'http://localhost:11434/v1', lmstudio: 'http://localhost:1234/v1', compatible: '' } as Partial<Record<Provider, string>>)[settings.provider] ?? '';
}
const codingScore = (model: ModelInfo) => {
  const text = `${model.id} ${model.label}`.toLowerCase();
  return (text.includes('coder') ? 50 : 0) + (text.includes('code') ? 35 : 0) + (text.includes('claude') ? 25 : 0) + (text.includes('gpt') ? 22 : 0) + (text.includes('gemini') ? 20 : 0) + (text.includes('qwen') ? 18 : 0) + (text.includes('deepseek') ? 16 : 0) + (model.free ? 12 : 0);
};
export async function listModels(settings: Pick<Settings, 'provider' | 'apiKey' | 'baseUrl'>): Promise<ModelInfo[]> {
  const apiKey = settings.apiKey.trim(); const auth: Record<string, string> = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
  try {
    if (settings.provider === 'anthropic') return staticModels.anthropic;
    if (settings.provider === 'gemini') {
      if (!apiKey) return staticModels.gemini;
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`); if (!r.ok) throw new Error(await r.text()); const json: any = await r.json();
      return (json.models ?? []).filter((m: any) => m.supportedGenerationMethods?.includes('generateContent')).map((m: any) => ({ id: String(m.name).replace(/^models\//, ''), label: m.displayName || m.name })).sort((a: ModelInfo,b: ModelInfo) => codingScore(b)-codingScore(a));
    }
    if (settings.provider === 'ollama') {
      const base = (settings.baseUrl || 'http://localhost:11434').replace(/\/$/, '').replace(/\/v1$/, ''); const r = await fetch(`${base}/api/tags`); if (!r.ok) throw new Error(await r.text()); const json: any = await r.json(); return (json.models ?? []).map((m: any) => ({ id: m.name, label: m.name, contextLength: m.details?.parameter_size }));
    }
    const base = providerBase(settings as Settings); if (!base) return [];
    const r = await fetch(`${base}/models`, { headers: auth }); if (!r.ok) throw new Error(await r.text()); const json: any = await r.json();
    const raw = json.data ?? json.models ?? [];
    const models: ModelInfo[] = raw.map((m: any) => ({ id: m.id, label: m.name || m.id, free: settings.provider === 'openrouter' && openRouterFreeIds.includes(String(m.id)), contextLength: m.context_length || m.context_window }));
    if (settings.provider === 'openrouter') {
      const curatedFree = openRouterFreeIds.map(id => models.find(m => m.id === id)).filter((m): m is ModelInfo => !!m);
      const paid = models.filter(m => !m.id.endsWith(':free')).sort((a, b) => {
        const popularA = popularPaidPrefixes.some(prefix => a.id.startsWith(prefix)) ? 1 : 0;
        const popularB = popularPaidPrefixes.some(prefix => b.id.startsWith(prefix)) ? 1 : 0;
        return popularB - popularA || codingScore(b) - codingScore(a) || a.label.localeCompare(b.label);
      });
      return [...curatedFree, ...paid];
    }
    return models.filter(m => !!m.id).sort((a,b) => codingScore(b)-codingScore(a) || a.label.localeCompare(b.label));
  } catch (error: any) {
    if (staticModels[settings.provider].length) return staticModels[settings.provider];
    throw new Error(`Could not load models: ${error.message || String(error)}`);
  }
}
