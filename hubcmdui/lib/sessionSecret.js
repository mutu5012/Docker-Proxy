const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SECRET_FILE = path.join(__dirname, '..', 'data', '.session-secret');
const SECRET_DIR = path.dirname(SECRET_FILE);

const RECOMMENDED_MIN_LENGTH = 32;


const BANNED_VALUES = new Set([
  'OhTq3faqSKoxbV%NJV', // 历史硬编码值，issue #102 公开，永不复用
  '',
  'change-me',
  'change-me-to-a-strong-random-token',
  'changeme',
  'change-this',
  'please-change-me',
  'secret',
  'session-secret',
  'session_secret',
  'your-secret',
  'your-secret-key',
  'your_session_secret',
  'YOUR_SESSION_SECRET',
  'my-secret',
  'mysessionsecret',
  'admin',
  'password',
  'test',
  'dev',
  'development'
]);

let logger = null;
try {
  logger = require('../logger');
} catch (e) {
  logger = null; // 软依赖：拿不到就用 console，日志不能因为模块顺序而丢失
}

function emit(level, msg) {
  const line = `[session-secret] ${msg}`;
  if (logger && typeof logger[level] === 'function') {
    logger[level](line);
    return;
  }
  const fallback = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fallback.call(console, line);
}

const BANNED_NORMALIZED = new Set([...BANNED_VALUES].map((v) => String(v).toLowerCase()));


function isBanned(value) {
  if (typeof value !== 'string') return true;
  return BANNED_NORMALIZED.has(value.trim().toLowerCase());
}

function isWeak(value) {
  if (typeof value !== 'string' || value.length < RECOMMENDED_MIN_LENGTH) return true;
  if (/^[a-z]+$/i.test(value)) return true; // 纯字母
  if (/^\d+$/.test(value)) return true; // 纯数字
  if (/^(.)\1+$/.test(value)) return true; // 全同字符
  return false;
}

function ensureSecretDir() {
  try {
    if (!fs.existsSync(SECRET_DIR)) {
      fs.mkdirSync(SECRET_DIR, { recursive: true });
    }
    return true;
  } catch (e) {
    emit('error', `无法创建目录 ${SECRET_DIR}: ${e.message}`);
    return false;
  }
}

function readPersisted() {
  try {
    if (!fs.existsSync(SECRET_FILE)) return null;
    const raw = fs.readFileSync(SECRET_FILE, 'utf8').trim();
    if (!raw) return null;
    // 文件里若残留历史公开值，同样视为无效，触发轮换
    if (isBanned(raw)) {
      emit('warn', '持久化文件中发现已公开的旧密钥，将强制轮换');
      return null;
    }
    return raw;
  } catch (e) {
    emit('warn', `读取 ${SECRET_FILE} 失败: ${e.message}`);
    return null;
  }
}

function persist(secret) {
  if (!ensureSecretDir()) return false;
  try {
    fs.writeFileSync(SECRET_FILE, secret + '\n', { mode: 0o600, encoding: 'utf8' });
    // 已存在的文件不会被 writeFileSync 改权限，显式收紧一次
    try {
      fs.chmodSync(SECRET_FILE, 0o600);
    } catch (e) {
      /* 个别文件系统（NTFS/挂载卷）不支持 chmod，忽略即可 */
    }
    return true;
  } catch (e) {
    emit('error', `写入 ${SECRET_FILE} 失败: ${e.message}`);
    return false;
  }
}

function generate() {
  return crypto.randomBytes(32).toString('hex'); // 64 字符 hex
}

/**
 * 解析本次进程应使用的会话密钥。
 *
 * @returns {{ secret: string, source: 'env'|'file'|'generated'|'ephemeral',
 *             rotated: boolean, weak: boolean }}
 *   source    env=环境变量；file=持久化文件；generated=新生成并已落盘；
 *             ephemeral=新生成但落盘失败（重启即失效）
 *   rotated   是否发生了"吊销公开值"的轮换（调用方可据此提示用户已登出）
 *   weak      密钥形态偏弱，仅用于告警
 */
function resolveSessionSecret() {
  const fromEnv = process.env.SESSION_SECRET;

  // 1) 环境变量优先，但若仍是公开值/占位符则拒绝使用，等同于吊销
  if (fromEnv && fromEnv.trim()) {
    if (isBanned(fromEnv)) {
      emit(
        'warn',
        '环境变量 SESSION_SECRET 仍是公开值或占位符，已忽略并强制轮换为随机密钥。' +
          '该值已在 GitHub 公开，继续使用等同于会话签名可被伪造。'
      );
    } else {
      const weak = isWeak(fromEnv);
      if (weak) {
        emit(
          'warn',
          `SESSION_SECRET 形态偏弱（长度 ${fromEnv.length} < ${RECOMMENDED_MIN_LENGTH} 或为单一字符类）。` +
            '建议用 openssl rand -hex 32 生成高熵随机值替换。'
        );
      }
      return { secret: fromEnv.trim(), source: 'env', rotated: false, weak };
    }
  }

  // 2) 复用持久化密钥，保证重启不登出用户
  const persisted = readPersisted();
  if (persisted) {
    return {
      secret: persisted,
      source: 'file',
      rotated: false,
      weak: isWeak(persisted)
    };
  }

  // 3) 生成新密钥并落盘。rotated=true 表示这是一次吊销性轮换，
  const fresh = generate();
  const persistedOk = persist(fresh);
  if (persistedOk) {
    emit('success', `未配置 SESSION_SECRET，已自动生成随机密钥并持久化到 ${SECRET_FILE}（权限 0600）`);
    emit(
      'warn',
      '本次为密钥轮换，已签发的旧会话 cookie 将全部失效，所有在线用户需要重新登录一次。'
    );
  } else {
    emit(
      'warn',
      '自动生成了随机密钥，但持久化失败（目录不可写？）。将退化为内存态密钥：' +
        '进程每次重启都会登出所有用户。建议挂载可写的数据卷或显式设置 SESSION_SECRET。'
    );
  }

  return {
    secret: fresh,
    source: persistedOk ? 'generated' : 'ephemeral',
    rotated: true,
    weak: false
  };
}

module.exports = {
  resolveSessionSecret,
  isBanned,
  isWeak,
  generate,
  SECRET_FILE,
  BANNED_VALUES,
  RECOMMENDED_MIN_LENGTH
};
