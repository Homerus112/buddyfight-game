// 전역 언어 시스템 - Zustand store 연동
import koData from './ko.json';
import enData from './en.json';

const TRANSLATIONS = { ko: koData, en: enData };

export function t(key, vars = {}, langOverride) {
  const lang = langOverride || localStorage.getItem('bf_language') || 'ko';
  const data = TRANSLATIONS[lang] || TRANSLATIONS['ko'];
  const keys = key.split('.');
  let val = data;
  for (const k of keys) {
    val = val?.[k];
    if (val === undefined) break;
  }
  if (typeof val !== 'string') return key;
  return val.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

// 카드 텍스트 번역
export function getCardText(card, lang) {
  if (!card) return '';
  const l = lang || localStorage.getItem('bf_language') || 'ko';
  if (l === 'en' || !card.text_ko) return card.text || '';
  return card.text_ko || card.text || '';
}

export { koData, enData, TRANSLATIONS };

// 엔진에서 직접 사용하는 현재 언어 취득
export function getCurrentLang() {
  try { return localStorage.getItem('bf_language') || 'ko'; } catch { return 'ko'; }
}

// 로그 메시지 번역 헬퍼
export function L(ko, en) {
  const lang = getCurrentLang();
  return lang === 'en' ? (en || ko) : ko;
}
