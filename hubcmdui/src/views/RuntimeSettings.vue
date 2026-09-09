<template>
  <div class="page runtime-page" v-loading="loading">
    <div class="runtime-shell">
      <div class="page-head">
        <div class="page-heading">
          <h2>{{ t('runtimeSettings.title') }}</h2>
          <p class="muted">{{ t('runtimeSettings.subtitle') }}</p>
        </div>
        <div class="head-actions">
          <el-button
            class="refresh-button"
            :icon="Refresh"
            :loading="loading"
            :disabled="saving || restarting"
            @click="load"
          >
            {{ t('common.refresh') }}
          </el-button>
          <el-button :disabled="loading || saving || restarting" @click="restoreDefaults">{{ t('runtimeSettings.restoreDefaults') }}</el-button>
          <el-button
            type="primary"
            class="save-button"
            :class="{ 'is-saved': saveSucceeded }"
            :icon="CircleCheck"
            :loading="saving"
            :disabled="restarting"
            @click="save"
          >
            {{ t('runtimeSettings.saveAndApply') }}
          </el-button>
        </div>
      </div>

      <el-alert
        :title="t('runtimeSettings.hotReloadNotice')"
        :description="t('runtimeSettings.hotReloadDesc')"
        type="success"
        show-icon
        :closable="false"
        class="notice"
      />

      <div class="settings-layout">
        <section class="primary-column">
          <el-card shadow="never" class="settings-card">
            <template #header>
              <div class="card-title">
                <div>
                  <strong>{{ t('runtimeSettings.hostSection') }}</strong>
                  <span>{{ t('runtimeSettings.hostSectionDesc') }}</span>
                </div>
                <el-tag type="success" effect="plain">{{ t('runtimeSettings.instant') }}</el-tag>
              </div>
            </template>

            <el-form label-position="top" class="host-form">
              <el-form-item>
                <template #label><FieldLabel field="hostName" :label="t('runtimeSettings.hostName')" /></template>
                <el-input v-model="form.hostName" clearable :placeholder="t('runtimeSettings.hostNamePlaceholder')" />
                <div class="field-help">{{ t('runtimeSettings.hostNameHelp') }}</div>
              </el-form-item>

              <el-form-item>
                <template #label><FieldLabel field="secureCookieMode" :label="t('runtimeSettings.secureCookie')" /></template>
                <el-select v-model="form.secureCookieMode" :disabled="fieldLocked('secureCookieMode')" class="full-width">
                  <el-option value="auto" :label="t('runtimeSettings.cookieAuto')" />
                  <el-option value="true" :label="t('runtimeSettings.cookieOn')" />
                  <el-option value="false" :label="t('runtimeSettings.cookieOff')" />
                </el-select>
                <div class="field-help">
                  {{ fieldLocked('secureCookieMode') ? t('runtimeSettings.cookieLocked') : t('runtimeSettings.cookieHelp') }}
                </div>
              </el-form-item>
            </el-form>
          </el-card>

          <el-card shadow="never" class="settings-card registry-card">
            <template #header>
              <div class="card-title">
                <div>
                  <strong>{{ t('runtimeSettings.registrySection') }}</strong>
                  <span>{{ t('runtimeSettings.registrySectionDesc') }}</span>
                </div>
                <el-tag type="success" effect="plain">{{ t('runtimeSettings.instantClearCache') }}</el-tag>
              </div>
            </template>

            <div class="registry-groups">
              <section class="parameter-group">
                <div class="parameter-group-head">
                  <h3>{{ t('runtimeSettings.tagReadGroup') }}</h3>
                  <p>{{ t('runtimeSettings.tagReadGroupDesc') }}</p>
                </div>
                <div class="parameter-list">
                  <NumberField field="registryTagCacheTtlMs" :label="t('runtimeSettings.tagCacheTtl')" :help="t('runtimeSettings.tagCacheTtlHelp')" :step="60000" />
                  <NumberField field="registryTagMetadataConcurrency" :label="t('runtimeSettings.metadataConcurrency')" :help="t('runtimeSettings.metadataConcurrencyHelp')" />
                  <NumberField field="registryTagsMax" :label="t('runtimeSettings.tagsMax')" :help="t('runtimeSettings.tagsMaxHelp')" :step="100" />
                </div>
              </section>

              <section class="parameter-group">
                <div class="parameter-group-head">
                  <h3>{{ t('runtimeSettings.cacheControlGroup') }}</h3>
                  <p>{{ t('runtimeSettings.cacheControlGroupDesc') }}</p>
                </div>
                <div class="parameter-list">
                  <NumberField field="registryCacheMaxEntries" :label="t('runtimeSettings.cacheMaxEntries')" :help="t('runtimeSettings.cacheMaxEntriesHelp')" :step="16" />
                  <NumberField field="registryTokenCacheMaxEntries" :label="t('runtimeSettings.tokenCacheMaxEntries')" :help="t('runtimeSettings.tokenCacheMaxEntriesHelp')" :step="16" />
                  <NumberField field="registryCacheCleanupIntervalMs" :label="t('runtimeSettings.cleanupInterval')" :help="t('runtimeSettings.cleanupIntervalHelp')" :step="10000" />
                </div>
              </section>
            </div>
          </el-card>
        </section>

        <aside class="side-column">
          <el-card shadow="never" class="settings-card startup-card">
            <template #header>
              <div class="card-title card-title-stacked">
                <div>
                  <strong>{{ t('runtimeSettings.startupSection') }}</strong>
                  <span>{{ t('runtimeSettings.startupSectionDesc') }}</span>
                </div>
                <el-tag type="warning" effect="plain">{{ t('runtimeSettings.deployManaged') }}</el-tag>
              </div>
            </template>

            <div class="startup-list">
              <div class="startup-row">
                <code>GO_PROXY_ADMIN_URL</code>
                <span class="startup-value">{{ startup.goProxyAdminUrl || '-' }}</span>
              </div>
              <div class="startup-row">
                <code>GO_PROXY_ADMIN_TOKEN</code>
                <el-tag size="small" effect="plain" :type="startup.goProxyAdminTokenConfigured ? 'success' : 'danger'">
                  {{ startup.goProxyAdminTokenConfigured ? t('runtimeSettings.configured') : t('runtimeSettings.notConfigured') }}
                </el-tag>
              </div>
              <div class="startup-row">
                <code>SESSION_SECRET</code>
                <el-tag size="small" type="info" effect="plain">{{ sessionSecretLabel }}</el-tag>
              </div>
            </div>
            <p class="security-note">{{ t('runtimeSettings.secretNote') }}</p>
          </el-card>

          <el-card shadow="never" class="settings-card danger-card">
            <template #header>
              <div class="card-title">
                <div>
                  <strong>{{ t('runtimeSettings.restartSection') }}</strong>
                  <span>{{ t('runtimeSettings.restartSectionDesc') }}</span>
                </div>
              </div>
            </template>
            <p class="restart-copy">{{ t('runtimeSettings.restartHelp') }}</p>
            <el-button class="restart-button" type="danger" plain :loading="restarting" :disabled="loading || saving" @click="restartUi">
              {{ restarting ? t('runtimeSettings.waitingRecovery') : t('runtimeSettings.restartButton') }}
            </el-button>
          </el-card>
        </aside>
      </div>

      <div class="mobile-actions">
        <div>
          <strong>{{ t('runtimeSettings.hotReloadNotice') }}</strong>
          <span>{{ t('runtimeSettings.instant') }}</span>
        </div>
        <el-button
          type="primary"
          class="save-button"
          :class="{ 'is-saved': saveSucceeded }"
          :icon="CircleCheck"
          :loading="saving"
          :disabled="loading || restarting"
          @click="save"
        >
          {{ t('runtimeSettings.saveAndApply') }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, defineComponent, h, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElFormItem, ElInputNumber, ElMessage, ElMessageBox, ElTag } from 'element-plus'
