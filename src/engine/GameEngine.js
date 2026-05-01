import { parseCost, canPayCost, payCost, canCastSpell, parseSpellEffect, isCounterSpell } from './CostSystem.js';
import { L } from '../i18n/useI18n.js';
import { applyEnterEffect, parsePhaseTrigger, applyActEffect, parsePreventDestroyEffect } from './MonsterEffects.js';
import { GAME_CONFIG, TURN_PHASE, CARD_TYPE, CARD_STATE } from '../utils/constants.js';

export function shuffleDeck(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

export function createCardInstance(cardData, owner) {
  return {
    ...cardData,
    instanceId: `${cardData.id}_${Math.random().toString(36).substr(2, 9)}`,
    owner, state: CARD_STATE.STAND, soul: [], counters: 0,
  };
}

export function createPlayerState(id, deckCards, flagCard, buddyCard, sleeve=null) {
  const deckFiltered = shuffleDeck(
    deckCards.filter(c => c.type !== 5).map(c => createCardInstance(c, id))
  );
  const hand = deckFiltered.splice(0, GAME_CONFIG.STARTING_HAND);
  const gauge = deckFiltered.splice(0, 2);
  return {
    id, life: GAME_CONFIG.STARTING_LIFE, gauge, deck: deckFiltered,
    hand, drop: [],
    field: { left: null, center: null, right: null },
    item: null,
    flag: flagCard ? createCardInstance(flagCard, id) : null,
    buddy: buddyCard ? createCardInstance(buddyCard, id) : null,
    buddyZone: null, buddyCalledThisTurn: false, hasAttackedThisTurn: false,
    buddyCalled: false,
    sleeve,              // 덱 슬리브 (0 또는 1)
    attackedZones: [],
  };
}

export function createInitialGameState(pDeck, pFlag, pBuddy, aDeck, aFlag, aBuddy, pSleeve=0, aSleeve=0) {
  const firstPlayer = Math.random() < 0.5 ? 'player' : 'ai';
  return {
    phase: TURN_PHASE.STAND, turn: 1, activePlayer: firstPlayer, isFirstTurn: true,
    goFirstPlayer: firstPlayer,
    player: createPlayerState('player', pDeck, pFlag, pBuddy, pSleeve),
    ai: createPlayerState('ai', aDeck, aFlag, aBuddy, aSleeve),
    log: ['🎮 게임 시작! 첫 턴 드로우 불가.'],
    winner: null, attackingCard: null,
    // 링크어택: 이번 어택 페이즈에서 대기 중인 공격 카드들
    linkAttackQueue: [],
    pendingDamage: 0, // 링크어택 누적 데미지
  };
}

export function getFieldTotalSize(field) {
  return Object.values(field).filter(Boolean).reduce((s, c) => s + (c.size ?? 0), 0);
}

export function getEmptyZones(field) {
  return ['left','center','right'].filter(z => !field[z]);
}

// 키워드 체크
export function hasKW(card, kw) {
  if (!card) return false;
  if ((card.text || '').toLowerCase().includes(`[${kw.toLowerCase()}]`)) return true;
  if (card._conditionalKws && card._conditionalKws.some(k => k.toLowerCase() === kw.toLowerCase())) return true;
  // 스펠 효과로 임시 부여된 키워드
  if (kw.toLowerCase() === 'counterattack' && card._counterattack) return true;
  return false;
}

// ── 페이즈 액션들 ──────────────────────────────────

export function doStandPhase(state) {
  const ap = state.activePlayer;
  const p = state[ap];
  const newField = {};
  for (const z of ['left','center','right']) {
    const fc = p.field[z];
    if (!fc) { newField[z] = null; continue; }
    // 이번 턴 버프 리셋: _buffed 플래그 있으면 원본 스탯 복원
    const resetCard = fc._buffed ? {
      ...fc,
      power: fc._basePower ?? fc._origPower ?? fc.power,
      defense: fc._origDefense ?? fc.defense,
      critical: fc._origCritical ?? fc.critical,
      _buffed: undefined,
      _setBuffed: undefined,
      _origPower: undefined,
      _origDefense: undefined,
      _origCritical: undefined,
      _counterattack: undefined,
      _contBuffFrom: undefined,
      _basePower: undefined,
    } : fc;
    newField[z] = { ...resetCard, state: CARD_STATE.STAND, _extraAttacksUsed: undefined };
  }
  const _standResult = {
    ...state,
    [ap]: { ...p, field: newField, item: p.item ? { ...p.item, state: CARD_STATE.STAND, _extraAttacksUsed: undefined } : null,
             hasAttackedThisTurn: false, buddyCalledThisTurn: false, attackedZones: [] },
    attackingCard: null, linkAttackQueue: [], pendingDamage: 0,
    firstTurnAttackCount: 0,    // 선공 첫 턴 공격 횟수
    firstTurnMonsterCount: 0,   // 선공 첫 턴 소환 횟수
    // setZone은 세트 카드가 제거될 때까지 유지 (리셋 안 함)
    log: [...state.log, L(L(`[${ap==='player'?'나':'AI'}] ① 스탠드`,`[${ap==='player'?'Me':'AI'}] ① Stand`),`[${ap==='player'?'Me':'AI'}] ① Stand`)],
  };
  // ── [Cont] 지속 효과 적용 ─────────────────────────────
  // 필드의 모든 카드를 순회하며 Cont 효과(필드 버프)를 적용
  let contResult = { ..._standResult };
  const contAp = contResult.activePlayer;
  const contSides = ['player', 'ai'];
  for (const side of contSides) {
    const sideP = contResult[side];
    let newFieldCont = { ...sideP.field };
    // 각 카드의 [Cont] 효과 적용
    for (const srcZone of ['left','center','right']) {
      const srcCard = sideP.field[srcZone];
      if (!srcCard) continue;
      const txt = srcCard.text || '';
      if (!/\[Cont\]/i.test(txt)) continue;
      // "All «TRIBE» on your field get power+N" 패턴
      const tribeBuffM = txt.match(/[Aa]ll\s+«([^»]+)»\s+(?:monsters?\s+)?on\s+your\s+field.*?get\s+power\+(\d+)/i);
      if (tribeBuffM) {
        const tribe = tribeBuffM[1].toLowerCase();
        const buffPow = parseInt(tribeBuffM[2]);
        const defBuffM = txt.match(/defense\+(\d+)/i);
        const buffDef = defBuffM ? parseInt(defBuffM[1]) : 0;
        for (const tz of ['left','center','right']) {
          const tc = newFieldCont[tz];
          if (!tc) continue;
          const tcTribe = (tc.tribe||'').toLowerCase();
          if (tcTribe.includes(tribe) || tribe.includes(tcTribe.split('/')[0])) {
            newFieldCont[tz] = {
              ...tc,
              power: (tc._basePower ?? tc.power) + buffPow,
              defense: (tc._origDefense ?? tc.defense) + buffDef,
              _basePower: tc._basePower ?? tc.power,
              _contBuffFrom: srcCard.name,
            };
          }
        }
      }
      // "All monsters on your field get power+N" (종족 무관)
      const allBuffM = txt.match(/[Aa]ll\s+monsters?\s+on\s+your\s+field\s+get\s+power\+(\d+)/i);
      if (allBuffM && !tribeBuffM) {
        const buffPow2 = parseInt(allBuffM[1]);
        for (const tz of ['left','center','right']) {
          const tc = newFieldCont[tz];
          if (!tc) continue;
          newFieldCont[tz] = {
            ...tc,
            power: (tc._basePower ?? tc.power) + buffPow2,
            _basePower: tc._basePower ?? tc.power,
            _contBuffFrom: srcCard.name,
          };
        }
      }
    }
    contResult = { ...contResult, [side]: { ...sideP, field: newFieldCont } };
  }
  return evaluateConditionalKeywords(contResult);
}

export function doDrawPhase(state) {
  const ap = state.activePlayer;
  if (state.isFirstTurn && ap === 'player')
    return { ...state, log: [...state.log, '첫 턴 드로우 불가!'] };
  const p = state[ap];
  if (p.deck.length === 0)
    return { ...state, winner: ap==='player'?'ai':'player', log: [...state.log, `[${ap}] 덱 아웃!`] };
  return {
    ...state,
    [ap]: { ...p, deck: p.deck.slice(1), hand: [...p.hand, p.deck[0]] },
    log: [...state.log, `[${ap==='player'?'나':'AI'}] ② 드로우`],
  };
}

// AI용: 덱 상단 → 게이지, 덱 → 드로우
export function doChargeAndDraw(state) {
  const ap = state.activePlayer;
  const p = state[ap];
  let deck = [...p.deck], gauge = [...p.gauge], hand = [...p.hand], drop = [...p.drop];
  let field = { ...p.field };
  const logs = [];
  if (deck.length > 0) { gauge.push(deck.shift()); logs.push(L(`[${ap==='player'?'나':'AI'}] 차지 ⚡${gauge.length}`,`[${ap==='player'?'Me':'AI'}] Charge ⚡${gauge.length}`)); }
  if (deck.length > 0) { hand.push(deck.shift()); logs.push(L(`드로우 🃏${hand.length}`,`Draw 🃏${hand.length}`)); }
  return { ...state, [ap]: { ...p, deck, gauge, hand, drop, field }, log: [...state.log, ...logs] };
}

// 플레이어용: 손패 카드 → 게이지
export function chargeFromHand(state, instanceId) {
  const p = state.player;
  const idx = p.hand.findIndex(c => c.instanceId === instanceId);
  if (idx === -1) return state;
  const card = p.hand[idx];
  const newHand = [...p.hand]; newHand.splice(idx, 1);
  const newGauge = [...p.gauge, card];
  return {
    ...state,
    player: { ...p, hand: newHand, gauge: newGauge },
    log: [...state.log, `[나] ${card.name} → 게이지 ⚡${newGauge.length}`],
  };
}

// 플레이어용: 덱에서 1장 드로우
export function drawOne(state) {
  const p = state.player;
  if (p.deck.length === 0) return { ...state, log: [...state.log, '덱이 비어 드로우 불가'] };
  const drawn = p.deck[0];
  return {
    ...state,
    player: { ...p, deck: p.deck.slice(1), hand: [...p.hand, drawn] },
    log: [...state.log, `[나] 드로우 🃏${p.hand.length + 1}`],
  };
}

export function callMonster(state, instanceId, zone) {
  const ap = state.activePlayer;
  const p = state[ap];
  const idx = p.hand.findIndex(c => c.instanceId === instanceId);
  if (idx === -1) return state;
  const card = p.hand[idx];
  if (card.type !== CARD_TYPE.MONSTER) return state;
  // 선공 첫 턴: 몬스터 1마리 제한 (플레이어+AI 모두)
  if (state.isFirstTurn && state.firstTurnMonsterCount >= 1)
    return { ...state, log: [...state.log, '❌ 첫 턴에는 몬스터 1마리만 소환 가능!'] };
  // 소환 코스트 체크 (플레이어+AI 모두)
  const callCost = parseCost(card.text);
  if (callCost) {
    const check = canPayCost(p, callCost);
    if (!check.ok) {
      if (ap === 'player')
        return { ...state, log: [...state.log, `❌ 코스트 부족: ${check.errors.join(', ')}`] };
      // AI: 코스트 부족 시 소환 스킵 (에러 없이)
      return state;
    }
  }
  // [Set] 상대 센터 소환 불가 체크
  if (zone === 'center' && p._cannotCallCenter)
    return { ...state, log: [...state.log, `❌ 세트 카드 효과로 센터 소환 불가`] };
  // 존 제한 체크 (may only be called to left/right/center)
  if (zone && (card.text||'').match(/may\s+only\s+be\s+called\s+to\s+the\s+(\w+)/i)) {
    const allowed = card.text.match(/may\s+only\s+be\s+called\s+to\s+the\s+(\w+)/i)[1].toLowerCase();
    if (allowed !== zone) return { ...state, log: [...state.log, `❌ ${card.name}은 ${allowed}에만 소환 가능`] };
  }
  // 소환 조건 체크: "you may only call this card if you have a card with X"
  const callCondM = (card.text||'').match(/[Yy]ou may only call this card if you have a card with [""«]([^""»]+)[""»] in its card name/i)
                 || (card.text||'').match(/[Yy]ou may only call this card if ([^.!\n]+)/i);
  if (callCondM && ap === 'player') {
    const cond = callCondM[1]?.trim().toLowerCase() || '';
    // "card name" 조건
    const nameKwM = callCondM[0].match(/card with [""«]([^""»]+)[""»] in its card name/i);
    if (nameKwM) {
      const kw = nameKwM[1].trim().toLowerCase();
      const hasIt = Object.values(p.field).some(c => c && (c.name||'').toLowerCase().includes(kw));
      if (!hasIt) return { ...state, log: [...state.log, `❌ 소환 조건 미충족: 필드에 "${nameKwM[1]}" 필요`] };
    }
    // "monster on your field" 조건 등 기타
    else if (/monster on (?:your|the) field/.test(cond)) {
      const hasMonster = Object.values(p.field).some(c => c && c !== card && c.type === 1);
      if (!hasMonster) return { ...state, log: [...state.log, `❌ 소환 조건 미충족: 필드에 몬스터 필요`] };
    }
  }
  const curSize = getFieldTotalSize(p.field);
  const newSize = curSize + (card.size ?? 0);
  if (newSize > GAME_CONFIG.MAX_FIELD_SIZE)
    return { ...state, log: [...state.log, `❌ 사이즈 초과! (${curSize}+${card.size??0}>3)`] };
  const oldCard = p.field[zone];
  const newHand = [...p.hand]; newHand.splice(idx, 1);
  // 코스트 지불
  let updatedP = { ...p, hand: newHand };
  if (callCost) updatedP = payCost(updatedP, callCost);
  const costLog = callCost
    ? ` (코스트: ${callCost.gauge ? `게이지-${callCost.gauge}` : ''}${callCost.life ? ` 라이프-${callCost.life}` : ''}${callCost.soulFromDeck ? ` 소울+${callCost.soulFromDeck}` : ''})`
    : '';

  // 버디 콜 감지: 처음 소환 시 라이프 +1
  const isBuddyCall = ap === 'player'
    && updatedP.buddy
    && updatedP.buddy.id === card.id
    && !updatedP.buddyCalled;

  const finalP = isBuddyCall
    ? { ...updatedP, life: Math.min(updatedP.life + 1, 30), buddyCalled: true }
    : updatedP;

  const buddyLog = isBuddyCall ? [`🌟 버디 콜! ${card.name} 소환! 라이프 +1 → ${finalP.life}`] : [];

  // 소울 처리: payCost에서 _pendingSoul로 보관된 카드를 카드 소울에 추가
  const soulCards = finalP._pendingSoul || [];
  const finalP2 = soulCards.length > 0 ? { ...finalP, _pendingSoul: undefined } : finalP;
  const cardWithSoul = soulCards.length > 0
    ? { ...card, state: CARD_STATE.STAND, soul: [...(card.soul||[]), ...soulCards] }
    : { ...card, state: CARD_STATE.STAND };

  const result = {
    ...state,
    [ap]: { ...finalP2,
             field: { ...finalP2.field, [zone]: cardWithSoul },
             drop: oldCard ? [...finalP2.drop, oldCard] : finalP2.drop },
    firstTurnMonsterCount: state.isFirstTurn ? (state.firstTurnMonsterCount||0)+1 : state.firstTurnMonsterCount,
    buddyCallPopup: isBuddyCall ? card.name : null,
    log: [...state.log, ...buddyLog, `[${ap==='player'?'나':'AI'}] ${card.name} → ${zone}${costLog}${soulCards.length?` 소울+${soulCards.length}`:''} (Sz합계${newSize})`],
  };

  // ✅ fix68: Ride 효과 처리 - [Ride]로 소환 시 기존 카드 위에 탑승
  // "[Ride] [소환조건]" - callCost에 Ride 코스트가 있으면 기존 카드를 소울에 추가
  const isRide = /\[Ride\]/i.test(card.text || '') && oldCard;
  if (isRide) {
    // 기존 카드를 드롭 대신 소울에 추가 (Ride는 드롭 아님)
    const rideCard = { ...cardWithSoul, soul: [...(cardWithSoul.soul||[]), oldCard] };
    const rideResult = {
      ...result,
      [ap]: { ...result[ap], field: { ...result[ap].field, [zone]: rideCard },
        drop: result[ap].drop.filter(c => c.instanceId !== oldCard.instanceId) },
      log: [...result.log, `🏇 Ride! ${oldCard.name} → ${card.name}의 소울`],
      // Ride 상태 추적
      _ridePairs: { ...(state._ridePairs||{}), [ap]: { rider: card.id, ridden: oldCard.id, zone } },
    };
    return applyEnterEffect(rideResult, card, ap);
  }

  const resultWithEnter = applyEnterEffect(result, card, ap);
  // taunt 효과: 상대 공격 시 이 카드로 타겟 변경
  if ((card.text||'').toLowerCase().includes('change the target of the attack to this')) {
    return { ...resultWithEnter, tauntZone: { side: ap, zone } };
  }
  return resultWithEnter;
}

export function equipItem(state, instanceId) {
  const ap = state.activePlayer;
  const p = state[ap];
  const idx = p.hand.findIndex(c => c.instanceId === instanceId);
  if (idx === -1) return state;
  const card = p.hand[idx];
  if (card.type !== CARD_TYPE.ITEM) return state;
  // 선공 첫 턴: 아이템 포함 1회 제한 (플레이어+AI 모두)
  if (state.isFirstTurn && (state.firstTurnMonsterCount || 0) >= 1)
    return { ...state, log: [...state.log, '❌ 첫 턴에는 몬스터/아이템 합쳐 1회만!'] };
  // 장착 코스트 체크
  if (ap === 'player') {
    const cost = parseCost(card.text);
    if (cost) {
      const check = canPayCost(p, cost);
      if (!check.ok)
        return { ...state, log: [...state.log, `❌ 코스트 부족: ${check.errors.join(', ')}`] };
    }
  }
  const newHand = [...p.hand]; newHand.splice(idx, 1);
  let updatedP = { ...p, hand: newHand };
  if (ap === 'player') {
    const cost = parseCost(card.text);
    if (cost) updatedP = payCost(updatedP, cost);
  }
  // 버디 콜 감지 (아이템 버디)
  const isItemBuddyCall = ap === 'player'
    && updatedP.buddy
    && updatedP.buddy.id === card.id
    && updatedP.buddy.type === CARD_TYPE.ITEM
    && !updatedP.buddyCalled;

  const finalP2 = isItemBuddyCall
    ? { ...updatedP, life: Math.min(updatedP.life + 1, 30), buddyCalled: true }
    : updatedP;

  const buddyLog2 = isItemBuddyCall ? [`🌟 버디 콜! ${card.name} 장착! 라이프 +1 → ${finalP2.life}`] : [];

  // Shadow Dive 처리: 이 아이템을 장착한 플레이어 필드에 Shadow Dive 활성화
  const hasShadowDive = /"shadow\s+dive"|this\s+card\s+can\s+attack.*?even\s+if/i.test(card.text||'');

  let equipResult = {
    ...state,
    [ap]: { ...finalP2,
      item: { ...card, state: CARD_STATE.STAND, _shadowDive: hasShadowDive },
      drop: p.item ? [...finalP2.drop, p.item] : finalP2.drop },
    buddyCallPopup: isItemBuddyCall ? card.name : null,
    firstTurnMonsterCount: state.isFirstTurn ? (state.firstTurnMonsterCount||0)+1 : state.firstTurnMonsterCount,
    log: [...state.log, ...buddyLog2, `[${ap==='player'?'나':'AI'}] ${card.name} 장착`],
  };
  // 비공격 데미지 감소 아이템 효과 설정
  if (/damage.*?(?:other than|except).*?attacks?.*?reduc|damage dealt to you.*?(?:other|except).*?reduc/i.test(card.text||'')) {
    const _rm = (card.text||'').match(/reduced?\s+by\s+(\d+)/i);
    if (_rm) equipResult = { ...equipResult, [ap]: { ...equipResult[ap], item: { ...equipResult[ap].item, _nonAttackReduce: parseInt(_rm[1]) } } };
  }
  // 아이템 장착 시 enterEffect 적용
  const itemEnterEffect = applyEnterEffect(equipResult, card, 'item', ap);
  if (itemEnterEffect !== equipResult) equipResult = itemEnterEffect;
  return equipResult;
}

// ── 공격 선언 ──────────────────────────────────────
export function declareAttack(state, attackerZone) {
  const ap = state.activePlayer;
  const p = state[ap];
  const def = ap === 'player' ? 'ai' : 'player';
  const attacker = attackerZone === 'item' ? p.item : p.field[attackerZone];
  if (!attacker || attacker.state === CARD_STATE.REST) return state;

  // 아이템: 내 센터에 몬스터가 없어야 공격 가능 (특수 아이템 제외)
  if (attackerZone === 'item' && ap === 'player') {
    if (p.field.center) {
      return { ...state, log: [...state.log, `❌ 아이템은 센터에 몬스터가 없을 때만 공격 가능`] };
    }
  }

  // ✅ fix69: 첫 턴 아이템 공격 1회 제한
  if (state.isFirstTurn && attackerZone === 'item') {
    const usedCount = state._firstTurnItemAttacked || 0;
    if (usedCount >= 1) {
      return { ...state, log: [...state.log, `❌ 선공 첫 턴: 아이템 공격은 1회만 가능`] };
    }
  }

  // ✅ fix66: 공격 선언 시 조건부 키워드 체크 (When this card attacks, if X, gets [KW])
  let newState = {
    ...state,
    attackingCard: { zone: attackerZone, card: attacker },
    log: [...state.log, `⚔️ ${attacker.name} 공격 선언!`],
    // ✅ fix69: 첫 턴 아이템 공격 카운트
    _firstTurnItemAttacked: attackerZone === 'item' && state.isFirstTurn
      ? (state._firstTurnItemAttacked || 0) + 1
      : state._firstTurnItemAttacked,
  };
  newState = applyAttackConditionalKeywords(newState, attacker, attackerZone, ap);
  return newState;
}

export function cancelAttack(state) {
  return { ...state, attackingCard: null };
}

// ── 링크어택: 공격 카드 추가 ─────────────────────────
export function addToLinkAttack(state, attackerZone) {
  const ap = state.activePlayer;
  const p = state[ap];
  const card = attackerZone === 'item' ? p.item : p.field[attackerZone];
  if (!card || card.state === CARD_STATE.REST) return state;
  if (state.linkAttackQueue.find(x => x.zone === attackerZone)) return state;
  return {
    ...state,
    linkAttackQueue: [...state.linkAttackQueue, { zone: attackerZone, card }],
    log: [...state.log, `🔗 링크어택 추가: ${card.name} (총 ${state.linkAttackQueue.length+1}장)`],
  };
}

// ── 전투 해결 (일반 + 링크어택) ──────────────────────
export function resolveAttack(state, targetZone) {
  if (!state.attackingCard && state.linkAttackQueue.length === 0) return state;

  const ap = state.activePlayer;
  const def = ap === 'player' ? 'ai' : 'player';
  let p_atk = { ...state[ap] };
  let p_def = { ...state[def] };
  let logs = [];
  let newState = { ...state };

  // 공격 카드 목록 결정 (링크어택 or 단일)
  const attackers = state.linkAttackQueue.length > 0
    ? state.linkAttackQueue
    : [state.attackingCard];

  // 총 공격력 계산
  const totalPower = attackers.reduce((s, a) => s + (a.card.power ?? 0), 0);
  const mainAttacker = attackers[0].card; // 크리티컬/키워드 기준
  const isLinkAttack = attackers.length > 1;

  if (isLinkAttack) logs.push(L(`🔗 링크어택! 합산파워 ${totalPower.toLocaleString()} (${attackers.length}장)`,`🔗 Link Attack! Power ${totalPower.toLocaleString()} (${attackers.length}))`) );

  // taunt 체크: 상대 필드에 공격 대상 강제 변경 카드가 있으면 타겟 전환
  let effectiveTarget = targetZone;
  const defTaunt = state.tauntZone;
  if (defTaunt && defTaunt.side === def && defTaunt.zone && p_def.field[defTaunt.zone]) {
    if (targetZone !== defTaunt.zone) {
      effectiveTarget = defTaunt.zone;
      logs.push(`🎯 ${p_def.field[defTaunt.zone].name}: 공격 대상 강제 변경!`);
    }
  }
  if (effectiveTarget !== targetZone) {
    targetZone = effectiveTarget;
  }

  if (targetZone === 'player') {
    // 직접공격: 센터 몬스터 없어야
    // Shadow Dive: 아이템에 shadow dive가 있으면 몬스터 있어도 직접공격 가능
    const hasShadowDiveItem = p_atk.item?._shadowDive || /"shadow\s*dive"|can\s+attack.*?even\s+if/i.test(p_atk.item?.text||'');
    if (p_def.field.center && !hasShadowDiveItem) {
      return { ...state, attackingCard: null, linkAttackQueue: [],
               log: [...state.log, '❌ 센터에 몬스터가 있어 직접공격 불가!'] };
    }
    const rawDmg = isLinkAttack
      ? attackers.reduce((s, a) => s + (a.card.critical ?? 1), 0) // 링크: 크리티컬 합산
      : (mainAttacker.critical ?? 1);
    const dmgReduction = p_def._damageReduce || 0;
    const dmg = Math.max(0, rawDmg - dmgReduction);
    if (dmgReduction > 0) { logs.push(`🛡️ 데미지 ${dmgReduction} 감소`); p_def._damageReduce = undefined; }
    p_def.life = Math.max(0, p_def.life - dmg);
    logs.push(L(`💥 직접공격 ${dmg}데미지 → ${def==='player'?'나':'AI'} 라이프 ${p_def.life}`,`💥 Direct ${dmg}dmg → ${def==='player'?'Me':'AI'} Life ${p_def.life}`));
  } else {
    const defender = p_def.field[targetZone];
    if (!defender) return { ...state, log: [...state.log, '대상 없음'] };
    const defDef = defender.defense ?? 0;
    const atkPow = isLinkAttack ? totalPower : (mainAttacker.power ?? 0);

    logs.push(`⚔️ ${isLinkAttack?`링크(${totalPower.toLocaleString()})`:mainAttacker.name+'('+atkPow.toLocaleString()+')'} vs ${defender.name}(${defDef.toLocaleString()})`);

    if (atkPow > defDef) {
      // Soulguard
      if (hasKW(defender, 'Soulguard') && defender.soul?.length > 0) {
        const newSoul = defender.soul.slice(0, -1);
        const discardedSoul = defender.soul.at(-1);
        p_def.drop = [...p_def.drop, discardedSoul];
        p_def.field = { ...p_def.field, [targetZone]: { ...defender, soul: newSoul } };
        logs.push(`🛡️ [Soulguard] ${defender.name}: 소울 "${discardedSoul?.name || '카드'}" 파괴 → 생존! (남은 소울: ${newSoul.length}장)`);
      } else {
        // ✅ fix69: 파괴 방지 효과 - 플레이어 카드면 선택 팝업, AI면 자동 처리
        const preventEff = parsePreventDestroyEffect(defender.text || '');
        let prevented = false;
        if (preventEff) {
          const isPlayerCard = def === 'player';
          let defOwnerState = { ...p_def };

          if (preventEff.preventCost === 'discardNonMonster') {
            const nonMonsterCards = defOwnerState.hand.filter(c => c.type !== 1);
            if (nonMonsterCards.length > 0) {
              if (isPlayerCard) {
                // 플레이어: pendingDiscard UI로 선택권 부여
                // 일단 파괴 보류하고 선택 대기
                logs.push(`🛡️ "${defender.name}" 파괴 방지 가능! 비몬스터 카드를 버려서 막으세요.`);
                const partialState = {
                  ...state,
                  [ap]: p_atk, [def]: p_def,
                  log: [...state.log, ...logs],
                  _pendingPreventDestroy: {
                    zone: targetZone, defSide: def, filter: 'nonMonster'
                  }
                };
                return partialState;
              } else {
                // AI: 자동으로 가장 낮은 가치 카드 버리기
                const toDiscard = nonMonsterCards[0];
                defOwnerState = { ...defOwnerState, hand: defOwnerState.hand.filter(c=>c.instanceId!==toDiscard.instanceId), drop: [...defOwnerState.drop, toDiscard] };
                prevented = true;
                logs.push(`🛡️ "${defender.name}" 파괴 방지! (${toDiscard.name} 버림)`);
              }
            }
          } else if (preventEff.preventCost === 'discardCard') {
            if (defOwnerState.hand.length > 0) {
              if (isPlayerCard) {
                logs.push(`🛡️ "${defender.name}" 파괴 방지 가능! 손패 카드 1장을 버려서 막으세요.`);
                return {
                  ...state, [ap]: p_atk, [def]: p_def, log: [...state.log, ...logs],
                  _pendingPreventDestroy: { zone: targetZone, defSide: def, filter: null }
                };
              } else {
                const toDiscard = defOwnerState.hand[defOwnerState.hand.length - 1];
                defOwnerState = { ...defOwnerState, hand: defOwnerState.hand.slice(0,-1), drop: [...defOwnerState.drop, toDiscard] };
                prevented = true;
                logs.push(`🛡️ "${defender.name}" 파괴 방지! (${toDiscard.name} 버림)`);
              }
            }
          } else if (preventEff.preventCost === 'gauge') {
            const cost = preventEff.preventGaugeCost || 1;
            if (defOwnerState.gauge.length >= cost) {
              defOwnerState = { ...defOwnerState, gauge: defOwnerState.gauge.slice(cost), drop: [...defOwnerState.drop, ...defOwnerState.gauge.slice(0, cost)] };
              prevented = true;
              logs.push(`🛡️ "${defender.name}" 파괴 방지! (게이지 ${cost} 지불)`);
            }
          } else if (preventEff.preventCost === 'dropSoul') {
            const card = defOwnerState.field[targetZone];
            if (card?.soul?.length > 0) {
              const soul = card.soul.at(-1);
              defOwnerState = { ...defOwnerState, field: { ...defOwnerState.field, [targetZone]: { ...card, soul: card.soul.slice(0,-1) } }, drop: [...defOwnerState.drop, soul] };
              prevented = true;
              logs.push(`🛡️ "${defender.name}" 파괴 방지! (소울 드롭)`);
            }
          } else if (preventEff.preventCost === 'life') {
            const cost = preventEff.preventLifeCost || 1;
            if (defOwnerState.life > cost) {
              defOwnerState = { ...defOwnerState, life: defOwnerState.life - cost };
              prevented = true;
              logs.push(`🛡️ "${defender.name}" 파괴 방지! (라이프 ${cost} 지불)`);
            }
          }
          if (prevented) {
            if (def === 'player') p_def = defOwnerState;
            else p_atk = defOwnerState; // AI가 방어자인 경우는 드물지만 처리
          }
        }

        if (!prevented) {
        p_def.field = { ...p_def.field, [targetZone]: null };
        p_def.drop = [...p_def.drop, defender];
        // [Set] 파괴 불가 체크
      const defTribe = (defender.tribe||'').toLowerCase();
      const indestrTribe = p_def._setIndestructible;
      if (indestrTribe && (indestrTribe === 'all' || defTribe.includes(indestrTribe))) {
        logs.push(`🛡️ [Set] 파괴 불가! (${defender.name})`);
        // 파괴 취소
        newField[defZone] = defender;
        p_def = { ...p_def, field: newField };
      } else {
        logs.push(L(`💀 ${defender.name} 파괴!`,`💀 ${defender.name} destroyed!`));
        // [Set] 파괴 시 차지
        if (p_def._setGaugeOnDestroy && p_def.deck.length > 0) {
          p_def = { ...p_def, gauge: [...p_def.gauge, p_def.deck[0]], deck: p_def.deck.slice(1) };
          logs.push(`⚡ [Set] 파괴 차지`);
        }
      }
        // 파괴 시 트리거 (임시 저장, 아래에서 적용)
        newState._pendingDestroyTrigger = { card: defender, side: def };
        } // end if (!prevented)
        // Lifelink: 파괴된 몬스터 소유자 라이프 감소
        const lifelinkM = (defender.text || '').match(/\[Lifelink (\d+)\]/i);
        if (lifelinkM) {
          const llVal = parseInt(lifelinkM[1]);
          p_def.life = Math.max(0, p_def.life - llVal);
          logs.push(`💔 Lifelink ${llVal}! 상대 라이프 → ${p_def.life}`);
        }
        // 아이템 데미지 트리거 (When this card deals damage)
        if (p_atk.item) {
          const itmTxt = p_atk.item.text || '';
          if (/[Ww]hen\s+this\s+card\s+deals?\s+damage.*?soul/i.test(itmTxt) && p_atk.deck.length > 0) {
            const tc = p_atk.deck[0];
            const ui = { ...p_atk.item, soul: [...(p_atk.item.soul||[]), tc] };
            p_atk = { ...p_atk, item: ui, deck: p_atk.deck.slice(1) };
            logs.push(`💫 ${p_atk.item?.name}: 데미지→소울 (${tc.name})`);
          }
          if (/[Ww]hen\s+this\s+card\s+deals?\s+damage.*?gauge/i.test(itmTxt) && p_atk.deck.length > 0) {
            const tc = p_atk.deck[0];
            p_atk = { ...p_atk, gauge: [...p_atk.gauge, tc], deck: p_atk.deck.slice(1) };
            logs.push(`⚡ ${p_atk.item?.name}: 데미지→차지 (${tc.name})`);
          }
        }
        // Penetrate: 공격 성공 시 크리티컬만큼 추가 데미지
        const penetrateAttacker = isLinkAttack
          ? attackers.find(a => hasKW(a.card, 'Penetrate'))?.card
          : hasKW(mainAttacker, 'Penetrate') ? mainAttacker : null;
        if (penetrateAttacker) {
          const dmg = penetrateAttacker.critical ?? 1;
          p_def.life = Math.max(0, p_def.life - dmg);
          logs.push(`🔴 [Penetrate] ${dmg}데미지 → 라이프 ${p_def.life}`);
        }
      }
    } else {
      logs.push(L(`🛡️ ${defender.name} 방어!`,`🛡️ ${defender.name} Defended!`));
      // [Counterattack]: 공격 몬스터의 defense <= 방어 몬스터의 power 일 때 파괴
      if (hasKW(defender, 'Counterattack') && attackers[0].zone !== 'item') {
        const aZone = attackers[0].zone;
        const attacker = p_atk.field[aZone];
        if (attacker) {
          const attackerDef = attacker.defense ?? 0;
          const defenderPow = defender.power ?? 0;
          if (attackerDef <= defenderPow) {
            p_atk.drop = [...p_atk.drop, attacker];
            p_atk.field = { ...p_atk.field, [aZone]: null };
            logs.push(`↩️ [Counterattack]! ${attacker.name}(방어${attackerDef}) ≤ ${defender.name}(파워${defenderPow}) → 파괴!`);
          } else {
            logs.push(`ℹ️ Counterattack 조건 미달: ${attacker.name}(방어${attackerDef}) > ${defender.name}(파워${defenderPow})`);
          }
        }
      }
    }
  }

  // 공격한 카드들 레스트
  for (const { zone } of attackers) {
    if (zone === 'item') {
      p_atk.item = p_atk.item ? { ...p_atk.item, state: CARD_STATE.REST } : null;
    } else if (p_atk.field[zone]) {
      p_atk.field = { ...p_atk.field, [zone]: { ...p_atk.field[zone], state: CARD_STATE.REST } };
    }
  }

  // Double/Triple Attack: 공격한 카드 중 키워드 있으면 로그
  for (const { zone: az } of attackers) {
    const atCard = az === 'item' ? p_atk.item : p_atk.field[az];
    if (atCard && hasKW(atCard, 'Double Attack')) {
      p_atk._doubleAttackZone = az;
      logs.push(`⚡ [Double Attack] ${atCard.name} — 한 번 더 공격 가능!`);
    }
    if (atCard && hasKW(atCard, 'Triple Attack')) {
      p_atk._tripleAttackZone = az;
      logs.push(`⚡ [Triple Attack] ${atCard.name} — 두 번 더 공격 가능!`);
    }
  }

  newState = {
    ...newState, [ap]: p_atk, [def]: p_def,
    attackingCard: null, linkAttackQueue: [],
    log: [...newState.log, ...logs],
  };
  // 공격 횟수 추적 (Then-if attackedNTimes용)
  newState = { ...newState, _attackCountThisTurn: (newState._attackCountThisTurn||0) + 1 };

  if (p_def.life <= 0) {
    // [Omni Lord] 체크: 손패에 [Omni Lord] 카드 있고 gauge 충분하면 라이프 1로 생존
    const omniCard = p_def.hand?.find(c =>
      (c.text||'').includes('[Omni Lord]') && /your life becomes 1/i.test(c.text||'')
    );
    const omniGaugeM = omniCard?.text?.match(/pay\s+(\d+)\s+gauge/i);
    const omniCost = omniGaugeM ? parseInt(omniGaugeM[1]) : 3;
    if (omniCard && p_def.gauge.length >= omniCost) {
      newState = { ...newState, [def]: {
        ...p_def,
        life: 1,
        gauge: p_def.gauge.slice(0, -omniCost),
        hand: p_def.hand.filter(c => c.instanceId !== omniCard.instanceId),
        drop: [...p_def.drop, omniCard],
      }, log: [...newState.log, `🌟 [Omni Lord] ${omniCard.name} 발동! 라이프 1 생존`] };
    } else {
      newState.winner = ap;
      newState.log = [...newState.log, L(`🏆 ${ap==='player'?'플레이어':'AI'} 승리!`,`🏆 ${ap==='player'?'Player':'AI'} Wins!`)];
    }
  }
  // when attacks 트리거 적용
  if (!newState.winner) {
    const mainCard = attackers[0]?.card;
    if (mainCard) newState = applyAttackTrigger(newState, mainCard, ap);
  }
  // when destroyed 트리거 적용
  if (newState._pendingDestroyTrigger) {
    const { card: dCard, side: dSide } = newState._pendingDestroyTrigger;
    const { _pendingDestroyTrigger, ...cleanState } = newState;
    newState = applyDestroyTrigger(cleanState, dCard, dSide);
  }
  return newState;
}

// ── Double/Triple Attack: 레스트 후 재공격 ───────────
export function resolveDoubleAttack(state, attackerZone) {
  const ap = state.activePlayer;
  const p = state[ap];
  const card = attackerZone === 'item' ? p.item : p.field[attackerZone];
  if (!card) return state;
  const isDouble = hasKW(card, 'Double Attack');
  const isTriple = hasKW(card, 'Triple Attack');
  if (!isDouble && !isTriple) return state;

  // 선공 첫 턴: 추가 공격 불가
  if (state.isFirstTurn) return { ...state, log: [...state.log, '❌ 선공 첫 턴에는 추가 공격 불가'] };
  // 사용 횟수 체크: Double=1번, Triple=2번 추가 공격
  const used = card._extraAttacksUsed ?? 0;
  const maxExtra = isTriple ? 2 : 1;
  if (used >= maxExtra) return { ...state, log: [...state.log, `❌ 추가 공격 횟수 초과`] };

  const updatedCard = { ...card, state: CARD_STATE.STAND, _extraAttacksUsed: used + 1 };
  let newP = { ...p };
  if (attackerZone === 'item') newP.item = updatedCard;
  else newP.field = { ...p.field, [attackerZone]: updatedCard };

  return {
    ...state, [ap]: newP,
    log: [...state.log, `⚡ ${isTriple?'Triple':'Double'} Attack! ${card.name} (${used+1}/${maxExtra}번째 추가)`],
  };
}

// ── Lifelink: 몬스터 파괴 시 라이프 감소 ─────────────
// resolveAttack 내에서 처리됨. 별도 함수로 외부 호출 가능
export function applyLifelink(state, destroyedCard, ownerSide) {
  const lifelinkVal = parseInt(
    (destroyedCard.text || '').match(/\[Lifelink (\d+)\]/i)?.[1] ?? 0
  );
  if (lifelinkVal <= 0) return state;
  const p = { ...state[ownerSide] };
  p.life = Math.max(0, p.life - lifelinkVal);
  return {
    ...state, [ownerSide]: p,
    log: [...state.log, `💔 Lifelink ${lifelinkVal}! ${ownerSide==='player'?'나':'AI'} 라이프 ${p.life}`],
  };
}

// ── Move: 필드 이동 ────────────────────────────────
export function hasMove(state, fromZone) {
  const ap = state.activePlayer;
  const p = state[ap];
  const card = p.field[fromZone];
  if (!card) return false;
  const text = card.text || '';

  // 1. 직접 [Move] 키워드
  if (hasKW(card, 'Move')) return true;

  // 2. 조건부 Move: "gets [Move]" 패턴 + 조건 평가
  if (!text.includes('gets [Move]') && !text.includes('get [Move]')) return false;

  // 조건 파싱: "If [조건], this card gets [Move]"
  const condM = text.match(/[Ii]f\s+(.*?)[,.]?\s*(?:this card|it)\s+gets?\s+\[Move\]/i);
  if (!condM) return false;
  const cond = condM[1].toLowerCase().trim();

  const fieldCards = ['left','center','right']
    .map(z => z === fromZone ? null : p.field[z])
    .filter(Boolean);

  // 패턴 1: "another card with 'X' in its card name on (your) field"
  const nameM = cond.match(/another card with ["\'«]?([^"'\'»,]+)["\'»]? in its card name/i);
  if (nameM) {
    const kw = nameM[1].trim().toLowerCase();
    return fieldCards.some(c => (c.name || '').toLowerCase().includes(kw));
  }

  // 패턴 2: "there is a card with 'X' / 'Y' in its card name"  const thereM = cond.match(/there is a card with ["\'«]?([^"'\'»,]+)["\'»]? in its card name/i);
  if (thereM) {
    const kw = thereM[1].trim().toLowerCase();
    return fieldCards.some(c => (c.name || '').toLowerCase().includes(kw));
  }

  // 패턴 3: "you have a/an [type] on your field"
  const haveM = cond.match(/you have (?:a|an)\s+[«"]?([^"'»]+)[»"]?\s+(?:monster\s+)?on your field/i);
  if (haveM) {
    const kw = haveM[1].trim().toLowerCase();
    return [...fieldCards, p.item].filter(Boolean).some(c => (c.name||'').toLowerCase().includes(kw) || (c.text||'').toLowerCase().includes(kw));
  }

  // 패턴 4: "your flag is 'X'"
  const flagM = cond.match(/your flag is ["\'«]?([^"'\'»]+)["\'»]?/i);
  if (flagM) {
    const flagName = flagM[1].trim().toLowerCase();
    return p.flag && (p.flag.name || '').toLowerCase().includes(flagName);
  }

  // 패턴 5: "you have N life or less"
  const lifeM = cond.match(/you have (\d+) life or less/i);
  if (lifeM) return p.life <= parseInt(lifeM[1]);

  // 패턴 6: "a card with [keyword]"
  const kwM = cond.match(/a card with \[([^\]]+)\]/i);
  if (kwM) {
    const kw = kwM[1].toLowerCase();
    return fieldCards.some(c => (c.text||'').toLowerCase().includes(`[${kw}]`));
  }

  // ✅ fix66: 패턴 7: "your equipped «X» is [Stand]"
  const equippedStandM = cond.match(/your\s+equipped\s+[«"]([^»"]+)[»"]\s+is\s+\[stand\]/i);
  if (equippedStandM) {
    const itemName = equippedStandM[1].trim().toLowerCase();
    return p.item &&
      (p.item.name || '').toLowerCase().includes(itemName) &&
      p.item.state === 'stand';
  }

  // ✅ fix66: 패턴 8: "you have a/an item equipped" (장착 아이템 존재)
  if (/you have (?:a|an) (?:item|weapon|armor) equipped/i.test(cond)) return !!p.item;

  return false;
}

export function moveMonster(state, fromZone, toZone) {
  const ap = state.activePlayer;
  const p = state[ap];
  const card = p.field[fromZone];
  if (!card) return state;
  if (p.field[toZone]) return { ...state, log: [...state.log, `❌ ${toZone}에 이미 카드 있음`] };
  return {
    ...state,
    [ap]: { ...p, field: { ...p.field, [fromZone]: null, [toZone]: card } },
    log: [...state.log, `🔄 ${card.name} ${fromZone} → ${toZone} 이동`],
  };
}

// ── 스펠/임팩트 발동 ────────────────────────────────

export function castSpell(state, instanceId) {
  const ap = state.activePlayer;
  const p = state[ap];
  const idx = p.hand.findIndex(c => c.instanceId === instanceId);
  if (idx === -1) return state;
  const card = p.hand[idx];
  if (card.type !== 3 && card.type !== 4) return state;

  // Impact Armor: 파이널 또는 메인 페이즈에서 사용 가능 ([Set]은 메인에서도)
  if (card.type === 4 && ap === 'player') {
    const hasSet = (card.text||'').includes('[Set]');
    const isImpactPhase = state.phase === TURN_PHASE.FINAL || state.phase === TURN_PHASE.MAIN;
    if (!hasSet && state.phase !== TURN_PHASE.FINAL)
      return { ...state, log: [...state.log, `❌ ${card.name}: 파이널 페이즈에서만 사용 가능`] };
  }

  // 사용 조건 체크 (플레이어만)
  if (ap === 'player') {
    const condCheck = canCastSpell(state, card, ap);
    if (!condCheck.ok)
      return { ...state, log: [...state.log, `❌ ${card.name}: ${condCheck.errors.join(', ')}`] };
    const cost = parseCost(card.text);
    if (cost) {
      const costCheck = canPayCost(p, cost);
      if (!costCheck.ok)
        return { ...state, log: [...state.log, `❌ ${card.name}: ${costCheck.errors.join(', ')}`] };
    }
  }

  const newHand = [...p.hand]; newHand.splice(idx, 1);
  let updatedP = { ...p, hand: newHand };
  const cost = parseCost(card.text);
  if (cost) updatedP = payCost(updatedP, cost, instanceId);

  const def = ap === 'player' ? 'ai' : 'player';
  let defP = { ...state[def] };
  const baseEffect = parseSpellEffect(card.text || '') || {};
  // choose-one에서 플레이어가 선택한 효과 사용
  const effect = state._chosenEffect
    ? { ...baseEffect, ...state._chosenEffect, chooseOptions: undefined }
    : baseEffect;
  const logs = [L(`[${ap === 'player' ? '나' : 'AI'}] ✨ ${card.name} 발동!`,`[${ap === 'player' ? 'Me' : 'AI'}] ✨ ${card.name} cast!`)];
  let nullified = false;

  if (effect) {
    try {
    if (effect.nullifyAttack && state.attackingCard) { nullified = true; logs.push('🛡️ 공격 무효화!'); }
    if (effect.gainLife) { updatedP = { ...updatedP, life: Math.min(updatedP.life + effect.gainLife, 30) }; logs.push(`❤️ 라이프 +${effect.gainLife} → ${updatedP.life}`); }
    if (effect.damage) {
    const _reduce = updatedP.item?._nonAttackReduce || 0;
    const _actualDmg = Math.max(0, effect.damage - _reduce);
    defP = { ...defP, life: Math.max(0, defP.life - _actualDmg) };
    logs.push(`💥 ${_actualDmg} 데미지${_reduce?` (-${_reduce} 감소)`:''}→ 상대 라이프 ${defP.life}`);
  }
    if (effect.gainGauge && updatedP.deck.length > 0) { const _gn=Math.min(typeof effect.gainGauge==='number'?effect.gainGauge:1,updatedP.deck.length); updatedP={...updatedP,gauge:[...updatedP.gauge,...updatedP.deck.slice(0,_gn)],deck:updatedP.deck.slice(_gn)}; logs.push(`⚡ 차지 ${_gn}장`); }
    if (effect.draw) { const drawn = updatedP.deck.slice(0, effect.draw); updatedP = { ...updatedP, hand: [...updatedP.hand, ...drawn], deck: updatedP.deck.slice(effect.draw) }; logs.push(`🃏 드로우 ${drawn.length}장`); }
    if (effect.discardAll) { updatedP = { ...updatedP, drop: [...updatedP.drop, ...updatedP.hand], hand: [] }; logs.push('🗑️ 손패 전부 버림'); }
    if (effect.deckToDrop) { const dropped = updatedP.deck.slice(0, effect.deckToDrop); updatedP = { ...updatedP, deck: updatedP.deck.slice(effect.deckToDrop), drop: [...updatedP.drop, ...dropped] }; logs.push(`🗑️ 덱 ${dropped.length}장 드롭`); }
    if (effect.deckToHand && updatedP.deck.length > 0) {
      const _sh = updatedP.deck[0];
      if (_sh) {
        updatedP = { ...updatedP, hand: [...updatedP.hand, _sh], deck: updatedP.deck.slice(1) };
        logs.push(`🔍 ${_sh.name} → 손패`);
      }
    }
    if (effect.shuffleDeck) {
      updatedP = { ...updatedP, deck: [...updatedP.deck].sort(() => Math.random()-0.5) };
      logs.push(`🔀 덱 셔플`);
    }
    if (effect.returnToHand?.target === 'opponent') {
      const _rz = ['center','left','right'].find(z => defP.field[z]);
      if (_rz) {
        const _rc = defP.field[_rz];
        defP = { ...defP, field: { ...defP.field, [_rz]: null }, hand: [...defP.hand, _rc] };
        logs.push(`↩️ ${_rc.name} → 상대 손패`);
      }
    }
    if (effect.destroyMaxPower != null || effect.destroyAll) {
      let newField = { ...defP.field }; let newDrop = [...defP.drop];
      for (const z of ['left','center','right']) {
        const m = newField[z]; if (!m) continue;
        if (effect.destroyAll || (m.power ?? 0) <= (effect.destroyMaxPower ?? 0)) { newDrop.push(m); newField[z] = null; logs.push(L(`💀 ${m.name} 파괴!`,`💀 ${m.name} destroyed!`)); }
      }
      defP = { ...defP, field: newField, drop: newDrop };
    }
    if (effect.standTarget) {
      const side = effect.standTarget === 'opponent' ? defP : updatedP;
      const newField = {}; for (const z of ['left','center','right']) newField[z] = side.field[z] ? { ...side.field[z], state: CARD_STATE.STAND } : null;
      if (effect.standTarget === 'opponent') defP = { ...defP, field: newField }; else updatedP = { ...updatedP, field: newField };
      logs.push(`🔄 스탠드`);
    }
    if (effect.restTarget) {
      const side = effect.restTarget === 'opponent' ? defP : updatedP;
      const newField = {}; for (const z of ['left','center','right']) newField[z] = side.field[z] ? { ...side.field[z], state: CARD_STATE.REST } : null;
      if (effect.restTarget === 'opponent') defP = { ...defP, field: newField }; else updatedP = { ...updatedP, field: newField };
      logs.push(`😴 레스트`);
    }
    if (effect.returnToHand) {
      const rh = effect.returnToHand; const side = rh.target === 'opponent' ? defP : updatedP;
      let newField = { ...side.field }; let newHand2 = [...side.hand];
      for (const z of ['left','center','right']) {
        const m = newField[z]; if (!m) continue;
        if (rh.maxSize == null || (m.size ?? 0) <= rh.maxSize) { newHand2.push(m); newField[z] = null; logs.push(`↩️ ${m.name} 손패로`); if (rh.maxSize != null) break; }
      }
      if (rh.target === 'opponent') defP = { ...defP, field: newField, hand: newHand2 }; else updatedP = { ...updatedP, field: newField, hand: newHand2 };
    }
    // 대상 파괴 (size 조건)
    if (effect.destroyTarget && !effect.destroyMaxPower && !effect.destroyAll) {
      const zones = ['left','center','right'];
      let newField = { ...defP.field }; let newDrop = [...defP.drop];
      for (const z of zones) {
        const m = newField[z]; if (!m) continue;
        if (!effect.destroyMaxSize || (m.size ?? 0) <= effect.destroyMaxSize) {
          newDrop.push(m); newField[z] = null; logs.push(L(`💀 ${m.name} 파괴!`,`💀 ${m.name} destroyed!`)); break;
        }
      }
      defP = { ...defP, field: newField, drop: newDrop };
    }
    // 크리티컬 버프 (전투)
    if (effect.criticalBuff && state.attackingCard) logs.push(`⭐ 크리티컬+${effect.criticalBuff}`);
    // [Counterattack] 부여 - 교전 중 카드 우선, 없으면 가장 강한 내 카드
    if (effect.giveCounterattack) {
      let caZone = null;
      if (state.attackingCard) {
        const az = state.attackingCard.zone; const aSide = state.activePlayer;
        if (aSide === ap) caZone = az;
      }
      if (!caZone) {
        // 타겟 키워드로 탐색
        const tgtCA = (effect.battleTarget||'').toLowerCase();
        caZone = ['left','center','right','item'].find(z => {
          const fc = z==='item' ? updatedP.item : updatedP.field[z];
          if (!fc) return false;
          return !tgtCA || (fc.name||'').toLowerCase().includes(tgtCA) || (fc.tribe||'').toLowerCase().includes(tgtCA);
        });
      }
      if (caZone) {
        const old_c = caZone==='item' ? updatedP.item : updatedP.field[caZone];
        if (old_c) {
          const updated = { ...old_c, _counterattack: true };
          if (caZone==='item') updatedP = { ...updatedP, item: updated };
          else updatedP = { ...updatedP, field: { ...updatedP.field, [caZone]: updated } };
          logs.push(`⚔️ [Counterattack] ${old_c.name}에 부여`);
        }
      }
    }
    // 손패 N장 버리기
    if (effect.discardN && !effect.discardAll) {
      const toDiscard = updatedP.hand.slice(-Math.min(effect.discardN, updatedP.hand.length));
      const ids = new Set(toDiscard.map(c => c.instanceId));
      updatedP = { ...updatedP, hand: updatedP.hand.filter(c => !ids.has(c.instanceId)), drop: [...updatedP.drop, ...toDiscard] };
      logs.push(`🗑️ 손패 ${toDiscard.length}장 버림`);
    }
    // 전투 버프: "give it power+N" 또는 타겟 특정 카드 버프
    if (effect.battlePowerBuff || effect.battleDefenseBuff) {
      const tgt = (effect.battleTarget || '').toLowerCase();
      // 전투 중이 아닐 때 (내 턴 메인): 타겟과 일치하는 내 필드 카드에 적용
      const applyBuff = (card) => {
        if (!card) return card;
        const nameLow = (card.name||'').toLowerCase();
        const textLow = (card.text||'').toLowerCase();
        const tribeLow = (card.tribe||'').toLowerCase();
        // 타겟 키워드 매칭: 이름, 종족, 텍스트 모두 확인
        const tgtWords = tgt.split(/\s+/).filter(w => w.length > 2);
        const matchesTgt = !tgt || tgtWords.some(w => nameLow.includes(w) || tribeLow.includes(w) || textLow.includes(w));
        if (matchesTgt) {
          return {
            ...card,
            power: (card.power ?? 0) + (effect.battlePowerBuff ?? 0),
            defense: (card.defense ?? 0) + (effect.battleDefenseBuff ?? 0),
            _buffed: true,
            _origPower: card._origPower ?? card.power,
            _origDefense: card._origDefense ?? card.defense,
          };
        }
        return card;
      };
      let buffed = false;
      // 1순위: 플레이어가 선택한 타겟 존
      const hintZone = state._spellTargetZone;
      if (hintZone && updatedP.field[hintZone]) {
        const nb = applyBuff(updatedP.field[hintZone]);
        if (nb && nb._buffed) { updatedP = { ...updatedP, field: { ...updatedP.field, [hintZone]: nb } }; buffed=true; }
      }
      // 2순위: 전투 중인 카드
      if (!buffed && state.attackingCard) {
        const az = state.attackingCard.zone; const aSide = state.activePlayer;
        if (az === 'item') { const nb = applyBuff(state[aSide].item); if (nb && nb._buffed) { updatedP = { ...updatedP, item: nb }; buffed=true; } }
        else if (state[aSide].field[az]) { const nb = applyBuff(state[aSide].field[az]); if (nb && nb._buffed) { updatedP = { ...updatedP, field: { ...updatedP.field, [az]: nb } }; buffed=true; } }
      }
      // 3순위: 타겟 키워드로 필드 전체 탐색 (내 턴 메인 페이즈 포함)
      if (!buffed) {
        for (const z of ['left','center','right','item']) {
          const fc = z === 'item' ? updatedP.item : updatedP.field[z];
          const nb = applyBuff(fc);
          if (nb && nb._buffed) {
            if (z === 'item') updatedP = { ...updatedP, item: nb };
            else updatedP = { ...updatedP, field: { ...updatedP.field, [z]: nb } };
            buffed = true; break;
          }
        }
      }
      // 4순위: 타겟 없으면 가장 강한 내 카드에 적용
      if (!buffed && !tgt) {
        const strongestZ = ['left','center','right'].filter(z => updatedP.field[z])
          .sort((a,b) => (updatedP.field[b].power??0)-(updatedP.field[a].power??0))[0];
        if (strongestZ) {
          const nb = { ...updatedP.field[strongestZ],
            power: (updatedP.field[strongestZ].power??0) + (effect.battlePowerBuff??0),
            defense: (updatedP.field[strongestZ].defense??0) + (effect.battleDefenseBuff??0),
            _buffed:true, _origPower: updatedP.field[strongestZ]._origPower??updatedP.field[strongestZ].power,
          };
          updatedP = { ...updatedP, field: { ...updatedP.field, [strongestZ]: nb } }; buffed=true;
        }
      }
      if (buffed) logs.push(`⬆️ 전투 버프${tgt ? ` (${effect.battleTarget})` : ''}: 파워+${effect.battlePowerBuff ?? 0} 방어+${effect.battleDefenseBuff ?? 0}`);
      else logs.push(`⚠️ 버프 대상 없음 (${effect.battleTarget||'전체'})`);
    }
    // 이번 턴 전체 키워드 부여
    if (effect.fieldPenetrate || effect.fieldDoubleAttack || effect.fieldMove) {
      const newField3 = {};
      for (const z of ['left','center','right']) {
        const fc = updatedP.field[z];
        if (!fc) { newField3[z] = null; continue; }
        const kws = [...(fc._conditionalKws||[])];
        if (effect.fieldPenetrate && !kws.includes('penetrate')) kws.push('penetrate');
        if (effect.fieldDoubleAttack && !kws.includes('double attack')) kws.push('double attack');
        if (effect.fieldMove && !kws.includes('move')) kws.push('move');
        newField3[z] = { ...fc, _conditionalKws: kws };
      }
      updatedP = { ...updatedP, field: newField3 };
      logs.push(`✨ 필드 키워드 부여`);
    }
    // 필드 전체 버프
    if (effect.fieldPowerBuff || effect.fieldDefenseBuff) {
      const newField = {};
      for (const z of ['left','center','right']) {
        const fc = updatedP.field[z];
        newField[z] = fc ? {
          ...fc,
          power: (fc.power ?? 0) + (effect.fieldPowerBuff ?? 0),
          defense: (fc.defense ?? 0) + (effect.fieldDefenseBuff ?? 0),
          _buffed: true,
          _origPower: fc._origPower ?? fc.power,
          _origDefense: fc._origDefense ?? fc.defense,
        } : null;
      }
      updatedP = { ...updatedP, field: newField };
      logs.push(`⬆️ 내 필드 전체 버프: 파워+${effect.fieldPowerBuff ?? 0} 방어+${effect.fieldDefenseBuff ?? 0}`);
    }
    // 드롭에서 소환
    if (effect.callFromDrop) {
      const monster = updatedP.drop.slice().reverse().find(c => c.type === 1);
      if (monster) {
        const emptyZone = ['left','center','right'].find(z => !updatedP.field[z]);
        if (emptyZone) {
          updatedP = {
            ...updatedP,
            field: { ...updatedP.field, [emptyZone]: { ...monster, state: 'stand' } },
            drop: updatedP.drop.filter(c => c.instanceId !== monster.instanceId),
          };
          logs.push(`📤 ${monster.name} 드롭→필드`);
        }
      }
    }
    // deck→hand
    if (effect.deckToHand && updatedP.deck.length > 0) {
      const n = Math.min(2, updatedP.deck.length);
      updatedP = { ...updatedP, hand: [...updatedP.hand, ...updatedP.deck.slice(0,n)], deck: updatedP.deck.slice(n) };
      logs.push(`↩️ 덱→손패 ${n}장`);
    }
    // deckDropCall: 덱 상단 N장 드롭 후 소환
    if (effect.deckDropCall && updatedP.deck.length > 0) {
      const n = Math.min(4, updatedP.deck.length);
      const dropped = updatedP.deck.slice(0, n);
      updatedP = { ...updatedP, deck: updatedP.deck.slice(n), drop: [...updatedP.drop, ...dropped] };
      const callable = dropped.filter(c => c.type === 1);
      if (callable.length > 0) {
        const emptyZ = ['left','center','right'].find(z => !updatedP.field[z]);
        if (emptyZ) {
          updatedP = { ...updatedP, field: { ...updatedP.field, [emptyZ]: { ...callable[0], state: 'stand' } }, drop: updatedP.drop.filter(c=>c.instanceId!==callable[0].instanceId) };
          logs.push(`📤 덱드롭→소환: ${callable[0].name}`);
        }
      }
    }
    // shuffleDeck
    if (effect.shuffleDeck) {
      const shuffled = [...updatedP.deck].sort(() => Math.random()-0.5);
      updatedP = { ...updatedP, deck: shuffled };
      logs.push(`🔀 덱 셔플`);
    }
    // gainLifeEqual (size 기준)
    if (effect.gainLifeEqual && state.attackingCard) {
      const az = state.attackingCard.zone; const aSide = state.activePlayer;
      const atCard = state[aSide].field[az];
      const gain = atCard?.size ?? 1;
      updatedP = { ...updatedP, life: Math.min(updatedP.life + gain, 30) };
      logs.push(`❤️ 라이프 +${gain} (사이즈 기준)`);
    }
    // thisTurnKeyword: 이번 턴 키워드 부여
    if (effect.thisTurnKeyword && state.attackingCard) {
      const az = state.attackingCard.zone; const aSide = state.activePlayer;
      const kw = effect.thisTurnKeyword.toLowerCase();
      if (aSide === ap) {
        if (az==='item') updatedP = { ...updatedP, item: { ...updatedP.item, _conditionalKws: [...(updatedP.item?._conditionalKws||[]), kw] }};
        else if (updatedP.field[az]) updatedP = { ...updatedP, field: { ...updatedP.field, [az]: { ...updatedP.field[az], _conditionalKws: [...(updatedP.field[az]?._conditionalKws||[]), kw] }}};
      }
      logs.push(`✨ ${effect.thisTurnKeyword} 부여`);
    }
    // Then, if 조건부 추가 효과
    // Then, if your life is N or less → 추가 차지
    if (effect.conditionalLifeGauge) {
      const { maxLife, n } = effect.conditionalLifeGauge;
      if (updatedP.life <= maxLife && updatedP.deck.length > 0) {
        const _gn = Math.min(n, updatedP.deck.length);
        updatedP = { ...updatedP, gauge: [...updatedP.gauge, ...updatedP.deck.slice(0,_gn)], deck: updatedP.deck.slice(_gn) };
        logs.push(`⚡ 조건부 차지 ${_gn}장 (라이프 ${maxLife} 이하)`);
      }
    }
    if (effect.conditionalFieldMonster) {
      const kw = effect.conditionalFieldMonster.toLowerCase();
      const hasIt = Object.values(updatedP.field).some(c => c && (c.name||'').toLowerCase().includes(kw));
      if (hasIt) {
        if (effect.conditionalGauge) { const n=Math.min(effect.conditionalGauge,updatedP.deck.length); updatedP={...updatedP,gauge:[...updatedP.gauge,...updatedP.deck.slice(0,n)],deck:updatedP.deck.slice(n)}; logs.push(`⚡ +${n}게이지 (${effect.conditionalFieldMonster} 조건)`); }
        if (effect.conditionalLife) { updatedP={...updatedP,life:Math.min(updatedP.life+effect.conditionalLife,30)}; logs.push(`❤️ +${effect.conditionalLife} 라이프 조건부`); }
        if (effect.conditionalDamage) { defP={...defP,life:Math.max(0,defP.life-effect.conditionalDamage)}; logs.push(`💥 조건부 ${effect.conditionalDamage}데미지`); }
        if (effect.conditionalDraw) { const drawn=updatedP.deck.slice(0,effect.conditionalDraw); updatedP={...updatedP,hand:[...updatedP.hand,...drawn],deck:updatedP.deck.slice(effect.conditionalDraw)}; logs.push(`🃏 조건부 드로우 ${drawn.length}장`); }
      }
    }
    } catch(err) { logs.push(`⚠️ 효과 처리 오류: ${err.message}`); console.warn('castSpell 효과 오류:', err); }
  }

  // ✅ fix68: 내 필드 카드 "When you cast a spell" 트리거 처리
  // "When you cast a spell, for this turn, this card gets [KW]" 패턴
  for (const z of ['left','center','right']) {
    const fc = updatedP.field[z];
    if (!fc) continue;
    const ft = fc.text || '';
    const spellTrigM = ft.match(/[Ww]hen you (?:cast|use|activate) a spell[,.]?\s*([\s\S]*?)(?=\n\n|\[Act\]|\[Auto\]|\[Cont\]|$)/i);
    if (!spellTrigM) continue;
    const trigText = spellTrigM[1];
    // "for this turn, this card gets [KW]" 패턴
    const kwM = trigText.match(/(?:for\s+this\s+turn[,.]?\s+)?this\s+card\s+gets?\s+\[([^\]]+)\]/gi);
    if (kwM) {
      const newKws = [...(fc._conditionalKws || [])];
      for (const m of kwM) {
        const kw = m.match(/\[([^\]]+)\]/)?.[1];
        if (kw && !newKws.includes(kw)) {
          newKws.push(kw);
          logs.push(`⚡ ${fc.name}: 스펠 발동→[${kw}] 획득!`);
        }
      }
      updatedP = { ...updatedP, field: { ...updatedP.field, [z]: { ...fc, _conditionalKws: newKws, _spellKwTurn: true } } };
    }
    // "for this turn, this card gets power+N" 패턴
    const powM = trigText.match(/for\s+this\s+turn.*?(?:this\s+card|it)\s+gets?\s+power\+(\d+)/i);
    if (powM) {
      const fc2 = updatedP.field[z];
      updatedP = { ...updatedP, field: { ...updatedP.field, [z]: { ...fc2, power: (fc2.power||0)+parseInt(powM[1]), _buffed:true } } };
      logs.push(`⬆️ ${fc.name}: 스펠 발동→파워+${powM[1]}`);
    }
    // "for this turn, this card gets critical+N"
    const critM = trigText.match(/for\s+this\s+turn.*?critical\+(\d+)/i);
    if (critM) {
      const fc2 = updatedP.field[z];
      updatedP = { ...updatedP, field: { ...updatedP.field, [z]: { ...fc2, critical: (fc2.critical||1)+parseInt(critM[1]), _buffed:true } } };
      logs.push(`⬆️ ${fc.name}: 스펠 발동→크리티컬+${critM[1]}`);
    }
    // "for this turn, put the top card of your deck into this card's soul"
    if (/for\s+this\s+turn.*?(?:put|into).*?soul|put.*?into.*?soul/i.test(trigText) && updatedP.deck.length > 0) {
      const soulCard = updatedP.deck[0];
      const fc2 = updatedP.field[z];
      updatedP = { ...updatedP, deck: updatedP.deck.slice(1), field: { ...updatedP.field, [z]: { ...fc2, soul: [...(fc2.soul||[]), soulCard] } } };
      logs.push(`💫 ${fc.name}: 스펠 발동→소울 추가(${soulCard.name})`);
    }
    // "for this turn, this card gets [Penetrate/DoublAttack/etc]"
    // (위의 kwM에서 이미 처리됨)
  }
  // 아이템도 체크
  if (updatedP.item) {
    const fi = updatedP.item;
    const ft = fi.text || '';
    const spellTrigM = ft.match(/[Ww]hen you (?:cast|use|activate) a spell[,.]?\s*([\s\S]*?)(?=\n\n|\[Act\]|$)/i);
    if (spellTrigM) {
      const trigText = spellTrigM[1];
      const powM = trigText.match(/for\s+this\s+turn.*?power\+(\d+)/i);
      if (powM) { updatedP = { ...updatedP, item: { ...fi, power: (fi.power||0)+parseInt(powM[1]), _buffed:true } }; logs.push(`⬆️ ${fi.name}: 스펠 발동→파워+${powM[1]}`); }
    }
  }

  // 상대 "when opponent casts spell" 트리거
  const oppSide = def;
  const oppField = defP.field;
  for (const z of ['left','center','right']) {
    const ofc = oppField[z];
    if (ofc && (ofc.text||'').match(/when.*?opponent.*?casts?.*?spell.*?nullify/i) && !nullified) {
      // 상대가 스펠 무효화 능력 가진 경우 - 로그만 (실제 발동은 Counter 타이밍)
      logs.push(`⚠️ ${ofc.name}: 스펠 반응 대기`);
    }
  }
  let newState = {
    ...state,
    [ap]: { ...updatedP, drop: [...updatedP.drop, card] },
    [def]: defP,
    attackingCard: nullified ? null : state.attackingCard,
    linkAttackQueue: nullified ? [] : state.linkAttackQueue,
    _spellTargetZone: undefined,
    _chosenEffect: undefined,
    log: [...state.log, ...logs],
  };

  if (defP.life <= 0) { newState.winner = ap; newState.log = [...newState.log, `🏆 ${ap === 'player' ? '플레이어' : 'AI'} 승리!`]; }
  return newState;
}

export function counterCastSpell(state, instanceId) {
  // 카운터는 항상 플레이어가 발동 (AI 턴 중)
  const p = state.player;
  const idx = p.hand.findIndex(c => c.instanceId === instanceId);
  if (idx === -1) return state;
  const card = p.hand[idx];
  if (card.type !== 3 && card.type !== 4) return state;

  // [Set] 카운터 사용 금지 체크
  if (state.player?._cannotUseCounter)
    return { ...state, log: [...state.log, `❌ ${card.name}: 카운터 사용 불가 (Set 효과)`] };

  // 카운터 발동 조건 체크 (공격 중 + 상대 턴 자동 충족)
  const condCheck = canCastSpell(state, card, 'player');
  if (!condCheck.ok)
    return { ...state, log: [...state.log, `❌ ${card.name}: ${condCheck.errors.join(', ')}`] };

  const cost = parseCost(card.text);
  if (cost) {
    const costCheck = canPayCost(p, cost);
    if (!costCheck.ok)
      return { ...state, log: [...state.log, `❌ ${card.name}: ${costCheck.errors.join(', ')}`] };
  }

  const newHand = [...p.hand]; newHand.splice(idx, 1);
  let updatedPlayer = { ...p, hand: newHand };
  if (cost) updatedPlayer = payCost(updatedPlayer, cost, instanceId);

  const effect = parseSpellEffect(card.text || '');
  const logs = [L(`[나] ✨ ${card.name} 카운터 발동!`,`[Me] ✨ ${card.name} Counter cast!`)];
  let updatedAI = { ...state.ai };
  let nullified = false;

  if (effect) {
    // giveCounterattack / battleBuff: 교전 중 내 몬스터 버프
    if ((effect.giveCounterattack || effect.battlePowerBuff || effect.battleDefenseBuff) && state.attackingCard) {
      const myField = updatedPlayer.field;
      const tz = state._spellTargetZone || ['center','left','right'].find(z => myField[z]?.state === 'rest') || 'center';
      const atCard = tz === 'item' ? updatedPlayer.item : myField[tz];
      if (atCard) {
        const updated = {
          ...atCard,
          power: (atCard.power??0) + (effect.battlePowerBuff??0),
          defense: (atCard.defense??0) + (effect.battleDefenseBuff??0),
          _counterattack: effect.giveCounterattack ? true : atCard._counterattack,
          _buffed: true, _origPower: atCard._origPower??atCard.power,
        };
        if (tz === 'item') updatedPlayer = { ...updatedPlayer, item: updated };
        else updatedPlayer = { ...updatedPlayer, field: { ...myField, [tz]: updated } };
        if (effect.battlePowerBuff) logs.push(`⬆️ ${atCard.name}: 파워+${effect.battlePowerBuff}`);
        if (effect.battleDefenseBuff) logs.push(`🛡️ ${atCard.name}: 방어+${effect.battleDefenseBuff}`);
        if (effect.giveCounterattack) logs.push(`⚔️ ${atCard.name}: [Counterattack] 부여`);
      }
    }
    if (effect.nullifyAttack && state.attackingCard) {
      nullified = true;
      logs.push('🛡️ 공격 무효화!');
    }
    if (effect.gainLife) {
      updatedPlayer = { ...updatedPlayer, life: Math.min(updatedPlayer.life + effect.gainLife, 30) };
      logs.push(`❤️ 라이프 +${effect.gainLife} → ${updatedPlayer.life}`);
    }
    if (effect.damage) {
      updatedAI = { ...updatedAI, life: Math.max(0, updatedAI.life - effect.damage) };
      logs.push(`💥 ${effect.damage} 데미지 → AI 라이프 ${updatedAI.life}`);
    }
    if (effect.draw) {
      const drawn = updatedPlayer.deck.slice(0, effect.draw);
      updatedPlayer = { ...updatedPlayer, hand: [...updatedPlayer.hand, ...drawn], deck: updatedPlayer.deck.slice(effect.draw) };
      logs.push(`🃏 드로우 ${drawn.length}장`);
    }
    if (effect.gainGauge && updatedPlayer.deck.length > 0) {
      const _gn = Math.min(typeof effect.gainGauge==='number'?effect.gainGauge:1, updatedPlayer.deck.length);
      updatedPlayer = { ...updatedPlayer, gauge: [...updatedPlayer.gauge,...updatedPlayer.deck.slice(0,_gn)], deck: updatedPlayer.deck.slice(_gn) };
      logs.push(`⚡ 차지 ${_gn}장`);
    }
    if (effect.deckToDrop && updatedPlayer.deck.length > 0) {
      const _dd = Math.min(effect.deckToDrop, updatedPlayer.deck.length);
      const _ddrp = updatedPlayer.deck.slice(0, _dd);
      updatedPlayer = { ...updatedPlayer, deck: updatedPlayer.deck.slice(_dd), drop: [...updatedPlayer.drop, ..._ddrp] };
      logs.push(`🗑️ 덱 상단 ${_dd}장 → 드롭`);
    }
    if (effect.deckToHand && updatedPlayer.deck.length > 0) {
      const _sh = updatedPlayer.deck[0];
      if (_sh) { updatedPlayer = { ...updatedPlayer, hand: [...updatedPlayer.hand, _sh], deck: updatedPlayer.deck.slice(1) }; logs.push(`🔍 ${_sh.name} → 손패`); }
    }
    if (effect.shuffleDeck) {
      updatedPlayer = { ...updatedPlayer, deck: [...updatedPlayer.deck].sort(() => Math.random()-0.5) };
      logs.push(`🔀 덱 셔플`);
    }
    if (effect.returnToHand?.target === 'opponent') {
      const _rz = ['center','left','right'].find(z => updatedAI.field[z]);
      if (_rz) { const _rc = updatedAI.field[_rz]; updatedAI = { ...updatedAI, field: { ...updatedAI.field, [_rz]: null }, hand: [...updatedAI.hand, _rc] }; logs.push(`↩️ ${_rc.name} → 상대 손패`); }
    }
    if (effect.destroyMaxPower != null || effect.destroyAll) {
      let newField = { ...updatedAI.field };
      let newDrop = [...updatedAI.drop];
      for (const z of ['left','center','right']) {
        const m = newField[z]; if (!m) continue;
        if (effect.destroyAll || (m.power ?? 0) <= (effect.destroyMaxPower ?? 0)) {
          newDrop.push(m); newField[z] = null;
          logs.push(L(`💀 ${m.name} 파괴!`,`💀 ${m.name} destroyed!`));
        }
      }
      updatedAI = { ...updatedAI, field: newField, drop: newDrop };
    }
    if (effect.standTarget === 'player') {
      const newField = {};
      for (const z of ['left','center','right']) newField[z] = updatedPlayer.field[z] ? { ...updatedPlayer.field[z], state: CARD_STATE.STAND } : null;
      updatedPlayer = { ...updatedPlayer, field: newField };
      logs.push('🔄 내 카드 스탠드');
    }
    if (effect.returnToHand) {
      const rh = effect.returnToHand;
      const side = rh.target === 'opponent' ? updatedAI : updatedPlayer;
      let newField = { ...side.field }; let newHand2 = [...side.hand];
      for (const z of ['left','center','right']) {
        const m = newField[z]; if (!m) continue;
        if (rh.maxSize == null || (m.size ?? 0) <= rh.maxSize) {
          newHand2.push(m); newField[z] = null;
          logs.push(`↩️ ${m.name} 손패로`); if (rh.maxSize != null) break;
        }
      }
      if (rh.target === 'opponent') updatedAI = { ...updatedAI, field: newField, hand: newHand2 };
      else updatedPlayer = { ...updatedPlayer, field: newField, hand: newHand2 };
    }
  }

  let newState = {
    ...state,
    player: { ...updatedPlayer, drop: [...updatedPlayer.drop, card] },
    ai: updatedAI,
    attackingCard: nullified ? null : state.attackingCard,
    linkAttackQueue: nullified ? [] : state.linkAttackQueue,
    log: [...state.log, ...logs],
  };
  if (updatedAI.life <= 0) {
    newState.winner = 'player';
    newState.log = [...newState.log, '🏆 플레이어 승리!'];
  }
  return newState;
}


export function applyCounterSpell(state, instanceId, targetInfo) {
  // targetInfo: { attackerSide, attackerZone }
  let newState = castSpell(state, instanceId);
  const card = state.player.hand.find(c => c.instanceId === instanceId);
  if (!card) return newState;
  const txt = (card.text || '').toLowerCase();

  // power+X, defense+X 부여
  const powerMatch = txt.match(/power\+(\d+)/);
  const defMatch = txt.match(/defense\+(\d+)/);
  if (powerMatch || defMatch) {
    const aSide = targetInfo.attackerSide;
    const aZone = targetInfo.attackerZone;
    const target = aZone === 'item' ? newState[aSide].item : newState[aSide].field[aZone];
    if (target) {
      const updated = {
        ...target,
        power: (target.power ?? 0) + parseInt(powerMatch?.[1] ?? 0),
        defense: (target.defense ?? 0) + parseInt(defMatch?.[1] ?? 0),
      };
      if (aZone === 'item') newState = { ...newState, [aSide]: { ...newState[aSide], item: updated } };
      else newState = { ...newState, [aSide]: { ...newState[aSide], field: { ...newState[aSide].field, [aZone]: updated } } };
      newState.log = [...newState.log, `✨ 카운터: 파워/방어 강화`];
    }
  }

  // 공격 무효화 (nullified)
  if (txt.includes('attack cannot be nullified') || txt.includes('nullif')) {
    newState = { ...newState, attackingCard: null,
                 log: [...newState.log, `🚫 공격 무효화!`] };
  }
  return newState;
}

export function endTurn(state) {
  const next = state.activePlayer === 'player' ? 'ai' : 'player';
  const nextTurn = state.turn + (next === 'player' ? 1 : 0);
  const ap = state.activePlayer;
  let newState = {
    ...state, activePlayer: next, phase: TURN_PHASE.STAND,
    turn: nextTurn, isFirstTurn: false, attackingCard: null,
    linkAttackQueue: [], pendingDamage: 0,
    _usedThisTurn: {},
    _attackCountThisTurn: 0,
    _gboostUsedThisTurn: [],  // ✅ fix72: G.BOOST 사용 기록 초기화
    log: [...state.log, `\n--- ${next==='player'?'🎮 내':'🤖 AI'} 턴 (${nextTurn}턴) ---`],
  };

  // ✅ fix68: 턴 종료 트리거 (At the end of your turn)
  const endP = state[ap];
  for (const z of ['left','center','right']) {
    const card = endP.field[z];
    if (!card) continue;
    const text = card.text || '';
    const endTrigM = text.match(/[Aa]t\s+the\s+end\s+of\s+(?:your|each)\s+turn[,.]?\s*([\s\S]*?)(?=\n\n|\[Act\]|\[Auto\]|$)/i);
    if (!endTrigM) continue;
    const et = endTrigM[1];
    let condMet = true;
    const condM = et.match(/^if\s+(.*?)[,.]\s*([\s\S]+)/i);
    let effectText = et;
    if (condM) {
      effectText = condM[2];
      const cStr = condM[1].toLowerCase();
      const setNameM = cStr.match(/there is a [«"]([^»"]+)[»"]\s*\[set\]\s+on your field/i);
      if (setNameM) {
        const nm = setNameM[1].toLowerCase();
        const setCards = [].concat(...Object.values(newState[ap].setZone || {})).filter(Boolean);
        condMet = setCards.some(sc => (sc.name||'').toLowerCase().includes(nm));
      }
      const lifeM2 = cStr.match(/you have (\d+) life or less/i);
      if (lifeM2) condMet = endP.life <= parseInt(lifeM2[1]);
    }
    if (!condMet) continue;
    let pp = { ...newState[ap] };
    // 소울 추가
    if (/put\s+the\s+top\s+card.*?(?:into|soul)|into.*?soul/i.test(effectText) && pp.deck.length > 0 && !/gauge/i.test(effectText)) {
      const sc = pp.deck[0]; const cur = pp.field[z];
      pp = { ...pp, deck: pp.deck.slice(1), field: { ...pp.field, [z]: { ...cur, soul: [...(cur.soul||[]), sc] } } };
      newState = { ...newState, log: [...newState.log, `💫 ${card.name}: 턴 종료→소울(${sc.name})`] };
    }
    // 파괴
    if (/destroy\s+a\s+(?:monster|card)\s+on\s+your\s+opponent/i.test(effectText)) {
      const def = ap === 'player' ? 'ai' : 'player';
      const defP = newState[def];
      const tgtZones = ['center','left','right'].filter(tz => defP.field[tz]);
      if (tgtZones.length > 0) {
        const tz = tgtZones.sort((a,b)=>(defP.field[a].power||0)-(defP.field[b].power||0))[0];
        const dest = defP.field[tz];
        newState = { ...newState, [def]: { ...defP, field: { ...defP.field, [tz]: null }, drop: [...defP.drop, dest] },
          log: [...newState.log, `💀 ${card.name}: 턴 종료→${dest.name} 파괴`] };
      }
    }
    // 드로우
    const drawM = effectText.match(/draw\s+(\d+|a)\s+cards?/i);
    if (drawM && pp.deck.length > 0) {
      const n = drawM[1]==='a'?1:parseInt(drawM[1]);
      pp = { ...pp, hand: [...pp.hand, ...pp.deck.slice(0,n)], deck: pp.deck.slice(n) };
      newState = { ...newState, log: [...newState.log, `🃏 ${card.name}: 턴 종료→드로우 ${n}장`] };
    }
    // 차지
    if (/into\s+(?:your\s+)?gauge/i.test(effectText) && pp.deck.length > 0 && !/soul/i.test(effectText)) {
      pp = { ...pp, gauge: [...pp.gauge, pp.deck[0]], deck: pp.deck.slice(1) };
      newState = { ...newState, log: [...newState.log, `⚡ ${card.name}: 턴 종료→차지`] };
    }
    // 스탠드
    if (/\[stand\]\s+this\s+card|stand\s+this\s+card/i.test(effectText)) {
      const cur = pp.field[z];
      pp = { ...pp, field: { ...pp.field, [z]: { ...cur, state: 'stand' } } };
      newState = { ...newState, log: [...newState.log, `🔄 ${card.name}: 턴 종료→스탠드`] };
    }
    newState = { ...newState, [ap]: pp };
  }

  // Set 효과 - 상대 턴 종료 차지
  const oppSide = next;
  const oppSetCard = state.setZone?.[oppSide];
  if (oppSetCard && oppSetCard.text && /at\s+the\s+end\s+of\s+your\s+opponent'?s?\s+turn.*?(?:put|gauge)/i.test(oppSetCard.text)) {
    const opp = newState[oppSide];
    if (opp.deck.length > 0) {
      newState = { ...newState, [oppSide]: { ...opp, gauge: [...opp.gauge, opp.deck[0]], deck: opp.deck.slice(1) },
        log: [...newState.log, `⚡ [Set] ${oppSetCard.name}: 차지`] };
    }
  }
  return newState;
}

// ── 공격 시 발동 효과 (When this card attacks) ─────
export function applyAttackTrigger(state, attackerCard, attackerSide) {
  const text = attackerCard.text || '';
    const m = text.match(/[Ww]hen this card attacks[,.\s]*((?:(?![\n][\n]|\[Act\]|\[Auto\])[\s\S])*)/i)
  if (!m) return state;
  const effectText = m[1];

  let p = { ...state[attackerSide] };
  const def = attackerSide === 'player' ? 'ai' : 'player';
  let opp = { ...state[def] };
  const logs = [];

  // 드로우
  const drawM = effectText.match(/draw\s+(\d+)\s+cards?/i) || (/draw\s+a\s+card/i.test(effectText) ? ['','1'] : null);
  if (drawM && p.deck.length > 0) {
    const n = Math.min(parseInt(drawM[1]), p.deck.length);
    p = { ...p, hand: [...p.hand, ...p.deck.slice(0,n)], deck: p.deck.slice(n) };
    logs.push(`🃏 ${attackerCard.name}: 공격 시 드로우 ${n}장`);
  }
  // 차지
  if (/put.*?(?:top.*?card|card.*?top).*?gauge|into\s+your\s+gauge/i.test(effectText) && p.deck.length > 0) {
    p = { ...p, gauge: [...p.gauge, p.deck[0]], deck: p.deck.slice(1) };
    logs.push(`⚡ ${attackerCard.name}: 공격 시 차지`);
  }
  // 라이프 회복
  const lifeM = effectText.match(/you\s+gain\s+(\d+)\s+life/i);
  if (lifeM) {
    p = { ...p, life: Math.min(p.life + parseInt(lifeM[1]), 30) };
    logs.push(`❤️ ${attackerCard.name}: 공격 시 라이프 +${lifeM[1]}`);
  }
  // 데미지
  const dmgM = effectText.match(/deal\s+(\d+)\s+damage/i);
  if (dmgM) {
    opp = { ...opp, life: Math.max(0, opp.life - parseInt(dmgM[1])) };
    logs.push(`💥 ${attackerCard.name}: 공격 시 ${dmgM[1]} 데미지`);
  }
  // 파괴
  if (/destroy\s+a\s+(?:size\s*\d+\s+or\s+less\s+)?monster\s+on\s+your\s+opponent/i.test(effectText) ||
      (/when this card attacks and destroys/i.test(text))) {
    // "when this card attacks and destroys" 는 조건부라 별도 처리
    if (/destroy\s+a\s+(?:monster|card)/i.test(effectText)) {
      for (const z of ['center','left','right']) {
        if (opp.field[z]) {
          const destroyed = opp.field[z];
          opp = { ...opp, field: { ...opp.field, [z]: null }, drop: [...opp.drop, destroyed] };
          logs.push(`💀 ${destroyed.name} 파괴! (공격 효과)`);
          break;
        }
      }
    }
  }
  // 크리티컬 버프
  const critM = effectText.match(/critical\+(\d+)/i);
  if (critM) logs.push(`⭐ ${attackerCard.name}: 크리티컬+${critM[1]}`);
  // 드롭에서 손패
  if (/put.*?from\s+your\s+drop.*?hand/i.test(effectText) && p.drop.length > 0) {
    const picked = p.drop[p.drop.length - 1];
    p = { ...p, hand: [...p.hand, picked], drop: p.drop.slice(0, -1) };
    logs.push(`↩️ ${picked.name} 드롭→손패`);
  }
  // 이번 턴 버프
  const thisPow = effectText.match(/for\s+this\s+turn.*?(?:this card|it)\s+gets?\s+power\+(\d+)/i)
                || effectText.match(/give\s+it\s+power\+(\d+)/i);
  if (thisPow) {
    const zone = state.attackingCard?.zone || 'center';
    const atCard = zone === 'item' ? p.item : p.field[zone];
    if (atCard) {
      const updated = { ...atCard, power: (atCard.power ?? 0) + parseInt(thisPow[1]), _buffed: true };
      if (zone === 'item') p = { ...p, item: updated };
      else p = { ...p, field: { ...p.field, [zone]: updated } };
      logs.push(`⬆️ 이번 턴 파워+${thisPow[1]}`);
    }
  }
  const thisCrit = effectText.match(/for\s+this\s+turn.*?critical\+(\d+)/i);
  if (thisCrit) {
    const zone = state.attackingCard?.zone || 'center';
    const atCard = zone === 'item' ? p.item : p.field[zone];
    if (atCard) {
      const updated = { ...atCard, critical: (atCard.critical ?? 1) + parseInt(thisCrit[1]) };
      if (zone === 'item') p = { ...p, item: updated };
      else p = { ...p, field: { ...p.field, [zone]: updated } };
      logs.push(`⭐ 이번 턴 크리티컬+${thisCrit[1]}`);
    }
  }
  // 게이지 탈취
  if (/put\s+a\s+card\s+from\s+your\s+opponent.*?gauge.*?drop/i.test(effectText) && opp.gauge.length > 0) {
    const stolen = opp.gauge[opp.gauge.length - 1];
    opp = { ...opp, gauge: opp.gauge.slice(0, -1), drop: [...opp.drop, stolen] };
    logs.push(`⚡→🗑️ 게이지 탈취`);
  }

  // 공격 시 필드 전체 버프 (for this turn, all monsters on your field get power+N)
  const atkFieldM = effectText.match(/for\s+this\s+turn.*?all\s+(?:monsters?|cards?)\s+on\s+your\s+field\s+get[s]?\s+(?:power\+(\d+)|.*?power\+(\d+))/i);
  if (atkFieldM) {
    const val = parseInt(atkFieldM[1] || atkFieldM[2] || 0);
    if (val > 0) {
      const newField = {};
      for (const z of ['left','center','right']) newField[z] = p.field[z] ? { ...p.field[z], power: (p.field[z].power??0)+val, _buffed:true } : null;
      p = { ...p, field: newField };
      logs.push(`⬆️ 공격 시 내 필드 파워+${val}`);
    }
  }
  // 공격 시 크리티컬 버프 (another card gets critical+N)
  const atkCritM = effectText.match(/(?:another\s+[«"]?[^»"]*[»"]?\s+on\s+your\s+field|a\s+card\s+on\s+your\s+field)\s+gets?\s+critical\+(\d+)/i);
  if (atkCritM) {
    const val = parseInt(atkCritM[1]);
    const atZone = state.attackingCard?.zone;
    for (const z of ['left','center','right']) {
      if (z !== atZone && p.field[z]) {
        p = { ...p, field: { ...p.field, [z]: { ...p.field[z], critical: (p.field[z].critical??1)+val } } };
        logs.push(`⭐ ${p.field[z]?.name}: 크리티컬+${val}`);
        break;
      }
    }
  }

  if (logs.length === 0) return state;
  const newState = { ...state, [attackerSide]: p, [def]: opp, log: [...state.log, ...logs] };
  if (opp.life <= 0) return { ...newState, winner: attackerSide };
  return newState;
}

// ── 공격 시 조건부 키워드 부여 (When this card attacks, if X, gets [KW]) ──
export function applyAttackConditionalKeywords(state, attackerCard, attackerZone, attackerSide) {
  const text = attackerCard.text || '';
  // "When this card attacks, if ... , for this turn, this card gets [KW]" 패턴
  const condKwRe = /[Ww]hen this card attacks[,.]?\s+if\s+(.*?)[,.]\s+for\s+this\s+turn[,.]?\s+this\s+card\s+gets?\s+\[([\w\s]+)\]/gi;
  let match;
  let p = { ...state[attackerSide] };
  let changed = false;
  const logs = [];

  while ((match = condKwRe.exec(text)) !== null) {
    const condText = match[1].toLowerCase();
    const kw = match[2];
    let condMet = false;

    // "your equipped «X» is [Stand]" 조건
    const equippedStandM = condText.match(/your\s+equipped\s+[«"]([^»"]+)[»"]\s+is\s+\[stand\]/i);
    if (equippedStandM) {
      const itemName = equippedStandM[1].trim().toLowerCase();
      condMet = p.item &&
        (p.item.name || '').toLowerCase().includes(itemName) &&
        p.item.state === 'stand';
    }
    // "you have a «X» on your field" 조건
    const fieldNameM = condText.match(/you\s+have\s+(?:a|an)\s+[«"]?([^»",]+)[»"]?\s+on\s+your\s+field/i);
    if (!condMet && fieldNameM) {
      const nm = fieldNameM[1].trim().toLowerCase();
      condMet = ['left','center','right'].some(z => p.field[z] && (p.field[z].name||'').toLowerCase().includes(nm));
    }
    // "your life is N or less" 조건
    const lifeCondM = condText.match(/your\s+life\s+is\s+(\d+)\s+or\s+less/i);
    if (!condMet && lifeCondM) condMet = p.life <= parseInt(lifeCondM[1]);

    if (condMet) {
      // 이번 턴 한정 키워드 부여
      const card = attackerZone === 'item' ? p.item : p.field[attackerZone];
      if (card && !(card._conditionalKws || []).includes(kw)) {
        const updated = { ...card, _conditionalKws: [...(card._conditionalKws || []), kw] };
        if (attackerZone === 'item') p = { ...p, item: updated };
        else p = { ...p, field: { ...p.field, [attackerZone]: updated } };
        logs.push(`✨ 조건 충족: ${attackerCard.name} [${kw}] 획득!`);
        changed = true;
      }
    }
  }
  if (!changed) return state;
  return { ...state, [attackerSide]: p, log: [...state.log, ...logs] };
}

// ── 파괴 시 발동 효과 (When this card is destroyed) ──
export function applyDestroyTrigger(state, destroyedCard, ownerSide) {
  const text = destroyedCard.text || '';
  const m = text.match(/[Ww]hen\s+(?:this\s+card\s+is\s+)?destroyed[,.]?\s*([\s\S]*?)(?=\[Act\]|\[Auto\]|\[Cont\]|$)/);
  // deck→drop 트리거
  const deckDropM = text.match(/[Ww]hen\s+this\s+card\s+is\s+put.*?(?:deck|drop\s+zone).*?drop.*?call\s+this\s+card/i);
  if (deckDropM && !state[ownerSide].field.center && !state[ownerSide].field.left) {
    const emptyZ = ['left','center','right'].find(z => !state[ownerSide].field[z]);
    if (emptyZ) {
      const p = state[ownerSide];
      const revived = { ...destroyedCard, state: 'stand', soul: [] };
      return { ...state, [ownerSide]: { ...p, field: { ...p.field, [emptyZ]: revived }, drop: p.drop.filter(c=>c.instanceId!==destroyedCard.instanceId) }, log: [...state.log, `🔁 ${destroyedCard.name} 덱드롭→소환!`] };
    }
  }
  if (!m) return state;
  const effectText = m[1];

  let p = { ...state[ownerSide] };
  const def = ownerSide === 'player' ? 'ai' : 'player';
  let defP = { ...state[def] };
  const logs = [];

  if (/put\s+the\s+top\s+card.*?gauge|into\s+your\s+gauge/i.test(effectText) && p.deck.length > 0) {
    p = { ...p, gauge: [...p.gauge, p.deck[0]], deck: p.deck.slice(1) };
    logs.push(`⚡ ${destroyedCard.name} 파괴: 차지`);
  }
  const drawM = effectText.match(/draw\s+(\d+)\s+cards?/i) || (/draw\s+a\s+card/i.test(effectText) ? ['','1'] : null);
  if (drawM && p.deck.length > 0) {
    const n = Math.min(parseInt(drawM[1]), p.deck.length);
    p = { ...p, hand: [...p.hand, ...p.deck.slice(0,n)], deck: p.deck.slice(n) };
    logs.push(`🃏 ${destroyedCard.name} 파괴: 드로우 ${n}장`);
  }
  const gainM = effectText.match(/you\s+gain\s+(\d+)\s+life/i);
  if (gainM) {
    p = { ...p, life: Math.min(p.life + parseInt(gainM[1]), 30) };
    logs.push(`❤️ ${destroyedCard.name} 파괴: 라이프 +${gainM[1]}`);
  }
  const dmgM = effectText.match(/deal\s+(\d+)\s+damage/i);
  if (dmgM) {
    defP = { ...defP, life: Math.max(0, defP.life - parseInt(dmgM[1])) };
    logs.push(`💥 ${destroyedCard.name} 파괴: ${dmgM[1]} 데미지`);
  }

  if (logs.length === 0) return state;
  const result = { ...state, [ownerSide]: p, [def]: defP, log: [...state.log, ...logs] };
  if (defP.life <= 0) return { ...result, winner: ownerSide };
  return result;
}


export function evaluateConditionalKeywords(state) {
  // player와 ai 양쪽 필드 카드에 대해 조건부 키워드 평가
  let newState = { ...state };
  for (const side of ['player', 'ai']) {
    const p = newState[side];
    let changed = false;
    const newField = { ...p.field };
    for (const zone of ['left','center','right']) {
      const card = newField[zone];
      if (!card) continue;
      const text = card.text || '';
      if (!text.includes('gets [')) continue;

      const conditionalKws = ['Double Attack','Triple Attack','Penetrate','Soulguard','Counterattack','Lifelink 1','Lifelink 2','Lifelink 3'];
      for (const kw of conditionalKws) {
        const condM = text.match(new RegExp(`[Ii]f\\s+(.*?)[,.]?\\s*(?:this card|it)\\s+gets?\\s+\\[${kw.replace(' ','\\s+')}\\]`, 'i'));
        if (!condM) continue;

        const cond = condM[1].toLowerCase();
        let condMet = false;

        // 같은 이름 카드 필드에 있으면
        const nameM2 = cond.match(/another card with ["'«]?([^"'»,]+)["'»]? in its card name/i);
        if (nameM2) {
          const kw2 = nameM2[1].trim().toLowerCase();
          condMet = ['left','center','right'].filter(z=>z!==zone).some(z=>
            newField[z] && (
              (newField[z].name||'').toLowerCase().includes(kw2) ||
              (newField[z].tribe||'').toLowerCase().includes(kw2)
            )
          );
        }
        // 플래그 조건
        const flagM2 = cond.match(/your flag is ["'«]?([^"'»]+)["'»]?/i);
        if (flagM2) condMet = p.flag && (p.flag.name||'').toLowerCase().includes(flagM2[1].trim().toLowerCase());
        // 라이프 조건
        const lifeM2 = cond.match(/you have (\d+) life or less/i);
        if (lifeM2) condMet = p.life <= parseInt(lifeM2[1]);
        // 필드 카드 조건
        const haveM2 = cond.match(/you have (?:a|an)\s+[«"]?([^"'»]+)[»"]?/i);
        if (haveM2) {
          const kw3 = haveM2[1].trim().toLowerCase();
          condMet = Object.values(newField).filter(Boolean).some(c => c !== card && ((c.name||'').toLowerCase().includes(kw3) || (c.text||'').toLowerCase().includes(kw3)));
        }

        if (condMet) {
          // 키워드 없으면 텍스트에 추가 (임시 플래그)
          if (!card._conditionalKws?.includes(kw)) {
            newField[zone] = { ...card, _conditionalKws: [...(card._conditionalKws || []), kw] };
            changed = true;
          }
        }
      }
    }
    if (changed) newState = { ...newState, [side]: { ...p, field: newField } };
  }
  // ── D-Share: 공통 효과 공유 ──
  for (const side of ['player', 'ai']) {
    const p = newState[side];
    const dshareCards = ['left','center','right'].map(z => p.field[z]).filter(c => c && (c.text||'').includes('[D-Share]'));
    if (dshareCards.length >= 2) {
      // [D-Share] 카드들의 공통 D 효과 추출 후 모든 D-Share 카드에 적용
      const dEffects = { power: 0, defense: 0, critical: 0 };
      for (const dc of dshareCards) {
        const dm = (dc.text||'').match(/\[D\]\s*(?:power\+(\d+))?.*?(?:defense\+(\d+))?.*?(?:critical\+(\d+))?/i);
        if (dm) {
          dEffects.power = Math.max(dEffects.power, parseInt(dm[1]||0));
          dEffects.defense = Math.max(dEffects.defense, parseInt(dm[2]||0));
          dEffects.critical = Math.max(dEffects.critical, parseInt(dm[3]||0));
        }
      }
      if (dEffects.power > 0 || dEffects.defense > 0) {
        let newField = { ...p.field };
        for (const z of ['left','center','right']) {
          const fc = newField[z];
          if (fc && (fc.text||'').includes('[D-Share]') && !fc._dShareBuffed) {
            newField[z] = { ...fc,
              power: (fc._basePower??fc.power) + dEffects.power,
              defense: (fc._basePower??fc.defense) + dEffects.defense,
              _basePower: fc._basePower??fc.power,
              _dShareBuffed: true,
            };
          }
        }
        newState = { ...newState, [side]: { ...p, field: newField } };
      }
    }
  }

  // [Cont] 스타일: "all «X» on your field get power+N" 필드 지속 버프
  for (const side of ['player', 'ai']) {
    const p = newState[side];
    let newField = { ...p.field };
    let changed = false;
    for (const zone of ['left','center','right']) {
      const card = newField[zone];
      if (!card) continue;
      const text = card.text || '';
      // "all «X» on your field get power+N"
      const contBufM = text.match(/all\s+[«"]([^»"]+)[»"]\s+on\s+your\s+field\s+get[s]?\s+power\+(\d+)/i);
      if (contBufM) {
        const tribe = contBufM[1].trim().toLowerCase();
        const pw = parseInt(contBufM[2]);
        for (const z2 of ['left','center','right']) {
          const fc = newField[z2];
          if (!fc || z2 === zone) continue;
          const matchTribe = (fc.tribe||'').toLowerCase().includes(tribe) || (fc.name||'').toLowerCase().includes(tribe);
          if (matchTribe && !(fc._contBuffFrom||'').includes(card.instanceId||zone)) {
            newField[z2] = { ...fc, power: (fc._basePower ?? fc.power) + pw,
              _basePower: fc._basePower ?? fc.power, _contBuffFrom: (fc._contBuffFrom||'')+zone };
            changed = true;
          }
        }
      }
    }
    if (changed) newState = { ...newState, [side]: { ...p, field: newField } };
  }

  return newState;
}

// ── [Act] 능동 효과 발동 ─────────────────────────
export function playActEffect(state, zone) {
  const ap = state.activePlayer;
  const p = state[ap];
  const card = zone === 'item' ? p.item : p.field[zone];
  if (!card) return state;
  return applyActEffect(state, card, zone, ap);
}

// ── 손패에서 [Act] 발동 ─────────────────────────
export function playHandActEffect(state, instanceId) {
  const ap = state.activePlayer;
  const p = state[ap];
  const card = p.hand.find(c => c.instanceId === instanceId);
  if (!card) return state;

  const text = card.text || '';
  const m = text.match(/\[Act\][^[]*?([\s\S]*?)(?=\n\n|\[Act\]|\[Auto\]|\[Cont\]|$)/i);
  if (!m) return state;
  const effectText = m[1];
  const def = ap === 'player' ? 'ai' : 'player';
  let pp = { ...p };
  let defP = { ...state[def] };
  const logs = [];

  // 조건 체크: "if you have a size N monster on your field"
  const condM = effectText.match(/[Ii]f you have a size (\d+) monster/i);
  if (condM) {
    const reqSize = parseInt(condM[1]);
    const hasIt = Object.values(pp.field).some(c => c && (c.size ?? 0) >= reqSize);
    if (!hasIt) return { ...state, log: [...state.log, `❌ ${card.name}: 필드에 size ${reqSize} 몬스터 필요`] };
  }

  // 코스트 지불 후 손패에서 제거
  let gaugeCost = 0;
  let lifeCost = 0;
  const gcM = effectText.match(/pay (\d+) gauge/i); if (gcM) gaugeCost = parseInt(gcM[1]);
  const lcM = effectText.match(/pay (\d+) life/i); if (lcM) lifeCost = parseInt(lcM[1]);
  const discardSelf = /discard this card/i.test(effectText);

  if (gaugeCost > pp.gauge.length) return { ...state, log: [...state.log, `❌ 게이지 부족`] };
  if (lifeCost > 0 && pp.life <= lifeCost) return { ...state, log: [...state.log, `❌ 라이프 부족`] };

  if (gaugeCost) pp = { ...pp, gauge: pp.gauge.slice(0, -gaugeCost) };
  if (lifeCost) pp = { ...pp, life: pp.life - lifeCost };
  if (discardSelf) {
    pp = { ...pp, hand: pp.hand.filter(c => c.instanceId !== instanceId), drop: [...pp.drop, card] };
  }

  logs.push(`✨ [Act] ${card.name} 발동!`);

  // 효과 적용
  const dmgM = effectText.match(/deal (\d+) damage/i);
  if (dmgM) { defP = { ...defP, life: Math.max(0, defP.life - parseInt(dmgM[1])) }; logs.push(`💥 ${dmgM[1]} 데미지`); }

  const gaugeM2 = effectText.match(/put the top (\w+) cards?.*?gauge/i);
  if (gaugeM2) {
    const nums = {one:1,two:2,three:3,four:4,five:5};
    const n = nums[gaugeM2[1].toLowerCase()] ?? parseInt(gaugeM2[1]) ?? 1;
    const drawn = pp.deck.slice(0, n);
    pp = { ...pp, gauge: [...pp.gauge, ...drawn], deck: pp.deck.slice(n) };
    logs.push(`⚡ 차지 ${n}장`);
  }

  const drawM = effectText.match(/draw (\d+|a) cards?/i);
  if (drawM && pp.deck.length > 0) {
    const n = drawM[1] === 'a' ? 1 : parseInt(drawM[1]);
    pp = { ...pp, hand: [...pp.hand, ...pp.deck.slice(0,n)], deck: pp.deck.slice(n) };
    logs.push(`🃏 드로우 ${n}장`);
  }

  const powM = effectText.match(/(?:a|one)\s+monster.*?gets? power\+(\d+)/i);
  if (powM) logs.push(`⬆️ 버프 +${powM[1]} (대상 선택 필요)`);

  const nullM = /nullify.*?attack/i.test(effectText);
  if (nullM) { logs.push(`🛡️ 공격 무효화`); }

  const result = { ...state, [ap]: pp, [def]: defP, log: [...state.log, ...logs] };
  if (defP.life <= 0) return { ...result, winner: ap };
  return result;
}

export function advancePhase(state) {
  const order = [TURN_PHASE.STAND,TURN_PHASE.DRAW,TURN_PHASE.CHARGE,TURN_PHASE.MAIN,TURN_PHASE.ATTACK,TURN_PHASE.FINAL,TURN_PHASE.END];
  const idx = order.indexOf(state.phase);
  const next = order[(idx+1) % order.length];
  if (next === TURN_PHASE.STAND) return endTurn(state);
  let newState = { ...state, phase: next };
  // setZone 지속 효과 처리 (메인 페이즈 진입 시)
  if (next === TURN_PHASE.MAIN) {
    const ap2 = newState.activePlayer;
    const setCards = newState.setZone?.[ap2];
    const setCardList = !setCards ? [] : (Array.isArray(setCards) ? setCards : [setCards]);
    for (const setCard of setCardList) {
    if (setCard && setCard.text) {
      const st = setCard.text;
      let pp = { ...newState[ap2] };
      const def2 = ap2 === 'player' ? 'ai' : 'player';
      let dp = { ...newState[def2] };
      const setLogs = [];

      // "At the beginning of your main phase, you gain N life"
      const gainM = st.match(/[Aa]t the beginning of your main phase.*?you gain (\d+) life/i);
      if (gainM) { pp = { ...pp, life: Math.min(pp.life + parseInt(gainM[1]), 30) }; setLogs.push(`❤️ [Set] ${setCard.name}: 라이프 +${gainM[1]}`); }

      // "All monsters ... get power+N and defense+N"
      const buffM = st.match(/[Aa]ll monsters.{0,60}get power\+(\d+)(?:.*?defense\+(\d+))?/i);
      if (buffM) {
        const pw = parseInt(buffM[1]), df = parseInt(buffM[2] || 0);
        const newField = {};
        for (const z of ['left','center','right']) {
          const fc = pp.field[z]; if (!fc) { newField[z] = null; continue; }
          newField[z] = { ...fc, power: (fc._origPower??fc.power)+pw, defense: (fc._origDefense??fc.defense)+df,
            _setBuffed: true, _origPower: fc._origPower??fc.power, _origDefense: fc._origDefense??fc.defense };
        }
        pp = { ...pp, field: newField };
        setLogs.push(`⬆️ [Set] ${setCard.name}: 필드 파워+${pw}${df?` 방어+${df}`:''}`);
      }

      // "draw a card" at beginning
      if (/[Aa]t the beginning of your main phase.*?draw a card/is.test(st)) {
        if (pp.deck.length > 0) { pp = { ...pp, hand: [...pp.hand, pp.deck[0]], deck: pp.deck.slice(1) }; setLogs.push(`🃏 [Set] ${setCard.name}: 드로우`); }
      }

      // 상대 제한: "opponent cannot call monsters to the center"
      if (/opponent.*?cannot call.*?center|cannot call.*?center.*?opponent/i.test(st)) {
        dp = { ...dp, _cannotCallCenter: true };
        setLogs.push(`🚫 [Set] ${setCard.name}: 상대 센터 소환 불가`);
      }

      // "cannot call size N or less" 전체 소환 제한
      if (/cannot call.*?size\s*(\d+)\s*or\s*less|you\s+and\s+your\s+opponent.*?cannot call.*?size/i.test(st)) {
        const szM = st.match(/size\s*(\d+)\s*or\s*less/i);
        const sz = szM ? parseInt(szM[1]) : 1;
        pp = { ...pp, _cannotCallSizeLimit: sz };
        dp = { ...dp, _cannotCallSizeLimit: sz };
        setLogs.push(`🚫 [Set] ${setCard.name}: 사이즈 ${sz} 이하 소환 불가`);
      }

      // "all X monsters on your field cannot be destroyed"
      if (/all\s+.*?(?:monsters?|«[^»]+»).*?cannot\s+be\s+(?:destroyed|removed)/i.test(st)) {
        const tribeM = st.match(/all\s+«([^»]+)»\s+monsters?/i);
        pp = { ...pp, _setIndestructible: tribeM ? tribeM[1].toLowerCase() : 'all' };
        setLogs.push(`🛡️ [Set] ${setCard.name}: 필드 몬스터 파괴 불가`);
      }

      // "when a monster on your field is destroyed, put the top card into gauge"
      if (/when\s+a\s+(?:monster|card)\s+on\s+your\s+field\s+is\s+destroyed.*?gauge/i.test(st)) {
        pp = { ...pp, _setGaugeOnDestroy: true };
        setLogs.push(`⚡ [Set] ${setCard.name}: 파괴 시 차지 활성화`);
      }

      // "At the start of your opponent's main phase, choose one of opponent's field and rest it"
      if (/[Aa]t\s+the\s+start\s+of\s+your\s+opponent.*?(?:rest|choose)/i.test(st)) {
        // 상대 필드 카드 1장 레스트
        const zones = ['left','center','right'];
        const standZone = zones.find(z => dp.field[z]?.state === 'stand');
        if (standZone) {
          dp = { ...dp, field: { ...dp.field, [standZone]: { ...dp.field[standZone], state: 'rest' } } };
          setLogs.push(`😴 [Set] ${setCard.name}: 상대 ${standZone} 레스트`);
        }
      }

      // "opponent cannot cast/use Counter" 
      if (/opponent\s+cannot.*?(?:cast|use).*?(?:counter|spell)/i.test(st)) {
        dp = { ...dp, _cannotUseCounter: true };
        setLogs.push(`🚫 [Set] ${setCard.name}: 상대 카운터 사용 불가`);
      }

      // "when a X on your field [Move], draw a card"
      if (/when.*?(?:\[Move\]|moves?).*?draw\s+a\s+card/i.test(st)) {
        pp = { ...pp, _setDrawOnMove: true };
      }

      // "damage to players is reduced by N"
      const dmgRedM = st.match(/damage.*?(?:to\s+(?:you|players?))?.*?(?:reduced?|decreased?)\s+by\s+(\d+)/i);
      if (dmgRedM) {
        pp = { ...pp, _setDamageReduce: parseInt(dmgRedM[1]) };
        setLogs.push(`🛡️ [Set] ${setCard.name}: 데미지 ${dmgRedM[1]} 감소`);
      }

      // "All X on your field get power+N" (기존 buffM과 다른 패턴)
      const buffM2 = st.match(/[Aa]ll\s+«([^»]+)»\s+(?:monsters?|on\s+your\s+field).*?get\s+power\+(\d+)(?:.*?defense\+(\d+))?/i);
      if (buffM2 && !buffM) {
        const tribe = buffM2[1].toLowerCase(), pw2 = parseInt(buffM2[2]), df2 = parseInt(buffM2[3]||0);
        const newField2 = {};
        for (const z of ['left','center','right']) {
          const fc = pp.field[z]; if (!fc) { newField2[z] = null; continue; }
          const match = (fc.tribe||'').toLowerCase().includes(tribe) || (fc.name||'').toLowerCase().includes(tribe);
          newField2[z] = match ? { ...fc, power: (fc._origPower??fc.power)+pw2, defense: (fc._origDefense??fc.defense)+df2,
            _setBuffed: true, _origPower: fc._origPower??fc.power, _origDefense: fc._origDefense??fc.defense } : fc;
        }
        pp = { ...pp, field: newField2 };
        setLogs.push(`⬆️ [Set] ${setCard.name}: «${buffM2[1]}» 파워+${pw2}${df2?` 방어+${df2}`:''}`);
      }

      if (setLogs.length) newState = { ...newState, [ap2]: pp, [def2]: dp, log: [...newState.log, ...setLogs] };
    } // end if setCard
    } // end for setCardList
    // 상대의 _cannotCallCenter 해제 (자신의 턴)
    const opp2 = newState.activePlayer === 'player' ? 'ai' : 'player';
    if (!newState.setZone?.[opp2] && newState[opp2]?._cannotCallCenter) {
      newState = { ...newState, [opp2]: { ...newState[opp2], _cannotCallCenter: undefined } };
    }
  }
  // 페이즈 진입 시 phase_trigger 처리 (main/attack/final)
  if (next === TURN_PHASE.MAIN || next === TURN_PHASE.ATTACK || next === TURN_PHASE.FINAL) {
    const phaseName = next;
    const ap = state.activePlayer;
    const p = newState[ap];
    for (const z of ['left','center','right']) {
      const card = p.field[z];
      if (!card) continue;
      const trigger = parsePhaseTrigger(card.text || '');
      if (!trigger || trigger.phase !== phaseName) continue;

      // ✅ fix67: 조건부 트리거 체크
      if (trigger.condition) {
        const cond = trigger.condition;
        let condMet = false;
        if (cond.fieldMonsterNameContains) {
          const nm = cond.fieldMonsterNameContains;
          condMet = ['left','center','right'].some(fz => {
            const fc = p.field[fz];
            if (!fc) return false;
            const nameMatch = (fc.name||'').toLowerCase().includes(nm);
            if (cond.fieldMonsterSize) return nameMatch && (fc._originalSize ?? fc.size) === cond.fieldMonsterSize;
            return nameMatch;
          });
        }
        if (!condMet && cond.fieldNameContains) {
          const nm = cond.fieldNameContains;
          condMet = ['left','center','right'].some(fz => p.field[fz] && (p.field[fz].name||'').toLowerCase().includes(nm));
        }
        if (!condMet && cond.maxLife) condMet = p.life <= cond.maxLife;
        if (!condMet && cond.equippedNameContains) {
          condMet = p.item && (p.item.name||'').toLowerCase().includes(cond.equippedNameContains);
        }
        if (!condMet) continue;
      }

      const def = ap === 'player' ? 'ai' : 'player';
      let pp = { ...newState[ap] };
      if (trigger.gainGauge && pp.deck.length > 0) {
        pp = { ...pp, gauge: [...pp.gauge, pp.deck[0]], deck: pp.deck.slice(1) };
        newState = { ...newState, log: [...newState.log, `⚡ ${card.name}: 페이즈 차지`] };
      }
      if (trigger.draw && pp.deck.length > 0) {
        const drawn = pp.deck.slice(0, trigger.draw);
        pp = { ...pp, hand: [...pp.hand, ...drawn], deck: pp.deck.slice(trigger.draw) };
        newState = { ...newState, log: [...newState.log, `🃏 ${card.name}: 페이즈 드로우 ${drawn.length}장`] };
      }
      if (trigger.gainLife) {
        pp = { ...pp, life: Math.min(pp.life + trigger.gainLife, 30) };
        newState = { ...newState, log: [...newState.log, `❤️ ${card.name}: 라이프 +${trigger.gainLife}`] };
      }
      // ✅ fix67: 파워/크리티컬/방어 버프
      if (trigger.powerBuff || trigger.critBuff || trigger.defenseBuff) {
        const curCard = pp.field[z];
        if (curCard) {
          const buffed = {
            ...curCard,
            power: (curCard.power ?? 0) + (trigger.powerBuff ?? 0),
            critical: (curCard.critical ?? 1) + (trigger.critBuff ?? 0),
            defense: (curCard.defense ?? 0) + (trigger.defenseBuff ?? 0),
            _buffed: true,
          };
          pp = { ...pp, field: { ...pp.field, [z]: buffed } };
          const bl = [trigger.powerBuff&&`파워+${trigger.powerBuff}`,trigger.critBuff&&`크리티컬+${trigger.critBuff}`,trigger.defenseBuff&&`방어+${trigger.defenseBuff}`].filter(Boolean).join(', ');
          newState = { ...newState, log: [...newState.log, `⬆️ ${card.name}: ${bl}`] };
        }
      }
      if (trigger.fieldPowerBuff) {
        const nf = {};
        for (const fz of ['left','center','right']) nf[fz] = pp.field[fz] ? { ...pp.field[fz], power: (pp.field[fz].power??0)+trigger.fieldPowerBuff, _buffed:true } : null;
        pp = { ...pp, field: nf };
        newState = { ...newState, log: [...newState.log, `⬆️ ${card.name}: 필드 전체 파워+${trigger.fieldPowerBuff}`] };
      }
      // ✅ fix72: G.BOOST 효과 적용
      if (trigger.gboost) {
        // 필드 전체 파워 버프
        if (trigger.fieldPowerBuff) {
          const nf = {};
          for (const fz of ['left','center','right']) nf[fz] = pp.field[fz] ? { ...pp.field[fz], power: (pp.field[fz].power??0)+trigger.fieldPowerBuff, _buffed:true } : null;
          pp = { ...pp, field: nf };
        }
        // Penetrate 부여
        if (trigger.grantFieldPenetrate) {
          const nf = {};
          for (const fz of ['left','center','right']) {
            if (pp.field[fz]) nf[fz] = { ...pp.field[fz], _conditionalKws: [...(pp.field[fz]._conditionalKws||[]), 'Penetrate'] };
            else nf[fz] = null;
          }
          pp = { ...pp, field: nf };
        }
        // Triple Attack 부여
        if (trigger.grantFieldTriple) {
          const nf = {};
          for (const fz of ['left','center','right']) {
            if (pp.field[fz]) nf[fz] = { ...pp.field[fz], _conditionalKws: [...(pp.field[fz]._conditionalKws||[]), 'Triple Attack'] };
            else nf[fz] = null;
          }
          pp = { ...pp, field: nf };
        }
        // 크리티컬 버프 (이 카드)
        if (trigger.critBuff) {
          const cur = pp.field[z];
          if (cur) pp = { ...pp, field: { ...pp.field, [z]: { ...cur, critical: (cur.critical??1)+trigger.critBuff, _buffed:true } } };
        }
        // Then-if 조건: 다른 «X»가 필드에 있으면 추가 효과
        if (trigger.gboostThenCondTribe) {
          const tribeOK = ['left','center','right'].some(fz => fz!==z && pp.field[fz] && (pp.field[fz].tribe||'').toLowerCase().includes(trigger.gboostThenCondTribe));
          if (tribeOK) {
            if (trigger.gboostThenFieldPower) {
              const nf = {};
              for (const fz of ['left','center','right']) nf[fz] = pp.field[fz] ? { ...pp.field[fz], power: (pp.field[fz].power??0)+trigger.gboostThenFieldPower, _buffed:true } : null;
              pp = { ...pp, field: nf };
            }
            if (trigger.gboostThenTriple) {
              for (const fz of ['left','center','right']) if (pp.field[fz]) pp = { ...pp, field: { ...pp.field, [fz]: { ...pp.field[fz], _conditionalKws: [...(pp.field[fz]._conditionalKws||[]), 'Triple Attack'] } } };
            }
            if (trigger.gboostThenDouble) {
              for (const fz of ['left','center','right']) if (pp.field[fz]) pp = { ...pp, field: { ...pp.field, [fz]: { ...pp.field[fz], _conditionalKws: [...(pp.field[fz]._conditionalKws||[]), 'Double Attack'] } } };
            }
            if (trigger.gboostThenShadowDive) {
              for (const fz of ['left','center','right']) if (pp.field[fz]) pp = { ...pp, field: { ...pp.field, [fz]: { ...pp.field[fz], _conditionalKws: [...(pp.field[fz]._conditionalKws||[]), 'Shadow Dive'] } } };
            }
          }
        }
        // G.BOOST 드로우
        if (trigger.draw && pp.deck.length > 0) {
          const drawn = pp.deck.slice(0, trigger.draw);
          pp = { ...pp, hand: [...pp.hand, ...drawn], deck: pp.deck.slice(trigger.draw) };
          newState = { ...newState, log: [...newState.log, `⚡ [G.BOOST] ${card.name}: 드로우 ${drawn.length}장`] };
        }
        // G.BOOST 사용 표시 (발동 조건 체크용)
        newState = { ...newState, _gboostUsedThisTurn: [...(newState._gboostUsedThisTurn||[]), trigger.gboostType||'base'],
          log: [...newState.log, `⚡ [G.BOOST] ${card.name} 발동!`] };
      }
      newState = { ...newState, [ap]: pp };
    }
  }
  return newState;
}

// ── 세트 존 (필드 지속 마법) ──────────────────────────
export function setSpell(state, instanceId) {
  const ap = state.activePlayer;
  const p = state[ap];
  const idx = p.hand.findIndex(c => c.instanceId === instanceId);
  if (idx === -1) return state;
  const card = p.hand[idx];
  if (card.type !== CARD_TYPE.SPELL && !(card.type === CARD_TYPE.IMPACT && (card.text||'').includes('[Set]'))) return state;
  const newHand = [...p.hand]; newHand.splice(idx, 1);
  // setZone을 배열로 관리 (다중 Set 지원)
  const currentSets = state.setZone?.[ap] || [];
  const setList = Array.isArray(currentSets) ? currentSets : [currentSets];
  // 동일 카드 중복 Set 방지 (You may only [Set] one X)
  const alreadySet = setList.some(s => s.id === card.id);
  if (alreadySet && /may only \[set\] one/i.test(card.text||''))
    return { ...state, log: [...state.log, `❌ ${card.name}: 중복 세트 불가`] };
  const newSetZone = { ...(state.setZone || {}), [ap]: [...setList, card] };
  return {
    ...state,
    [ap]: { ...p, hand: newHand },
    setZone: newSetZone,
    log: [...state.log, `[${ap==='player'?'나':'AI'}] ${card.name} 세트!`],
  };
}

export function removeSetSpell(state, side) {
  const setZone = { ...(state.setZone || {}), [side]: null };
  return { ...state, setZone, log: [...state.log, `세트 마법 제거`] };
}

// zone_check_added