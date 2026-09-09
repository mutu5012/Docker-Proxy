/**
 * 应用全局配置文件
 */

const { resolveSessionSecret } = require('./lib/sessionSecret');

// 环境变量
const ENV = process.env.NODE_ENV || 'development';

// 会话签名密钥。
const sessionSecretInfo = resolveSessionSecret();

// 应用配置
const config = {
  // 通用配置
  common: {
    port: process.env.PORT || 3000,
    sessionSecret: sessionSecretInfo.secret,
    // 密钥来源与轮换标记，供 server.js 在启动日志中说明（不参与签名计算）
    sessionSecretMeta: {
      source: sessionSecretInfo.source,
      rotated: sessionSecretInfo.rotated,
      weak: sessionSecretInfo.weak
    },
    logLevel: process.env.LOG_LEVEL || 'info'
  },
  
  // 开发环境配置
  development: {
    debug: true,
    cors: {
      origin: '*',
      credentials: true
    },
    secureSession: false
  },
  
  // 生产环境配置
  production: {
    debug: false,
    cors: {
      origin: 'https://yourdomain.com',
      credentials: true
    },
    secureSession: true
  },
  
  // 测试环境配置
  test: {
    debug: true,
    cors: {
      origin: '*',
      credentials: true
    },
    secureSession: false,
    port: 3001
  }
};

// 导出合并后的配置
module.exports = {
  ...config.common,
  ...config[ENV],
  env: ENV
};
