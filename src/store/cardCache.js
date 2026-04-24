// 카드 데이터 전역 캐시 (App.jsx 순환 참조 방지)
let _cardsCache = null;
let _decksCache = null;

export function getCardsCache() { return _cardsCache; }
export function getDecksCache() { return _decksCache; }
export function setCardsCache(data) { _cardsCache = data; }
export function setDecksCache(data) { _decksCache = data; }
