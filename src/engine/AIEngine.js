import { CARD_TYPE, CARD_STATE, TURN_PHASE } from '../utils/constants.js';
import { parseCost, canPayCost, parseSpellEffect } from './CostSystem.js';
import { applyActEffect } from './MonsterEffects.js';
import {
  getFieldTotalSize, getEmptyZones,
  doStandPhase, doDrawPhase, doChargeAndDraw, chargeFromHand,
  callMonster, equipItem, declareAttack, addToLinkAttack, resolveAttack,
  castSpell, endTurn, setSpell,
} from './GameEngine.js';

// ── 난이도 설정 ──────────────────────────────────────
let _difficulty = 'normal';
export function setAIDifficulty(d) { _difficulty = d; }
export function getAIDifficulty() { return _difficulty; }

const sleep = ms => new Promise(r => setTimeout(r, ms));

const DIFF = {
  easy: {
    sleepMs: 1200,
    spellUse: false, actUse: false, setSpellUse: false,
    linkAtk: false, optimal: false, attackAll: false,
    counterUse: false, chargeOptimal: false, itemEquipBest: false,
    maxSpells: 0, maxAct: 0,
  },
  normal: {
    sleepMs: 900,
    spellUse: true, actUse: false, setSpellUse: true,
    linkAtk: false, optimal: false, attackAll: true,
    counterUse: true, chargeOptimal: true, itemEquipBest: false,
    maxSpells: 1, maxAct: 0,
  },
  hard: {
    sleepMs: 600,
    spellUse: true, actUse: true, setSpellUse: true,
    linkAtk: true, optimal: true, attackAll: true,
    counterUse: true, chargeOptimal: true, itemEquipBest: true,
    maxSpells: 2, maxAct: 2,
  },
  disaster: {
    sleepMs: 300,
    spellUse: true, actUse: true, setSpellUse: true,
    linkAtk: true, optimal: true, attackAll: true,
    counterUse: true, chargeOptimal: true, itemEquipBest: true,
    maxSpells: 4, maxAct: 3,
  },
};

function getDiff() { return DIFF[_difficulty] || DIFF.normal; }
function getSleepMs() { return getDiff().sleepMs || 300; }

// ── 스펠 발동 가능 여부 ────────────────────────────────
function canAICastSpell(state, card) {
  if (card.type !== CARD_TYPE.SPELL && card.type !== CARD_TYPE.IMPACT) return false;
  if (/\[Counter\]/i.test(card.text||'')) return false; // Counter는 방어용
  const cost = parseCost(card.text);
  if (cost) {
    const check = canPayCost(state.ai, cost);
    if (!check.ok) return false;
  }
  const effect = parseSpellEffect(card.text || '');
  if (!effect || Object.keys(effect).length === 0) return false;
  // canCastSpell 조건 간단 체크
  const t = (card.text||'').toLowerCase();
  if (/you may only cast this card if your opponent has (\d+) life or less/i.test(t)) {
    const m = t.match(/opponent has (\d+) life/i);
    if (m && state.player.life > parseInt(m[1])) return false;
  }
  if (/only cast.*?during an attack on your opponent/i.test(t)) return false; // Counter 전용
  return true;
}

// ── 스펠 점수 계산 ─────────────────────────────────────
function scoreSpell(sp, state) {
  const t = (sp.text||'').toLowerCase();
  const pLife = state.player.life;
  const aLife = state.ai.life;
  const aGauge = state.ai.gauge?.length || 0;
  const aHand = state.ai.hand?.length || 0;
  const oppHasMonsters = Object.values(state.player.field).some(Boolean);
  let score = 0;
  if (/deal.*?damage/i.test(t)) score += pLife <= 3 ? 40 : pLife <= 6 ? 20 : 10;
  if (/draw.*?card/i.test(t)) score += aHand <= 2 ? 15 : 7;
  if (/(?:into|your)\s+gauge/i.test(t)) score += aGauge <= 1 ? 12 : 5;
  if (/destroy/i.test(t)) score += oppHasMonsters ? 18 : 3;
  if (/you gain.*?life/i.test(t)) score += aLife <= 4 ? 16 : aLife <= 7 ? 8 : 2;
  if (/power\+\d+/i.test(t)) score += 6;
  if (/nullify.*?attack/i.test(t)) score -= 10; // 내 턴엔 필요없음
  const cost = parseCost(sp.text);
  if (cost?.gauge) score -= cost.gauge * 2.5;
  if (cost?.life) score -= cost.life * 4;
  return score;
}

