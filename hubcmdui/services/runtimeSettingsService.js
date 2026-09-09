'use strict';

const logger = require('../logger');
const configServiceDB = require('./configServiceDB');

const CONFIG_KEY = 'runtimeSettings';

const DEFAULTS = Object.freeze({
  hostName: '',
  secureCookieMode: 'auto',
  registryTagCacheTtlMs: 30 * 60 * 1000,
  registryTagMetadataConcurrency: 8,
  registryTagsMax: 5000,
  registryCacheMaxEntries: 512,
  registryTokenCacheMaxEntries: 256,
  registryCacheCleanupIntervalMs: 60 * 1000
});

const ENV_MAP = Object.freeze({
  hostName: 'HOST_NAME',
  registryTagCacheTtlMs: 'REGISTRY_TAG_CACHE_TTL_MS',
  registryTagMetadataConcurrency: 'REGISTRY_TAG_METADATA_CONCURRENCY',
  registryTagsMax: 'REGISTRY_TAGS_MAX',
  registryCacheMaxEntries: 'REGISTRY_CACHE_MAX_ENTRIES',
  registryTokenCacheMaxEntries: 'REGISTRY_TOKEN_CACHE_MAX_ENTRIES',
  registryCacheCleanupIntervalMs: 'REGISTRY_CACHE_CLEANUP_INTERVAL_MS'
});

const FIELD_META = Object.freeze({
  hostName: { type: 'string', hotReloadable: true, requiresRestart: false },
  secureCookieMode: { type: 'enum', values: ['auto', 'true', 'false'], hotReloadable: true, requiresRestart: false },
  registryTagCacheTtlMs: { type: 'integer', min: 60 * 1000, max: 24 * 60 * 60 * 1000, hotReloadable: true, requiresRestart: false },
  registryTagMetadataConcurrency: { type: 'integer', min: 1, max: 32, hotReloadable: true, requiresRestart: false },
  registryTagsMax: { type: 'integer', min: 100, max: 20000, hotReloadable: true, requiresRestart: false },
  registryCacheMaxEntries: { type: 'integer', min: 16, max: 5000, hotReloadable: true, requiresRestart: false },
  registryTokenCacheMaxEntries: { type: 'integer', min: 16, max: 5000, hotReloadable: true, requiresRestart: false },
  registryCacheCleanupIntervalMs: { type: 'integer', min: 10 * 1000, max: 60 * 60 * 1000, hotReloadable: true, requiresRestart: false }
});

let currentSettings = { ...DEFAULTS };
let currentSources = Object.fromEntries(Object.keys(DEFAULTS).map(key => [key, 'default']));
let initialized = false;
let registrySettingsAdapter = null;

function getRegistrySettingsAdapter() {
  if (!registrySettingsAdapter) {
    // 延迟加载，避免 runtimeSettingsService 与 registrySearchService 形成模块循环依赖。
    registrySettingsAdapter = require('./registrySearchService');
  }
  return registrySettingsAdapter;
}

function hasEnv(name) {
  return Object.prototype.hasOwnProperty.call(process.env, name) && String(process.env[name]).trim() !== '';
}

function normalizeSecureCookieEnv() {
  if (!hasEnv('SECURE_COOKIE')) return null;
  const value = String(process.env.SECURE_COOKIE).trim().toLowerCase();
  return value === 'true' || value === 'false' ? value : null;
}

function parseInteger(value, field, fallback) {
  const meta = FIELD_META[field];
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < meta.min || parsed > meta.max) {
    throw new Error(`${field} 必须是 ${meta.min} 到 ${meta.max} 之间的整数`);
  }
  return parsed ?? fallback;
}

function normalizeSettings(input, base = DEFAULTS) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('配置必须是对象');
  }

  const merged = { ...base, ...input };
  const hostName = String(merged.hostName == null ? '' : merged.hostName).trim();
  if (hostName.length > 253 || /[\u0000-\u001f\u007f]/.test(hostName)) {
    throw new Error('hostName 不能超过 253 个字符且不能包含控制字符');
  }

  const secureCookieMode = String(merged.secureCookieMode || 'auto').toLowerCase();
  if (!FIELD_META.secureCookieMode.values.includes(secureCookieMode)) {
    throw new Error('secureCookieMode 只能是 auto、true 或 false');
  }

  return {
    hostName,
    secureCookieMode,
    registryTagCacheTtlMs: parseInteger(merged.registryTagCacheTtlMs, 'registryTagCacheTtlMs'),
    registryTagMetadataConcurrency: parseInteger(merged.registryTagMetadataConcurrency, 'registryTagMetadataConcurrency'),
    registryTagsMax: parseInteger(merged.registryTagsMax, 'registryTagsMax'),
    registryCacheMaxEntries: parseInteger(merged.registryCacheMaxEntries, 'registryCacheMaxEntries'),
    registryTokenCacheMaxEntries: parseInteger(merged.registryTokenCacheMaxEntries, 'registryTokenCacheMaxEntries'),
    registryCacheCleanupIntervalMs: parseInteger(merged.registryCacheCleanupIntervalMs, 'registryCacheCleanupIntervalMs')
  };
}