import { CircleCheck, Refresh } from '@element-plus/icons-vue'
import {
  getRuntimeSettings,
  resetRuntimeSettings,
  restartManagementUi,
  updateRuntimeSettings
} from '../services'

const { t } = useI18n()
const loading = ref(false)
const saving = ref(false)
const saveSucceeded = ref(false)
const restarting = ref(false)
const fields = ref({})
const startup = ref({})

const form = reactive({
  hostName: '', secureCookieMode: 'auto',
  registryTagCacheTtlMs: 1800000,
  registryTagMetadataConcurrency: 8,
  registryTagsMax: 5000,
  registryCacheMaxEntries: 512,
  registryTokenCacheMaxEntries: 256,
  registryCacheCleanupIntervalMs: 60000
})

function applyResponse(data) {
  Object.assign(form, data?.settings || {})
  fields.value = data?.fields || {}
  startup.value = data?.startup || {}
}

function fieldLocked(field) {
  return !!fields.value[field]?.locked
}

function sourceText(field) {
  const source = fields.value[field]?.source || 'default'
  return t(`runtimeSettings.source_${source}`)
}

const FieldLabel = defineComponent({
  props: { field: String, label: String },
  setup(props) {
    return () => h('span', { class: 'field-label' }, [
      h('span', props.label),
      h(ElTag, { size: 'small', type: fields.value[props.field]?.locked ? 'warning' : 'info', effect: 'plain' }, () => sourceText(props.field))
    ])
  }
})