// ── 몬스터 점수 계산 ──────────────────────────────────
function scoreMonster(m, state) {
  const txt = m.text || '';
  let score = (m.power || 0) / 800;
  if (txt.includes('[Penetrate]')) score += 22;
  if (txt.includes('[Triple Attack]')) score += 24;
  if (txt.includes('[Double Attack]')) score += 18;
  if (txt.includes('[Shadow Dive]')) score += 14;
  if (txt.includes('[Soulguard]')) score += 10;
  if (txt.includes('[Counterattack]')) score += 8;
  if (txt.includes('[Move]')) score += 6;
  if (txt.includes('[Lifelink')) score -= 4;
  // 덱 테마 시너지: D-Share
  if (txt.includes('[D-Share]') && Object.values(state.ai.field).some(c=>c&&c.text?.includes('[D-Share]'))) score += 16;
  // 소환 시 효과
  if (/when.*?enters.*?field/i.test(txt)) score += 6;
  // 비용 페널티
  const cost = parseCost(m.text);
  if (cost?.gauge) score -= cost.gauge * 2.5;
  if (cost?.life) score -= cost.life * 4;
  return score;
}

// ── 최적 공격 대상 ──────────────────────────────────
function chooseTarget(state, card) {
  const pf = state.player.field;
  const diff = getDiff();
  const hasOpp = pf.center || pf.left || pf.right;
  if (!hasOpp) return 'player';
  if (!diff.optimal) return pf.center ? 'center' : (pf.left ? 'left' : 'right');

  const targets = ['center','left','right'].filter(z => pf[z]);
  const attackPow = card?.power || 0;

  // Shadow Dive: 직접 플레이어 공격 가능
  if (/\[Shadow Dive\]/i.test(card?.text||'')) return 'player';

  // Disaster: OTK 가능하면 직접 공격
  if (_difficulty === 'disaster' && !hasOpp) return 'player';

  // Penetrate: 방어 낮은 카드 공격 (관통 데미지 노림)
  if (/\[Penetrate\]/i.test(card?.text||'')) {
    return targets.sort((a,b) => (pf[a].defense||0) - (pf[b].defense||0))[0];
  }

  // Soulguard 우회: 소울가드 없는 카드 우선 공격
  const noSoulguard = targets.filter(z => !/\[Soulguard\]/i.test(pf[z]?.text||''));
  if (noSoulguard.length > 0) {
    // 소울가드 없는 카드 중 방어 낮은 것
    return noSoulguard.sort((a,b) => (pf[a].defense||0) - (pf[b].defense||0))[0];
  }

  // 방어 낮은 카드 공격
  return targets.sort((a,b) => (pf[a].defense||0) - (pf[b].defense||0))[0];
}

