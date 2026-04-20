export const CARD_TYPE = { MONSTER:1, ITEM:2, SPELL:3, IMPACT:4, FLAG:5 };
export const CARD_TYPE_NAME = { 1:'Monster', 2:'Item', 3:'Spell', 4:'Impact Armor', 5:'Flag' };
export const GAME_CONFIG = {
  STARTING_LIFE: 10, STARTING_HAND: 6, DECK_MIN: 50, MAX_FIELD_SIZE: 3,
};
export const TURN_PHASE = {
  STAND: 'stand', DRAW: 'draw', CHARGE: 'charge',
  MAIN: 'main', ATTACK: 'attack', FINAL: 'final', END: 'end',
};
export const TURN_PHASE_NAME = {
  stand:'① 스탠드', draw:'② 드로우', charge:'③ 차지&드로우',
  main:'④ 메인', attack:'⑤ 어택', final:'⑥ 파이널', end:'⑦ 엔드',
};
export const CARD_STATE = { STAND:'stand', REST:'rest' };