const NumberField = defineComponent({
  props: { field: String, label: String, help: String, step: { type: Number, default: 1 } },
  setup(props) {
    return () => h(ElFormItem, { class: 'parameter-field' }, {
      label: () => h(FieldLabel, { field: props.field, label: props.label }),
      default: () => [
        h(ElInputNumber, {
          modelValue: form[props.field],
          'onUpdate:modelValue': value => { form[props.field] = value },
          min: fields.value[props.field]?.min,
          max: fields.value[props.field]?.max,
          step: props.step,
          controlsPosition: 'right',
          class: 'full-width'
        }),
        h('div', { class: 'field-help' }, props.help)
      ]
    })
  }
})

const sessionSecretLabel = computed(() => {
  const source = startup.value.sessionSecretSource || 'unknown'
  const key = ['env', 'file', 'generated', 'ephemeral'].includes(source) ? source : 'unknown'
  return t(`runtimeSettings.secretSource_${key}`)
})

function requiresPasswordChange(error) {
  return error.response?.data?.code === 'NEED_CHANGE_PASSWORD'
}

function requestErrorMessage(error) {
  const data = error.response?.data
  if (data?.error) return data.error
  if (data?.details) return data.details
  if (error.response?.status === 403) return t('runtimeSettings.accessDenied')
  if (error.response?.status === 401) return t('runtimeSettings.sessionExpired')
  return t('runtimeSettings.requestFailed')
}

async function load() {
  loading.value = true
  try {
    applyResponse(await getRuntimeSettings())
  } catch (error) {
    // 默认密码限制由全局响应拦截器引导到用户中心，这里不再叠加技术性 403 提示。
    if (!requiresPasswordChange(error)) {
      ElMessage.error(t('runtimeSettings.loadFailed', { msg: requestErrorMessage(error) }))
    }
  } finally {
    loading.value = false
  }
}

async function save() {
  saveSucceeded.value = false
  saving.value = true
  try {
    const result = await updateRuntimeSettings({ ...form })
    applyResponse(result)
    saveSucceeded.value = true
    window.setTimeout(() => { saveSucceeded.value = false }, 900)
    ElMessage.success(t('runtimeSettings.saved'))
  } catch (error) {
    if (!requiresPasswordChange(error)) {
      ElMessage.error(t('runtimeSettings.saveFailed', { msg: requestErrorMessage(error) }))
    }
  } finally {
    saving.value = false
  }
}

async function restoreDefaults() {
  try {
    await ElMessageBox.confirm(t('runtimeSettings.defaultsConfirm'), t('runtimeSettings.restoreDefaults'), { type: 'warning' })
    saving.value = true
    const result = await resetRuntimeSettings()
    applyResponse(result)
    ElMessage.success(t('runtimeSettings.defaultsRestored'))
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      if (!requiresPasswordChange(error)) {
        ElMessage.error(t('runtimeSettings.saveFailed', { msg: requestErrorMessage(error) }))
      }
    }
  } finally {
    saving.value = false
  }
}