// ── 메인 페이즈 ─────────────────────────────────────
function aiMainPhase(state) {
  let s = state;
  const diff = getDiff();
  const aGauge = s.ai.gauge?.length || 0;
  const aHand = s.ai.hand?.length || 0;
  const pLife = s.player.life;
  const aLife = s.ai.life; // ✅ fix64: aLife 미선언 → ReferenceError 수정

  // 0. 버디콜 (Disaster: 라이프 5 이하 시 적극 사용)
  if (diff.optimal && aLife <= 5) {
    const buddy = s.ai.hand.find(c => c.instanceId === s.ai.buddy?.instanceId);
    if (!buddy && s.ai.deck.length > 0) {
      // 버디 카드를 덱에서 찾아서 콜
      const buddyInDeck = s.ai.deck.find(c => c.id === s.ai.buddy?.id);
      if (buddyInDeck) {
        // 버디콜 시뮬: 라이프 +1
        s = { ...s, ai: { ...s.ai, life: Math.min(s.ai.life + 1, 30),
          deck: s.ai.deck.filter(c => c.id !== buddyInDeck.id).sort(() => Math.random()-0.5) } };
      }
    }
  }

  // 1. 아이템 장착
  if (!s.ai.item) {
    const items = s.ai.hand.filter(c => c.type === CARD_TYPE.ITEM);
    if (items.length > 0) {
      const item = diff.itemEquipBest
        ? items.sort((a,b) => (b.power||0)-(a.power||0))[0]
        : items[0];
      const ns = equipItem(s, item.instanceId);
      if (ns !== s) s = ns;
    }
  }

  // 2. 스펠 사용
  if (diff.spellUse) {
    const spells = s.ai.hand.filter(c => canAICastSpell(s, c));
    const sorted = spells.sort((a,b) => scoreSpell(b,s) - scoreSpell(a,s));
    let used = 0;
    for (const sp of sorted) {
      if (used >= diff.maxSpells) break;
      if (scoreSpell(sp,s) < 2) continue;
      const ns = castSpell({ ...s, activePlayer: 'ai' }, sp.instanceId);
      if (ns !== s) { s = ns; used++; }
    }
  }

  // 3. 몬스터 소환
  const monsters = s.ai.hand.filter(c => c.type === CARD_TYPE.MONSTER);
  // ✅ fix64: sort 콜백 구조 버그 수정 (삼항 안에 화살표 함수 반환 → 동작 안 함)
  const sorted = diff.optimal
    ? [...monsters].sort((a,b) => scoreMonster(b,s) - scoreMonster(a,s))
    : _difficulty === 'easy'
      ? [...monsters].sort(() => Math.random() - 0.5)
      : [...monsters].sort((a,b) => (b.power||0) - (a.power||0));

  for (const m of sorted) {
    const zones = getEmptyZones(s.ai.field);
    if (!zones.length) break;
    if (getFieldTotalSize(s.ai.field) + (m.size||0) > 3) continue;
    let zone = zones[0];
    if (diff.optimal) {
      const txt = m.text||'';
      if (/\[Penetrate\]|\[Double Attack\]|\[Triple Attack\]|\[Shadow Dive\]/i.test(txt))
        zone = zones.includes('center') ? 'center' : zones[0];
      else if (/may only.*?center/i.test(txt)) zone = zones.includes('center') ? 'center' : null;
      else if (/may only.*?left/i.test(txt)) zone = zones.includes('left') ? 'left' : null;
      else if (/may only.*?right/i.test(txt)) zone = zones.includes('right') ? 'right' : null;
    }
    if (!zone) continue;
    const ns = callMonster(s, m.instanceId, zone);
    if (ns !== s) s = ns;
  }

  // 4. Act 효과 (hard+)
  if (diff.actUse) {
    let actUsed = 0;
    for (const zone of ['center','left','right','item']) {
      if (actUsed >= diff.maxAct) break;
      const card = zone === 'item' ? s.ai.item : s.ai.field[zone];
      if (!card) continue;
      const txt = card.text || '';
      if (!txt.includes('[Act]')) continue;
      if (/\[Counter\]\s*\[Act\]/i.test(txt)) continue; // Counter Act 제외
      if (/from your hand/i.test(txt)) continue;
      try {
        const ns = applyActEffect({ ...s, activePlayer: 'ai' }, card, zone, 'ai');
        if (ns && ns !== s) { s = ns; actUsed++; }
      } catch(e) {}
    }
  }

  // 5. Set 스펠 세팅 (normal+)
  if (diff.setSpellUse) {
    const setSpells = s.ai.hand.filter(c =>
      (c.type === CARD_TYPE.SPELL || c.type === CARD_TYPE.IMPACT) && /\[Set\]/i.test(c.text||'')
    );
    for (const sp of setSpells.slice(0,1)) {
      const ns = setSpell({ ...s, activePlayer: 'ai' }, sp.instanceId);
      if (ns !== s) { s = ns; break; }
    }
  }

  return s;
}

