const path = require('path');
const fs = require('fs');
const session = require('express-session');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'sessions.db');

let logger = null;
try {
  logger = require('../logger');
} catch (e) {
  logger = null;
}

function emit(level, msg) {
  const line = `[session-store] ${msg}`;
  if (logger && typeof logger[level] === 'function') {
    logger[level](line);
    return;
  }
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn.call(console, line);
}

/**
 * 创建会话存储。
 *
 * @returns {object|null} SQLiteStore 实例；初始化失败时返回 null，
 *                        调用方把 null 传给 express-session 即回落默认 MemoryStore。
 */
function createSessionStore() {
  try {
    const SQLiteStore = require('connect-sqlite3')(session);
    const sqlite3 = require('sqlite3');

    // 必须在打开连接之前建好目录（见文件头"时序坑"说明）
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    const db = new sqlite3.Database(DB_FILE);

    // 异步错误（权限、磁盘满、锁冲突）不监听会变成未捕获异常
    db.on('error', (err) => {
      emit('error', `SQLite 连接错误: ${err && err.message ? err.message : err}`);
    });

    emit('success', `会话已启用持久化存储: ${DB_FILE}`);
    return new SQLiteStore({ db, table: 'sessions' });
  } catch (e) {
    // 走到这里通常是 require 失败（原生模块未编译）或目录不可写
    emit(
      'warn',
      `初始化 SQLiteStore 失败，退回 MemoryStore（重启将登出所有用户）: ${e && e.message ? e.message : e}`
    );
    return null;
  }
}

module.exports = {
  createSessionStore,
  DATA_DIR,
  DB_FILE
};