async function waitForHealth() {
  const deadline = Date.now() + 90000
  let sawOffline = false
  const startedAt = Date.now()
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 1500))
    try {
      const response = await fetch('/api/health', { cache: 'no-store', credentials: 'include' })
      // 极快的本机重启可能落在两次轮询之间，未必能观察到离线窗口。
      if (response.ok && (sawOffline || Date.now() - startedAt > 5000)) return true
    } catch (_) {
      sawOffline = true
    }
  }
  return false
}

async function restartUi() {
  try {
    await ElMessageBox.confirm(t('runtimeSettings.restartConfirm'), t('runtimeSettings.restartButton'), {
      type: 'warning',
      confirmButtonText: t('runtimeSettings.restartButton'),
      cancelButtonText: t('common.cancel')
    })
    restarting.value = true
    try {
      await restartManagementUi()
    } catch (error) {
      // 自重启可能在响应完成前断开连接；网络错误继续进入健康检查，明确的 HTTP 错误则直接提示。
      if (error.response) throw error
    }
    const recovered = await waitForHealth()
    if (recovered) window.location.reload()
    else ElMessage.warning(t('runtimeSettings.recoveryTimeout'))
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      if (!requiresPasswordChange(error)) {
        ElMessage.error(t('runtimeSettings.restartFailed', { msg: requestErrorMessage(error) }))
      }
    }
  } finally {
    restarting.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.runtime-page {
  color: var(--fg);
  padding-bottom: 12px;
}

.runtime-shell {
  width: min(100%, 1440px);
  margin: 0 auto;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 16px;
}

.page-heading { min-width: 0; }
.page-head h2 { margin: 0 0 6px; font-size: 22px; line-height: 1.3; }
.page-head p { max-width: 720px; margin: 0; font-size: 13px; line-height: 1.6; }
.head-actions { display: flex; flex: 0 0 auto; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }

.refresh-button,
.save-button {
  transition: color .2s ease, background-color .2s ease, border-color .2s ease, box-shadow .2s ease;
}

.refresh-button :deep(.el-icon),
.save-button :deep(.el-icon) {
  transition: transform .32s cubic-bezier(.2, .8, .2, 1);
}

.refresh-button:not(.is-loading):hover :deep(.el-icon) { transform: rotate(180deg); }
.save-button:not(.is-loading):hover { box-shadow: 0 6px 16px color-mix(in srgb, var(--accent) 25%, transparent); }
.save-button:not(.is-loading):hover :deep(.el-icon) { transform: scale(1.12); }
.save-button.is-saved :deep(.el-icon) { animation: saved-pop .48s cubic-bezier(.2, .9, .3, 1.35); }

@keyframes saved-pop {
  0% { transform: scale(.75); }
  55% { transform: scale(1.28); }
  100% { transform: scale(1); }
}

.notice { margin-bottom: 20px; }
.notice :deep(.el-alert__content) { padding: 1px 0; }
.notice :deep(.el-alert__title) { color: var(--fg); font-size: 13px; font-weight: 650; }
.notice :deep(.el-alert__description) { margin-top: 3px; color: var(--muted); font-size: 12px; line-height: 1.55; }

.settings-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 360px);
  gap: 20px;
  align-items: start;
}

.primary-column,
.side-column {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 16px;
}

.side-column {
  position: sticky;
  top: 0;
}

.settings-card {
  overflow: hidden;
  background: var(--bg-card);
  border-color: var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow-card);
}

.settings-card :deep(.el-card__header) { padding: 17px 20px; }
.settings-card :deep(.el-card__body) { padding: 20px; }

.card-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.card-title > div { display: flex; min-width: 0; flex-direction: column; gap: 4px; }
.card-title strong { color: var(--fg); font-size: 15px; line-height: 1.35; }
.card-title span { color: var(--muted); font-size: 12px; line-height: 1.5; }
.card-title-stacked { align-items: flex-start; }

.host-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 24px;
}

.host-form :deep(.el-form-item) { margin-bottom: 0; }
.full-width { width: 100%; }

.registry-groups {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.parameter-group {
  min-width: 0;
  padding: 18px;
  background: var(--bg-card-2);
  border: 1px solid var(--border);
  border-radius: 9px;
}

.parameter-group-head {
  min-height: 54px;
  padding-bottom: 14px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--border);
}