// ── 공격 페이즈 ──────────────────────────────────────
async function aiAttackPhase(state, onUpdate, counterCb) {
  let s = state;
  const diff = getDiff();
  const cb = counterCb || (async () => null);

  const getStandAttackers = () => {
    const list = [];
    for (const z of ['center','left','right'])
      if (s.ai.field[z]?.state === CARD_STATE.STAND) list.push(z);
    if (s.ai.item?.state === CARD_STATE.STAND && !s.ai.field.center) list.push('item');
    return list;
  };

  // ── 링크어택 (hard+) ──
  if (diff.linkAtk) {
    const attackers = getStandAttackers();
    if (attackers.length >= 2) {
      const mainZone = attackers[0];
      const mainCard = mainZone === 'item' ? s.ai.item : s.ai.field[mainZone];
      if (mainCard) {
        s = declareAttack({ ...s, activePlayer: 'ai' }, mainZone);
        onUpdate(s); await sleep(getSleepMs());
        if (s.attackingCard) {
          for (const lz of attackers.slice(1)) {
            const ls = addToLinkAttack({ ...s, activePlayer: 'ai' }, lz);
            if (ls !== s) { s = ls; onUpdate(s); await sleep(Math.floor(getSleepMs()*0.4)); }
          }
          const target = chooseTarget(s, mainCard);
          const after = await cb(s, mainZone, mainCard, target);
          if (after) s = after;
          if (s.attackingCard) {
            s = resolveAttack({ ...s, activePlayer: 'ai' }, target);
            onUpdate(s); await sleep(getSleepMs());
          }
          if (s.winner) return s;
        }
      }
    }
  }

  // ── 개별 공격 ──
  let safety = 0;
  while (safety++ < 8) {
    const attackers = getStandAttackers();
    if (!attackers.length) break;
    const zone = attackers[0];
    const card = zone === 'item' ? s.ai.item : s.ai.field[zone];
    if (!card) break;

    s = declareAttack({ ...s, activePlayer: 'ai' }, zone);
    onUpdate(s); await sleep(getSleepMs());
    if (!s.attackingCard) break;

    const target = chooseTarget(s, card);
    const after = await cb(s, zone, card, target);
    if (after) s = after;
    if (!s.attackingCard) { onUpdate(s); continue; }

    s = resolveAttack({ ...s, activePlayer: 'ai' }, target);
    onUpdate(s); await sleep(getSleepMs());
    if (s.winner) return s;

    // Easy: 공격 1회 후 종료
    if (_difficulty === 'easy') break;
  }
  return s;
}

// ── 메인 런 ──────────────────────────────────────────
export async function runAITurn(state, onUpdate, counterCb) {
  if (state.activePlayer !== 'ai') return state;
  let s = state;
  const cb = counterCb || (async () => null);
  const ms = getSleepMs();

  // ① Stand
  s = doStandPhase(s);
  s = { ...s, phase: TURN_PHASE.DRAW };
  onUpdate(s); await sleep(ms);

  // ② Draw
  s = doDrawPhase(s);
  s = { ...s, phase: TURN_PHASE.CHARGE };
  onUpdate(s); await sleep(ms);

  // ③ Charge - 최적 선택 (normal+)
  const diff = getDiff();
  if (diff.chargeOptimal && s.ai.hand.length > 0) {
    // 스펠 > 일반 카드 > 몬스터 순으로 차지
    const chargeCard =
      s.ai.hand.find(c => c.type === CARD_TYPE.SPELL && !/\[Counter\]/i.test(c.text||'')) ||
      s.ai.hand.find(c => c.type !== CARD_TYPE.MONSTER) ||
      s.ai.hand[s.ai.hand.length - 1];
    if (chargeCard) {
      const cs = chargeFromHand({ ...s, activePlayer: 'ai' }, chargeCard.instanceId);
      if (cs !== s) { s = cs; }
    } else {
      s = doChargeAndDraw(s);
    }
  } else {
    s = doChargeAndDraw(s);
  }
  s = { ...s, phase: TURN_PHASE.MAIN };
  onUpdate(s); await sleep(ms);

  // ④ Main
  s = aiMainPhase(s);
  s = { ...s, phase: TURN_PHASE.ATTACK };
  onUpdate(s); await sleep(ms);

  // ⑤ Attack
  if (!s.winner) s = await aiAttackPhase(s, onUpdate, cb);

  // ⑥ End
  if (!s.winner) {
    s = endTurn(s);
    onUpdate(s);
  }
  return s;
}
