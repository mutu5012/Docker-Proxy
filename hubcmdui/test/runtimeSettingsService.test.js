'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');
const path = require('node:path');

const servicePath = path.resolve(__dirname, '../services/runtimeSettingsService.js');
const ENV_KEYS = [
  'HOST_NAME', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY',
  'http_proxy', 'https_proxy', 'no_proxy', 'SECURE_COOKIE',
  'REGISTRY_TAG_CACHE_TTL_MS', 'REGISTRY_TAG_METADATA_CONCURRENCY',
  'REGISTRY_TAGS_MAX', 'REGISTRY_CACHE_MAX_ENTRIES',
  'REGISTRY_TOKEN_CACHE_MAX_ENTRIES', 'REGISTRY_CACHE_CLEANUP_INTERVAL_MS'
];

function withCleanEnvironment(fn) {
  const before = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const key of ENV_KEYS) {
        if (before[key] === undefined) delete process.env[key];
        else process.env[key] = before[key];
      }
      delete require.cache[servicePath];
    });
}

function loadService({ stored = null } = {}) {
  const calls = { saved: [], applied: [] };
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (parent && parent.filename === servicePath && request === './configServiceDB') {
      return {
        async getConfig() { return stored; },
        async saveConfig(...args) { calls.saved.push(args); }
      };
    }
    if (parent && parent.filename === servicePath && request === './registrySearchService') {
      return { applyRuntimeSettings(settings) { calls.applied.push({ ...settings }); } };
    }
    if (parent && parent.filename === servicePath && request === '../logger') {
      return { success() {}, warn() {}, error() {} };
    }
    if (parent && parent.filename === servicePath && request === '../config') {
      return { sessionSecretMeta: { source: 'file' } };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    delete require.cache[servicePath];
    return { service: require(servicePath), calls };
  } finally {
    Module._load = originalLoad;
  }
}

test('运行参数校验数字范围', async () => {
  await withCleanEnvironment(() => {
    const { service } = loadService();
    assert.throws(
      () => service.normalizeSettings({ ...service.DEFAULTS, registryTagMetadataConcurrency: 33 }),
      /1 到 32/
    );
  });
});

test('保存后写入数据库并触发 Registry 热加载', async () => {
  await withCleanEnvironment(async () => {
    const { service, calls } = loadService();
    const result = await service.save({
      registryTagsMax: 1200
    });

    assert.equal(calls.saved.length, 1);
    assert.equal(calls.saved[0][0], service.CONFIG_KEY);
    assert.equal(calls.applied.at(-1).registryTagsMax, 1200);
    assert.equal(result.settings.registryTagsMax, 1200);
  });
});

test('代理环境变量保留为部署层配置，不被系统参数保存覆盖', async () => {
  await withCleanEnvironment(async () => {
    process.env.HTTP_PROXY = 'http://proxy.local:7890';
    process.env.HTTPS_PROXY = 'http://proxy.local:7890';
    process.env.NO_PROXY = 'localhost,go-proxy,hubcmd-ui';
    const { service } = loadService();

    const result = await service.save({ registryTagsMax: 1200 });

    assert.equal(process.env.HTTP_PROXY, 'http://proxy.local:7890');
    assert.equal(process.env.HTTPS_PROXY, 'http://proxy.local:7890');
    assert.equal(process.env.NO_PROXY, 'localhost,go-proxy,hubcmd-ui');
    assert.equal(Object.hasOwn(result.settings, 'httpProxy'), false);
    assert.equal(Object.hasOwn(result.settings, 'httpsProxy'), false);
    assert.equal(Object.hasOwn(result.settings, 'noProxy'), false);
  });
});

test('数据库值优先于旧环境变量，但 SECURE_COOKIE 显式环境值保持最高优先级', async () => {
  await withCleanEnvironment(async () => {
    process.env.HOST_NAME = 'legacy-env-host';
    process.env.SECURE_COOKIE = 'true';
    const { service } = loadService({
      stored: { hostName: 'database-host', secureCookieMode: 'false' }
    });

    const result = await service.initialize();
    assert.equal(result.settings.hostName, 'database-host');
    assert.equal(result.fields.hostName.source, 'database');
    assert.equal(result.settings.secureCookieMode, 'true');
    assert.equal(result.fields.secureCookieMode.source, 'environment');
    assert.equal(result.fields.secureCookieMode.locked, true);
  });
});