.parameter-group-head h3 { margin: 0 0 5px; color: var(--fg); font-size: 14px; line-height: 1.4; }
.parameter-group-head p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.55; }
.parameter-list { display: flex; flex-direction: column; }
.parameter-list :deep(.parameter-field) { padding-bottom: 17px; margin-bottom: 17px; border-bottom: 1px dashed var(--border); }
.parameter-list :deep(.parameter-field:last-child) { padding-bottom: 0; margin-bottom: 0; border-bottom: 0; }

.field-help { width: 100%; margin-top: 7px; color: var(--muted); font-size: 12px; line-height: 1.55; }
:deep(.field-label) { display: inline-flex; align-items: center; gap: 8px; }
:deep(.field-label > span:first-child) { color: var(--fg-2); font-weight: 600; }
:deep(.el-input-number) { width: 100%; }

.startup-list {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 8px;
}

.startup-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 46px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}

.startup-row:last-child { border-bottom: 0; }
.startup-row code { color: var(--fg-2); font-size: 11px; font-weight: 650; word-break: break-all; }
.startup-value { min-width: 0; color: var(--muted); font-size: 12px; text-align: right; overflow-wrap: anywhere; }

.security-note,
.restart-copy {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.65;
}

.security-note {
  padding: 11px 12px;
  margin: 14px 0 0;
  background: color-mix(in srgb, var(--warning) 7%, var(--bg-card));
  border-left: 3px solid color-mix(in srgb, var(--warning) 65%, var(--border));
  border-radius: 6px;
}

.restart-copy { margin: 0 0 16px; }
.danger-card { border-color: color-mix(in srgb, var(--danger) 35%, var(--border)); }
.danger-card :deep(.el-card__header) { background: color-mix(in srgb, var(--danger) 5%, var(--bg-card)); }
.restart-button { width: 100%; min-height: 36px; }
.mobile-actions { display: none; }

@media (max-width: 1180px) {
  .settings-layout { grid-template-columns: 1fr; }
  .side-column { position: static; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 840px) {
  .registry-groups,
  .host-form,
  .side-column { grid-template-columns: 1fr; }
  .parameter-group-head { min-height: 0; }
}

@media (max-width: 720px) {
  .runtime-page { padding-bottom: 76px; }
  .page-head { flex-direction: column; gap: 14px; }
  .head-actions { width: 100%; justify-content: flex-start; }
  .head-actions .el-button { flex: 1 1 auto; margin-left: 0; }
  .head-actions .el-button--primary { display: none; }
  .notice { margin-bottom: 14px; }
  .settings-layout { gap: 14px; }
  .primary-column, .side-column { gap: 14px; }
  .settings-card :deep(.el-card__header),
  .settings-card :deep(.el-card__body) { padding: 16px; }
  .card-title { align-items: flex-start; }
  .card-title > .el-tag { flex: 0 0 auto; }
  .registry-groups { gap: 12px; }
  .parameter-group { padding: 15px; }
  .mobile-actions {
    position: fixed;
    right: 12px;
    bottom: 12px;
    left: 76px;
    z-index: 6;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    background: color-mix(in srgb, var(--bg-card) 94%, transparent);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: var(--shadow-hover);
    backdrop-filter: blur(10px);
  }
  .mobile-actions > div { display: flex; min-width: 0; flex-direction: column; gap: 2px; }
  .mobile-actions strong { color: var(--fg); font-size: 12px; }
  .mobile-actions span { color: var(--muted); font-size: 11px; }
  .mobile-actions .el-button { flex: 0 0 auto; margin-left: 0; }
}

@media (max-width: 480px) {
  .card-title { flex-direction: column; gap: 10px; }
  .head-actions .el-button { width: 100%; flex-basis: 100%; }
  .startup-row { align-items: flex-start; flex-direction: column; gap: 7px; }
  .startup-value { text-align: left; }
}

@media (prefers-reduced-motion: reduce) {
  .refresh-button,
  .save-button,
  .refresh-button :deep(.el-icon),
  .save-button :deep(.el-icon) { transition: none; }
  .refresh-button:not(.is-loading):hover :deep(.el-icon),
  .save-button:not(.is-loading):hover :deep(.el-icon) { transform: none; }
  .save-button.is-saved :deep(.el-icon) { animation: none; }
  .mobile-actions { backdrop-filter: none; }
}
</style>
