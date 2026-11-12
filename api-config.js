'use strict';
window.ZHIDAO_API_URL = path => {
  const base = String(window.ZHIDAO_API_BASE || '').trim().replace(/\/$/, '');
  return `${base}${path}`;
};