function readEnvironmentSettings() {
  const values = {};
  const sources = {};
  for (const [field, envName] of Object.entries(ENV_MAP)) {
    if (!hasEnv(envName)) continue;
    values[field] = process.env[envName];
    sources[field] = 'environment';
  }
  const secureCookieMode = normalizeSecureCookieEnv();
  if (secureCookieMode) {
    values.secureCookieMode = secureCookieMode;
    sources.secureCookieMode = 'environment';
  }
  return { values, sources };
}

function applySettings(settings) {
  currentSettings = { ...settings };

  try {
    const registrySearchService = getRegistrySettingsAdapter();
    if (typeof registrySearchService.applyRuntimeSettings === 'function') {
      registrySearchService.applyRuntimeSettings(settings);
    }
  } catch (error) {
    logger.warn('应用 Registry 运行参数失败:', error.message);
  }
}

async function initialize() {
  const env = readEnvironmentSettings();
  let stored = null;
  try {
    stored = await configServiceDB.getConfig(CONFIG_KEY);
  } catch (error) {
    logger.warn('读取运行参数失败，将使用环境变量和内置默认值:', error.message);
  }

  const storedObject = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  const candidate = { ...DEFAULTS, ...env.values, ...storedObject };

  // SECURE_COOKIE 是部署层安全兜底；显式设置后始终高于数据库配置。
  const secureCookieEnv = normalizeSecureCookieEnv();
  if (secureCookieEnv) candidate.secureCookieMode = secureCookieEnv;

  let normalized;
  try {
    normalized = normalizeSettings(candidate);
  } catch (error) {
    logger.warn('已保存的运行参数无效，将回退到安全默认值:', error.message);
    normalized = normalizeSettings({ ...DEFAULTS, ...env.values });
    if (secureCookieEnv) normalized.secureCookieMode = secureCookieEnv;
  }

  currentSources = {};
  for (const key of Object.keys(DEFAULTS)) {
    if (key === 'secureCookieMode' && secureCookieEnv) currentSources[key] = 'environment';
    else if (Object.prototype.hasOwnProperty.call(storedObject, key)) currentSources[key] = 'database';
    else if (env.sources[key]) currentSources[key] = 'environment';
    else currentSources[key] = 'default';
  }

  applySettings(normalized);
  initialized = true;
  logger.success('运行参数已加载并应用');
  return getPublicSettings();
}

async function save(input) {
  const next = normalizeSettings(input, currentSettings);
  const secureCookieEnv = normalizeSecureCookieEnv();
  if (secureCookieEnv) next.secureCookieMode = secureCookieEnv;

  await configServiceDB.saveConfig(CONFIG_KEY, next, 'Hubcmd UI runtime settings');
  currentSources = Object.fromEntries(Object.keys(DEFAULTS).map(key => [key, 'database']));
  if (secureCookieEnv) currentSources.secureCookieMode = 'environment';
  applySettings(next);
  return getPublicSettings();
}

async function resetToDefaults() {
  const next = { ...DEFAULTS };
  const secureCookieEnv = normalizeSecureCookieEnv();
  if (secureCookieEnv) next.secureCookieMode = secureCookieEnv;
  await configServiceDB.saveConfig(CONFIG_KEY, next, 'Hubcmd UI runtime settings');
  currentSources = Object.fromEntries(Object.keys(DEFAULTS).map(key => [key, 'database']));
  if (secureCookieEnv) currentSources.secureCookieMode = 'environment';
  applySettings(next);
  return getPublicSettings();
}

function get(key) {
  return currentSettings[key];
}

function getSecureCookieMode() {
  return normalizeSecureCookieEnv() || currentSettings.secureCookieMode || 'auto';
}

function getPublicSettings() {
  const secureCookieLocked = Boolean(normalizeSecureCookieEnv());
  const fields = {};
  for (const [key, meta] of Object.entries(FIELD_META)) {
    fields[key] = {
      ...meta,
      source: currentSources[key] || 'default',
      locked: key === 'secureCookieMode' && secureCookieLocked
    };
  }
  return {
    initialized,
    settings: { ...currentSettings, secureCookieMode: getSecureCookieMode() },
    fields,
    startup: {
      goProxyAdminUrl: process.env.GO_PROXY_ADMIN_URL || 'http://go-proxy:5001',
      goProxyAdminTokenConfigured: Boolean(process.env.GO_PROXY_ADMIN_TOKEN),
      sessionSecretSource: (() => {
        try {
          return require('../config').sessionSecretMeta?.source || 'unknown';
        } catch (_) {
          return process.env.SESSION_SECRET ? 'environment' : 'unknown';
        }
      })()
    }
  };
}

// 在数据库初始化前，先让旧部署中的环境变量继续生效。
try {
  const env = readEnvironmentSettings();
  const bootSettings = normalizeSettings({ ...DEFAULTS, ...env.values });
  const secureCookieEnv = normalizeSecureCookieEnv();
  if (secureCookieEnv) bootSettings.secureCookieMode = secureCookieEnv;
  currentSources = { ...currentSources, ...env.sources };
  applySettings(bootSettings);
} catch (error) {
  logger.warn('启动期运行参数解析失败，暂时使用内置默认值:', error.message);
}

module.exports = {
  CONFIG_KEY,
  DEFAULTS,
  FIELD_META,
  initialize,
  save,
  resetToDefaults,
  get,
  getSecureCookieMode,
  getPublicSettings,
  normalizeSettings,
  applySettings
};
