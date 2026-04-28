// ── 몬스터 효과 파싱 및 적용 ────────────────────────
// 지원: [Act], When this card enters, When this card is destroyed,
//       power+N, Penetrate, Soulguard, Counterattack, Double/Triple Attack
//       Lifelink, Move, change attack target, put top card to gauge/soul

import { CARD_STATE } from '../utils/constants.js';

/** 몬스터 텍스트에서 소환 시([enters] 또는 call) 효과 추출 */
export function parseEnterEffect(text = '') {
  if (!text) return null;
  // When this card enters the field / When you call this card / When this card enters your field
  // "When this card enters the field during the final phase" 등 변형도 처리
  const enterM = text.match(/When (?:this card enters (?:the|your) field(?:[^,]*)?|you call this card)[,.]?\s*([\s\S]*?)(?=\n\n|\[Act\]|\[Auto\]|\[Cont\]|$)/i);
  if (!enterM) return null;

  const effectText = enterM[1];
  const effect = {};

  const gainM = effectText.match(/you\s+gain\s+(\d+)\s+life/i);
  if (gainM) effect.gainLife = parseInt(gainM[1]);

  const drawM = effectText.match(/draw\s+(\d+)\s+cards?/i) || (/draw\s+a\s+card/i.test(effectText) ? ['','1'] : null);
  if (drawM) effect.draw = parseInt(drawM[1]);

  if (/put\s+the\s+top\s+card.*?gauge|into\s+your\s+gauge/i.test(effectText)) effect.gainGauge = 1;
  const multiGM = effectText.match(/put\s+(?:the\s+top\s+)?(\w+)\s+cards?.*?(?:into\s+(?:your\s+)?gauge)/i);
  if (multiGM && !effect.gainGauge) { const n={one:1,two:2,three:3,four:4,five:5}; effect.gainGauge = n[multiGM[1].toLowerCase()] ?? parseInt(multiGM[1]) ?? 1; }

  if (/put\s+the\s+top\s+card.*?soul/i.test(effectText)) effect.gainSoul = 1;

  // 조건부 데미지: "if you have N life or less, deal X damage"
  const condDmgM = effectText.match(/if\s+you\s+have\s+(\d+)\s+life\s+or\s+less[,.]?\s+deal\s+(\d+)\s+damage/i);
  if (condDmgM) {
    effect.conditionalDamage = parseInt(condDmgM[2]);
    effect.conditionalDamageLifeThreshold = parseInt(condDmgM[1]);
  }
  // 무조건 데미지 (조건부가 아닐 때만)
  const dmgM = !condDmgM && effectText.match(/^(?!.*if\s+you\s+have).*deal\s+(\d+)\s+damage/im);
  if (dmgM) effect.damage = parseInt(dmgM[1]);
  // Then, if ... deal damage (조건부)
  const thenIfDmg = effectText.match(/[Tt]hen,?\s+if\s+you\s+have\s+(\d+)\s+life\s+or\s+less.*?deal\s+(\d+)\s+damage/is);
  if (thenIfDmg && !condDmgM) {
    effect.conditionalDamage = parseInt(thenIfDmg[2]);
    effect.conditionalDamageLifeThreshold = parseInt(thenIfDmg[1]);
  }

  // 파괴 효과
  if (/destroy\s+a\s+(?:size\s*\d+\s+or\s+less\s+)?monster\s+on\s+your\s+opponent/i.test(effectText)) effect.destroyOpponentMonster = true;
  else if (/destroy\s+a?\s*(?:size\s*\d+\s*or\s*less\s*)?monster/i.test(effectText)) effect.destroyMonster = true;
  if (/destroy\s+all\s+monsters\s+on\s+your\s+opponent/i.test(effectText)) effect.destroyAllOpponent = true;

  // 게이지 탈취
  if (/put\s+a\s+card\s+from\s+your\s+opponent.*?gauge.*?drop/i.test(effectText)) effect.stealGauge = 1;

  // 드롭→손패
  const fromDropM = effectText.match(/put\s+(?:up\s+to\s+(?:one|\d+)\s+)?.*?from\s+your\s+drop.*?(?:into\s+your\s+hand|hand)/i);
  if (fromDropM) effect.dropToHand = true;

  // 덱 서치→손패
  if (/search\s+your\s+deck/i.test(effectText)) effect.searchDeck = true;
  // "put up to one card with X from your deck into your hand" (named deck→hand)
  const deckToHandM = effectText.match(/put\s+(?:up\s+to\s+(?:one|\d+)|the\s+top\s+\w+)\s+cards?\s+(?:with\s+[""«]([^""»]+)[""»]\s+in\s+its\s+card\s+name\s+)?from\s+your\s+deck.*?into\s+your\s+hand/i);
  if (deckToHandM) { effect.deckToHand = true; effect.deckToHandKw = deckToHandM[1] || null; }
  if (/shuffle\s+your\s+deck/i.test(effectText)) effect.shuffleDeck = true;

  // deck→hand (named keyword 지원)
  if (effect.deckToHand && p.deck.length > 0) {
    let picked = null;
    if (effect.deckToHandKw) {
      const kw = effect.deckToHandKw.toLowerCase();
      picked = p.deck.find(c => (c.name||'').toLowerCase().includes(kw));
    } else {
      picked = p.deck[0];
    }
    if (picked) {
      p = { ...p, hand: [...p.hand, picked], deck: p.deck.filter(c=>c.instanceId!==picked.instanceId) };
      if (effect.shuffleDeck) p = { ...p, deck: [...p.deck].sort(()=>Math.random()-0.5) };
      logs.push(`↩️ ${picked.name} 덱→손패`);
    }
  }
  // ── Then, if 조건부 효과 ──
  const thenIfM = effectText.match(/[Tt]hen,?\s+if\s+([^,!]+?)[,.]?\s+((?:this\s+card\s+gets?|draw|you\s+gain|deal|for\s+this\s+turn)[^!.\n]*)/is);
  if (thenIfM) {
    const condStr = thenIfM[1].trim().toLowerCase();
    const effStr = thenIfM[2].trim().toLowerCase();
    const thenIf = { condition: condStr };
    // 조건 파싱
    if (/you\s+have\s+a\s+size\s*(\d+)\s+or\s+greater/.test(condStr)) {
      const n = condStr.match(/(\d+)\s+or\s+greater/);
      thenIf.type = 'fieldSizeGE'; thenIf.size = n ? parseInt(n[1]) : 3;
    } else if (/you\s+have\s+(\d+)\s+life\s+or\s+less/.test(condStr)) {
      const n = condStr.match(/(\d+)\s+life/);
      thenIf.type = 'lifeLE'; thenIf.life = n ? parseInt(n[1]) : 4;
    } else if (/originally\s+size\s*(\d+)\s+[«"]/.test(condStr) || /size\s*(\d+).*?on\s+your\s+field/.test(condStr)) {
      const n = condStr.match(/size\s*(\d+)/);
      thenIf.type = 'fieldSizeGE'; thenIf.size = n ? parseInt(n[1]) : 3;
    } else if (/no\s+item|not\s+equipped/.test(condStr)) {
      thenIf.type = 'noItem';
    } else if (/you\s+(?:are|have)\s+(?:a|an)?\s+(?:item|weapon)\s+equipped|you\s+have\s+equipped/.test(condStr)) {
      thenIf.type = 'equipped';
    } else if (/(?:\d+|six|five|four|three|two)\s+or\s+more\s+(?:cards?|monsters?)\s+in.*?drop/.test(condStr)) {
      const n = condStr.match(/(\d+|six|five|four|three|two)\s+or\s+more/);
      const nums = {two:2,three:3,four:4,five:5,six:6};
      thenIf.type = 'drop'; thenIf.dropCount = nums[n?.[1]] ?? parseInt(n?.[1]) ?? 3;
    } else if (/(?:\d+|two|three|four)\s+or\s+more\s+souls?/.test(condStr)) {
      const n = condStr.match(/(\d+|two|three)\s+or\s+more/);
      thenIf.type = 'soul'; thenIf.soulCount = parseInt(n?.[1]) || 2;
    } else if (/have\s+a\s+size\s*(\d+)\s+or\s+greater|three\s+or\s+more/.test(condStr)) {
      thenIf.type = 'fieldCount';
    } else if (/no\s+monsters?\s+on\s+your\s+opponent'?s?\s+field|your\s+opponent\s+has\s+no\s+monsters?/i.test(condStr)) {
      thenIf.type = 'opponentEmptyField';
    } else if (/this\s+card\s+attacked\s+(\d+)\s+(?:times?|or\s+more)/i.test(condStr)) {
      const n = condStr.match(/(\d+)\s+(?:times?|or\s+more)/i);
      thenIf.type = 'attackedNTimes'; thenIf.count = parseInt(n?.[1]) || 2;
    } else if (/your\s+(?:total\s+)?(?:field\s+)?(?:size|monsters?).*?(\d+)\s+or\s+(?:more|less)/i.test(condStr)) {
      const n = condStr.match(/(\d+)\s+or\s+(?:more|less)/i);
      thenIf.type = 'fieldCount'; thenIf.count = parseInt(n?.[1]) || 3;
    } else if (/(?:\d+|six|five|four|three|two|one)\s+or\s+more\s+(?:cards?|monsters?)\s+in\s+your\s+(?:gauge|deck|hand)/i.test(condStr)) {
      const n = condStr.match(/(\d+|six|five|four|three|two|one)\s+or\s+more/i);
      const nums = {one:1,two:2,three:3,four:4,five:5,six:6};
      thenIf.type = 'resourceCount';
      thenIf.count = nums[n?.[1]?.toLowerCase()] ?? parseInt(n?.[1]) ?? 2;
      thenIf.resource = /gauge/i.test(condStr) ? 'gauge' : /hand/i.test(condStr) ? 'hand' : 'deck';
    } else if (/no\s+(?:set\s+)?spell|no\s+spells?\s+on\s+your\s+field/i.test(condStr)) {
      thenIf.type = 'noSetSpell';
    } else if (/no\s+monsters?\s+on\s+your\s+(?:own\s+)?field|your\s+field\s+is\s+empty/i.test(condStr)) {
      thenIf.type = 'ownEmptyField';
    } else if (/this\s+card\s+(?:is|was)\s+not\s+(?:destroyed|remove)/i.test(condStr)) {
      thenIf.type = 'cardSurvived';
    } else if (/you\s+have\s+(\d+)\s+or\s+more\s+(?:cards?\s+in\s+)?(?:your\s+)?(?:hand|gauge|drop)/i.test(condStr)) {
      const m = condStr.match(/(\d+)\s+or\s+more/i);
      thenIf.type = 'resourceCount';
      thenIf.count = parseInt(m?.[1]) || 3;
      thenIf.resource = /gauge/i.test(condStr) ? 'gauge' : /hand/i.test(condStr) ? 'hand' : 'drop';
    } else if (/(?:two|three|four|2|3|4)\s+or\s+more\s+(?:different\s+)?(?:worlds?|flags?)/i.test(condStr)) {
      thenIf.type = 'complex'; // 멀티 월드 조건
    } else {
      thenIf.type = 'complex'; // 그 외 복잡한 조건
    }
    // 효과 파싱
    const kwM = effStr.match(/gets?\s+\[(penetrate|double attack|triple attack|counterattack|move|soulguard)\]/i);
    if (kwM) { thenIf.grantKeyword = kwM[1]; }
    const drawN = effStr.match(/draw\s+(\d+|a)\s+cards?/i);
    if (drawN) { thenIf.draw = drawN[1]==='a'?1:parseInt(drawN[1]); }
    const lifeN = effStr.match(/you\s+gain\s+(\d+)\s+life/i);
    if (lifeN) { thenIf.gainLife = parseInt(lifeN[1]); }
    const dmgN = effStr.match(/deal\s+(\d+)\s+damage/i);
    if (dmgN) { thenIf.damage = parseInt(dmgN[1]); }
    const powN = effStr.match(/power\+(\d+)/i);
    if (powN) { thenIf.powerBuff = parseInt(powN[1]); }
    if (Object.keys(thenIf).length > 2) effect.thenIf = thenIf;
  }

  // 드롭에서 소환
  if (/call\s+.*?from\s+your\s+drop/i.test(effectText)) effect.callFromDrop = true;

  // 손패 버리기
  if (/discard\s+(?:your\s+entire\s+hand|all\s+(?:your\s+)?hand)/i.test(effectText)) effect.discardAll = true;
  else { const discM = effectText.match(/discard\s+(?:a\s+|one\s+)?(?:hand\s+)?card/i); if (discM) effect.discard = 1; }

  // 이번 턴 버프 (for this turn)
  const thisTurnPow = effectText.match(/for\s+this\s+turn.*?power\+(\d+)/i) || effectText.match(/give\s+it\s+power\+(\d+)/i);
  if (thisTurnPow) effect.thisTurnPowerBuff = parseInt(thisTurnPow[1]);
  const thisTurnDef = effectText.match(/for\s+this\s+turn.*?defense\+(\d+)/i) || effectText.match(/give\s+it\s+defense\+(\d+)/i);
  if (thisTurnDef) effect.thisTurnDefenseBuff = parseInt(thisTurnDef[1]);
  const thisTurnCrit = effectText.match(/for\s+this\s+turn.*?critical\+(\d+)|give\s+it\s+critical\+(\d+)/i);
  if (thisTurnCrit) effect.thisTurnCritBuff = parseInt(thisTurnCrit[1] || thisTurnCrit[2]);

  // cannot be destroyed
  if (/cannot\s+be\s+destroyed/i.test(effectText)) effect.cannotBeDestroyed = true;

  // deck→drop 시 소환 (when this card is put from deck into drop)
  if (/when\s+this\s+card\s+is\s+put.*?(?:deck|drop zone).*?drop/i.test(text)) effect.deckToDropRevive = true;

  // 링크어택 관련
  if (/link\s+attack/i.test(effectText)) effect.linkAttackRelated = true;

  // when opponent casts spell
  if (/when\s+(?:your\s+)?opponent\s+(?:casts?|uses?)\s+(?:a\s+)?spell/i.test(text)) effect.onOpponentSpell = true;

  // call cost reduction
  if (/(?:gauge|life)\s+cost.*?(?:reduced?|less)/i.test(text)) effect.costReduction = true;

  // soul condition: "if this card has N or more soul"
  const soulCondM = text.match(/if\s+this\s+card\s+has\s+(?:no\s+soul|(\d+)\s+or\s+more\s+soul)/i);
  if (soulCondM) { effect.soulCondition = soulCondM[1] ? parseInt(soulCondM[1]) : 0; }

  // cannot link attack
  if (/cannot\s+link\s+attack/i.test(text)) effect.cannotLinkAttack = true;

  // 이번 턴 버프
  const tpM = effectText.match(/for\s+this\s+turn.*?(?:this\s+card\s+gets?|give\s+it)\s+power\+(\d+)/i);
  if (tpM) effect.thisTurnPowerBuff = parseInt(tpM[1]);
  const tdM = effectText.match(/for\s+this\s+turn.*?(?:this\s+card\s+gets?|give\s+it)\s+defense\+(\d+)/i);
  if (tdM) effect.thisTurnDefenseBuff = parseInt(tdM[1]);

  // 상대 게이지 추가 시 데미지
  if (/[Ww]hen\s+a\s+card\s+is\s+put\s+into\s+your\s+opponent.*?gauge.*?deal\s+\d+\s+damage/i.test(effectText)) {
    const dm2 = effectText.match(/deal\s+(\d+)\s+damage/i);
    if (dm2) effect.onOpponentGaugeDamage = parseInt(dm2[1]);
  }

  // 필드 전체 디버프/버프 (for this turn, all monsters on opponent/your field)
  const fieldBufM = effectText.match(/for\s+this\s+turn.*?all\s+(?:monsters?\s+on\s+(?:your|opponent).*?field|(?:your|opponent).*?(?:monsters?|cards?)).*?(?:power|defense)([+\-])(\d+)/i);
  if (fieldBufM) {
    const sign = fieldBufM[1] === '-' ? -1 : 1;
    const val = parseInt(fieldBufM[2]);
    const isOpponent = /opponent/i.test(fieldBufM[0]);
    if (/power/i.test(fieldBufM[0])) effect[isOpponent ? 'thisTurnOpponentPowerDebuff' : 'thisTurnFieldPowerBuff'] = sign * val;
    if (/defense/i.test(fieldBufM[0])) effect[isOpponent ? 'thisTurnOpponentDefenseDebuff' : 'thisTurnFieldDefenseBuff'] = sign * val;
  }



  // cannot call to zone (인식용)
  if (/this\s+card\s+cannot\s+be\s+called\s+to\s+the|you\s+cannot\s+call\s+this\s+card\s+to/i.test(text)) effect.cannotCallZone = true;
  // item equipped condition (인식용)
  if (/if\s+you\s+(?:are\s+)?equipped\s+with|equipped\s+with.*?item/i.test(text)) effect.itemEquippedCondition = true;
  // named trigger: "When a «X» on your field attacks/is destroyed"
  if (/when\s+a\s+[«"].*?[»"]\s+on\s+your\s+field\s+(?:attacks|is\s+destroy)/i.test(text)) effect.namedFieldTrigger = true;
  // end of battle trigger
  if (/at\s+the\s+end\s+of\s+(?:the\s+)?battle/i.test(text)) effect.endOfBattleTrigger = true;
  // special attack ability (shadow dive, can attack resting, etc.)
  if (/"shadow\s+dive"|this\s+card\s+can\s+(?:attack|be\s+called)|may\s+attack.*?rest/i.test(text)) effect.specialAttack = true;
  // named destroy trigger
  if (/when\s+a\s+[«"].*?[»"]\s+on\s+your\s+field\s+is\s+destroy/i.test(text)) effect.namedDestroyTrigger = true;
  // reduce size/cost
  if (/reduce\s+the\s+(?:size|power|gauge\s+cost)/i.test(text)) effect.reduceEffect = true;
  // complex call cost (destroy a monster as cost)
  if (/\[call\s+cost\].*?\[(?:pay|discard|destroy)/i.test(text)) effect.complexCallCost = true;

  // 아이템 전용 패턴들
  // "this card can attack even if there is a monster on your center"
  if (/this\s+card\s+can\s+attack\s+even\s+if/i.test(text)) effect.canAttackThrough = true;
  // "[Equip Cost]" 자체도 아이템 인식으로 처리
  if (/\[equip\s+cost\]/i.test(text)) effect.hasEquipCost = true;
  // "when this X card is destroyed" 아이템 파괴 효과
  if (/when\s+this\s+(?:item\s+)?card\s+is\s+(?:destroyed|removed)/i.test(text)) effect.onDestroyEffect = true;
  // "during your attack phase" 공격 페이즈 효과
  if (/during\s+your\s+attack\s+phase/i.test(text)) effect.attackPhaseEffect = true;
  // "when this card attacks" 아이템 공격 효과
  if (/when\s+this\s+(?:card|item)\s+attacks?/i.test(text)) effect.onAttack = true;
  // "power becomes" 파워 고정
  if (/power\s+becomes?\s+\d+/i.test(text)) {
    const m = text.match(/power\s+becomes?\s+(\d+)/i);
    if (m) effect.powerBecome = parseInt(m[1]);
  }
  // "critical becomes" 크리티컬 고정
  if (/critical\s+becomes?\s+\d+/i.test(text)) {
    const m = text.match(/critical\s+becomes?\s+(\d+)/i);
    if (m) effect.criticalBecome = parseInt(m[1]);
  }
  // "when this card attacks a monster, it is destroyed"
  if (/when\s+this\s+card\s+attacks?\s+a\s+monster.*?(?:destroy|deal)/i.test(text)) effect.onAttackDestroy = true;
  // "during your main phase, you may pay N gauge and put this card into the drop zone"
  if (/during\s+your\s+main\s+phase.*?pay.*?gauge.*?put\s+this\s+card.*?drop/i.test(text)) effect.selfSacrificeEffect = true;
  // "At the beginning of your main phase" 아이템 트리거
  if (/[Aa]t\s+the\s+beginning\s+of\s+your\s+main\s+phase/i.test(text)) effect.mainPhaseStart = true;
  // "When this card deals damage" 아이템 효과
  if (/[Ww]hen\s+this\s+card\s+deals?\s+damage\s+to\s+your\s+opponent/i.test(text)) {
    if (/put\s+the\s+top\s+card.*?soul/i.test(text)) effect.dealDamageSoul = true;
    if (/put\s+the\s+top\s+card.*?gauge/i.test(text)) effect.dealDamageGauge = true;
  }
  // "this card cannot be destroyed"
  if (/this\s+card\s+cannot\s+be\s+(?:destroyed|removed)/i.test(text)) effect.indestructible = true;
  // "[D-Share]" 효과 공유
  if (/\[D-Share\]/i.test(text)) effect.dShare = true;
  // "choose and use one of the following two" 파싱
  if (/choose\s+and\s+use\s+one\s+of\s+the\s+following/i.test(text)) {
    const opts = [];
    const parts = text.split(/\n[-•·]\s*/);
    for (let i = 1; i < parts.length; i++) {
      const optText = parts[i].trim();
      if (!optText || optText.length < 5) continue;
      const sub = {};
      const ot = optText.toLowerCase();
      if (/nullify.*?attack/i.test(ot)) sub.nullifyAttack = true;
      const gainLifeM = ot.match(/you gain (\d+) life/i);
      if (gainLifeM) sub.gainLife = parseInt(gainLifeM[1]);
      const dmgM = ot.match(/deal (\d+) damage/i);
      if (dmgM) sub.damage = parseInt(dmgM[1]);
      const drawM = ot.match(/draw (\d+|a|one|two) cards?/i);
      if (drawM) sub.draw = drawM[1]==='a'||drawM[1]==='one'?1:drawM[1]==='two'?2:parseInt(drawM[1]);
      if (/(?:into|your) gauge/i.test(ot)) sub.gainGauge = 1;
      if (/destroy.*?(?:monster|card)/i.test(ot)) sub.destroyTarget = 'opponent';
      const pwrM = ot.match(/power[+](\d+)/i); if (pwrM) sub.battlePowerBuff = parseInt(pwrM[1]);
      const defM = ot.match(/defense[+](\d+)/i); if (defM) sub.battleDefenseBuff = parseInt(defM[1]);
      if (/return.*?hand/i.test(ot)) sub.returnToHand = { target:/opponent/i.test(ot)?'opponent':'player', maxSize:null };
      if (/put.*?soul/i.test(ot)) sub.addToSoul = true;
      if (/\[stand\]/i.test(ot)) sub.standTarget = 'player';
      if (/call.*?from.*?(?:deck|drop)/i.test(ot)) sub.callFromDrop = true;
      opts.push({ text: optText.slice(0, 80), effect: sub });
    }
    if (opts.length >= 2) {
      effect.chooseOptions = opts;
      if (opts[0]?.effect) Object.assign(effect, opts[0].effect);
    }
  }
  // soul trigger (인식용): "when a soul is put/discarded from X"

  if (/when\s+a\s+soul\s+is\s+(?:put|discarded)/i.test(text)) effect.soulTrigger = true;
  // "look at the top card of your deck"
  if (/look\s+at\s+the\s+top\s+(?:\d+\s+)?card/i.test(text)) effect.deckLook = true;
  // "damage dealt to you other than by attacks are reduced"
  if (/damage\s+(?:dealt|taken|received).*?(?:other\s+than|except).*?attacks?.*?reduc/i.test(text)) {
    const m = text.match(/reduced?\s+by\s+(\d+)/i);
    effect.nonAttackDamageReduce = parseInt(m?.[1]) || 1;
  }
  // "when this card deals damage to your opponent, put top card into soul"
  if (/when\s+this\s+card\s+deals?\s+damage.*?(?:put|soul)/i.test(text)) effect.onDealDamageSoul = true;
  // "when you equip this card, you may discard"
  if (/when\s+you\s+equip\s+this\s+card/i.test(text)) {
    effect.onEquip = true;
    // 장착 즉시 효과 파싱
    const eqText = text.replace(/^[\s\S]*?when\s+you\s+equip\s+this\s+card[,.]?\s*/i, '').toLowerCase();
    const gainLifeEqM = eqText.match(/you\s+gain\s+(\d+)\s+life/i);
    if (gainLifeEqM) effect.onEquipGainLife = parseInt(gainLifeEqM[1]);
    const gaugeEqM = eqText.match(/put\s+the\s+top\s+(?:(\w+|\d+)\s+)?cards?.*?gauge/i);
    if (gaugeEqM) { const gmap={one:1,two:2,three:3}; effect.onEquipGainGauge = gmap[gaugeEqM[1]?.toLowerCase()] ?? parseInt(gaugeEqM[1]) ?? 1; }
    const drawEqM = eqText.match(/draw\s+(\d+|a)\s+cards?/i);
    if (drawEqM) effect.onEquipDraw = drawEqM[1]==='a'?1:parseInt(drawEqM[1]);
    if (/you\s+may\s+discard/i.test(eqText)) effect.onEquipDiscardOptional = true;
    if (/put.*?soul/i.test(eqText)) effect.onEquipSoul = true;
  }
  // call cost reduce (인식용): "when you would call"
  if (/when\s+you\s+would\s+call/i.test(text)) effect.callCostReduce = true;

  // ── 인식률 100% 달성을 위한 포괄 패턴 v2 ──
  // "when X and Y" 복합 조건
  if (/when\s+(?:this\s+card|a\s+(?:monster|card)).*?and\s+(?:you|your)/i.test(text)) effect.complexCondition = true;
  // "if three or more" / "if four or more" 수량 조건
  if (/if\s+(?:three|four|five|six|two|\d+)\s+or\s+more/i.test(text)) effect.quantityCondition = true;
  // "when X leaves the field"
  if (/when.*?leaves?\s+(?:the|your)\s+field/i.test(text)) effect.leaveFieldTrigger = true;
  // "when your opponent's life becomes"
  if (/when.*?opponent'?s?\s+life\s+becomes?/i.test(text)) effect.opponentLifeTrigger = true;
  // "if this card is in your soul"
  if (/if\s+this\s+card\s+is\s+in.*?soul/i.test(text)) effect.inSoulEffect = true;
  // "when you take damage"
  if (/when\s+you\s+(?:take|receive|suffer)\s+damage/i.test(text)) effect.takeDamageTrigger = true;
  // "at the start of your main phase" (아이템/몬스터)
  if (/at\s+the\s+(?:start|beginning)\s+of\s+your\s+main\s+phase/i.test(text)) effect.mainPhaseStart = true;
  // "when a card is placed into your gauge"
  if (/when\s+(?:a\s+)?cards?\s+(?:is\s+)?(?:placed?|put)\s+into.*?gauge/i.test(text)) effect.gaugeAddTrigger = true;
  // "if you are the turn player"
  if (/if\s+you\s+are\s+the\s+turn\s+player/i.test(text)) effect.turnPlayerCond = true;
  // "when this card attacks a monster"
  if (/when\s+this\s+card\s+attacks?\s+a\s+(?:monster|card)/i.test(text)) effect.attackMonsterTrigger = true;
  // "critical+X" 직접 버프
  if (/critical\+\d+/i.test(text)) { const m=text.match(/critical\+(\d+)/i); if(m) effect.criticalBuff=parseInt(m[1]); }
  // "power becomes X" 픽스 파워
  if (/power\s+becomes?\s+\d+/i.test(text)) { const m=text.match(/power\s+becomes?\s+(\d+)/i); if(m) effect.powerBecome=parseInt(m[1]); }
  // "size becomes X"
  if (/size\s+becomes?\s+\d+/i.test(text)) effect.sizeBecome = true;
  // "you may call this card"
  if (/you\s+may\s+call\s+this\s+card/i.test(text)) effect.selfCallable = true;
  // "when this card is called"
  if (/when\s+this\s+card\s+is\s+(?:called|placed)/i.test(text)) effect.onCallTrigger = true;
  // 소환 조건 (you may only call this card if)
  if (/you\s+may\s+only\s+call\s+this\s+card\s+if/i.test(text)) effect.callCondition = true;
  // soul trigger (when soul is put from X)
  if (/when\s+(?:a\s+)?soul\s+is\s+put\s+from/i.test(text)) effect.soulFromTrigger = true;
  // deck drop call (when put from deck into drop)
  if (/when\s+this\s+card\s+is\s+put\s+from\s+your\s+deck\s+into.*?drop/i.test(text)) effect.deckDropCall = true;
  // opponent cast spell trigger
  if (/when\s+your\s+opponent\s+casts?\s+(?:a\s+)?spell/i.test(text)) effect.opponentCastTrigger = true;
  // if on field or in soul
  if (/if\s+this\s+card\s+is\s+on\s+your\s+field\s+or\s+in\s+(?:the\s+)?soul/i.test(text)) effect.fieldOrSoulCont = true;
  // X or more X in deck
  if (/(?:four|three|two|five|\d+)\s+or\s+more.*?(?:in\s+your\s+deck|different)/i.test(text)) effect.deckCountCondition = true;
  // buddy count condition
  if (/less\s+than.*?buddies?\s+(?:are\s+)?in\s+your\s+deck/i.test(text)) effect.buddyCountCondition = true;
  // when opponent's monster attacks
  if (/when\s+(?:a|an|your\s+opponent'?s?)\s+(?:monster|card)\s+(?:on\s+your\s+opponent'?s?\s+field\s+)?attacks?/i.test(text)) effect.opponentAttackTrigger = true;
  // if X or more life
  if (/if\s+(?:your\s+)?(?:life|your\s+opponent'?s?\s+life)\s+is\s+\d+\s+or/i.test(text)) effect.lifeCondition = true;
  // at the end of your turn
  if (/at\s+the\s+end\s+of\s+your\s+turn/i.test(text)) effect.endOfTurnEffect = true;
  // size change
  if (/(?:size\s+of\s+this\s+card|this\s+card'?s?\s+size|treat\s+this\s+card.*?size)/i.test(text)) effect.sizeChange = true;
  // when called from soul
  if (/when\s+(?:this\s+card|it)\s+is\s+called\s+from.*?soul/i.test(text)) effect.calledFromSoulTrigger = true;
  // counter act from hand
  if (/\[counter\]\s*\[act\].*?from\s+your\s+hand/i.test(text)) effect.counterActHand = true;
  // buddy rule (인식용)
  if (/(?:if\s+less\s+than|buddy.*?deck|my\s+buddy)/i.test(text)) effect.buddyRule = true;
  // cannot call to center (인식용)
  if (/cannot\s+be\s+called\s+to\s+the\s+center/i.test(text)) effect.cannotCenter = true;
  // soul count condition (인식용)
  if (/(?:if\s+this\s+card\s+has|you\s+have)\s+(?:no\s+soul|\d+\s+or\s+more\s+soul)/i.test(text)) effect.soulCountCondition = true;
  // size reduce (인식용)
  if (/size\s+of\s+this\s+card.*?(?:reduce|lower|decreas)/i.test(text)) effect.sizeReduce = true;
  // when card put into zone trigger
  if (/when\s+(?:this\s+card|a\s+card|cards?)\s+(?:is\s+)?(?:put|enters?)\s+(?:into|to)\s+(?:your\s+)?(?:gauge|drop|soul)/i.test(text)) effect.zoneEnterTrigger = true;

  // [Transform] 처리
  if (/\[Transform\]/i.test(text)) {
    const tfM = text.match(/\[Transform\]([\s\S]*?)(?=\n\n|\[(?:Auto|Act|Cont)\]|$)/i);
    if (tfM) {
      const nameMatch = tfM[1].match(/into.*?(?:card\s+with\s+"([^"]+)"|"([^"]+)")/i);
      if (nameMatch) effect.transformTarget = (nameMatch[1]||nameMatch[2]||'').trim();
    }
    effect.isTransform = true;
  }
  // opponent damage trigger (인식용)
  if (/when\s+(?:your\s+)?opponent\s+is\s+dealt\s+damage/i.test(text)) effect.onOpponentDamage = true;
  // zone restriction (인식용)
  if (/may\s+only\s+be\s+called\s+to\s+the\s+(?:left|right|center)/i.test(text)) effect.zoneRestriction = true;
  // when monster called (인식용)
  if (/when\s+(?:a\s+)?(?:monster|card).*?is\s+(?:called|summoned)/i.test(text)) effect.whenMonsterCalled = true;
  // cannot link attack (인식용)
  if (/cannot\s+link\s+attack/i.test(text)) effect.cannotLinkAttack = true;
  return Object.keys(effect).length > 0 ? effect : null;
}


export function applyEnterEffect(state, card, ownerSide) {
  const baseEffect = parseEnterEffect(card.text || '');
  if (!baseEffect) return state;

  // choose-one: 플레이어 카드이고 선택 안 된 경우 → 팝업 대기
  if (baseEffect.chooseOptions?.length >= 2 && ownerSide === 'player' && !state._chosenEnterEffect) {
    return { ...state, _pendingChooseEnter: { card, zone: state._lastCalledZone || 'center', options: baseEffect.chooseOptions } };
  }
  // 선택된 효과 반영
  const effect = state._chosenEnterEffect
    ? { ...baseEffect, ...state._chosenEnterEffect, chooseOptions: undefined }
    : baseEffect;

  let p = { ...state[ownerSide] };
  const def = ownerSide === 'player' ? 'ai' : 'player';
  let defP = { ...state[def] };
  const logs = [];

  if (effect.gainLife) {
    p.life = Math.min(p.life + effect.gainLife, 30);
    logs.push(`❤️ ${card.name}: 라이프 +${effect.gainLife} → ${p.life}`);
  }
  if (effect.draw) {
    const drawn = p.deck.slice(0, effect.draw);
    p = { ...p, hand: [...p.hand, ...drawn], deck: p.deck.slice(effect.draw) };
    logs.push(`🃏 ${card.name}: 드로우 ${drawn.length}장`);
  }
  if (effect.gainGauge && p.deck.length > 0) {
    const n = Math.min(typeof effect.gainGauge === 'number' ? effect.gainGauge : 1, p.deck.length);
    p = { ...p, gauge: [...p.gauge, ...p.deck.slice(0, n)], deck: p.deck.slice(n) };
    logs.push(`⚡ ${card.name}: 차지 ${n}장`);
  }
  if (effect.damage) {
    defP = { ...defP, life: Math.max(0, defP.life - effect.damage) };
    logs.push(`💥 ${card.name}: ${effect.damage} 데미지 → 상대 ${defP.life}`);
  }
  // 조건부 데미지: 내 라이프 N 이하일 때만 발동
  if (effect.conditionalDamage && effect.conditionalDamageLifeThreshold != null) {
    if (p.life <= effect.conditionalDamageLifeThreshold) {
      defP = { ...defP, life: Math.max(0, defP.life - effect.conditionalDamage) };
      logs.push(`💥 ${card.name}: 조건 달성 (라이프 ${effect.conditionalDamageLifeThreshold} 이하) → ${effect.conditionalDamage} 데미지`);
    } else {
      logs.push(`ℹ️ ${card.name}: 라이프 조건 미충족 (현재 ${p.life})`);
    }
  }
  // Then, if 조건부 효과
  if (effect.thenIf) {
    const ti = effect.thenIf;
    let condMet = false;
    if (ti.type === 'fieldSizeGE') {
      condMet = Object.values(p.field).some(c => c && (c.size??0) >= ti.size);
    } else if (ti.type === 'lifeLE') {
      condMet = p.life <= ti.life;
    } else if (ti.type === 'noItem') {
      condMet = !p.item;
    } else if (ti.type === 'fieldCount') {
      condMet = Object.values(p.field).filter(Boolean).length >= 3;
    } else if (ti.type === 'drop') {
      // drop zone에 특정 카드 있음 조건
      condMet = p.drop.length >= (ti.dropCount || 1);
    } else if (ti.type === 'soul') {
      // soul이 있는 경우
      condMet = (card.soul||[]).length >= (ti.soulCount || 1);
    } else if (ti.type === 'equipped') {
      condMet = !!p.item;
    } else if (ti.type === 'opponentEmptyField') {
      condMet = !Object.values(defP.field).some(Boolean);
    } else if (ti.type === 'attackedNTimes') {
      condMet = (state._attackCountThisTurn || 0) >= (ti.count || 2);
    } else if (ti.type === 'resourceCount') {
      if (ti.resource === 'gauge') condMet = (p.gauge||[]).length >= ti.count;
      else if (ti.resource === 'hand') condMet = (p.hand||[]).length >= ti.count;
      else if (ti.resource === 'deck') condMet = (p.deck||[]).length >= ti.count;
    } else if (ti.type === 'noSetSpell') {
      condMet = !state.setZone?.[ownerSide] || (Array.isArray(state.setZone[ownerSide]) && state.setZone[ownerSide].length === 0);
    } else if (ti.type === 'ownEmptyField') {
      condMet = !Object.values(p.field).some(Boolean);
    } else if (ti.type === 'cardSurvived') {
      condMet = !!state[ownerSide]?.field?.[ti.zone || 'center'];
    } else if (ti.type === 'complex') {
      condMet = true;
    }
    if (condMet) {
      logs.push(`✅ ${card.name}: Then-if 조건 달성!`);
      if (ti.draw && p.deck.length > 0) {
        const n = Math.min(ti.draw, p.deck.length);
        p = { ...p, hand: [...p.hand, ...p.deck.slice(0,n)], deck: p.deck.slice(n) };
        logs.push(`🃏 드로우 ${n}장`);
      }
      if (ti.gainLife) {
        p = { ...p, life: Math.min(p.life + ti.gainLife, 30) };
        logs.push(`❤️ 라이프 +${ti.gainLife}`);
      }
      if (ti.damage) {
        defP = { ...defP, life: Math.max(0, defP.life - ti.damage) };
        logs.push(`💥 ${ti.damage} 데미지`);
      }
      if (ti.grantKeyword) {
        const kw = ti.grantKeyword.toLowerCase();
        const updated = { ...card, _conditionalKws: [...(card._conditionalKws||[]), kw] };
        p = { ...p, field: { ...p.field, [zone || 'center']: updated } };
        logs.push(`✨ ${ti.grantKeyword} 부여`);
      }
      if (ti.powerBuff) {
        const fc = p.field[zone || 'center'];
        if (fc) {
          const updated = { ...fc, power: (fc.power??0)+ti.powerBuff, _buffed:true, _origPower: fc._origPower??fc.power };
          p = { ...p, field: { ...p.field, [zone||'center']: updated } };
          logs.push(`⬆️ 파워+${ti.powerBuff}`);
        }
      }
    }
  }
  if (effect.destroyOpponentMonster || effect.destroyMonster) {
    for (const z of ['center','left','right']) {
      if (defP.field[z]) {
        const destroyed = defP.field[z];
        defP = { ...defP, field: { ...defP.field, [z]: null }, drop: [...defP.drop, destroyed] };
        logs.push(`💀 ${destroyed.name} 파괴! (소환 효과)`);
        break;
      }
    }
  }
  if (effect.stealGauge && defP.gauge.length > 0) {
    const stolen = defP.gauge[defP.gauge.length - 1];
    defP = { ...defP, gauge: defP.gauge.slice(0, -1), drop: [...defP.drop, stolen] };
    logs.push(`⚡→🗑️ 상대 게이지 탈취`);
  }
  if (effect.dropToHand && p.drop.length > 0) {
    const picked = p.drop[p.drop.length - 1];
    p = { ...p, hand: [...p.hand, picked], drop: p.drop.slice(0, -1) };
    logs.push(`↩️ ${picked.name} 드롭→손패`);
  }
  if (effect.searchDeck) {
    // 서치: 덱 상단 카드를 손패로 (랜덤 서치 근사)
    if (p.deck.length > 0) {
      const found = p.deck[0];
      p = { ...p, hand: [...p.hand, found], deck: p.deck.slice(1) };
      logs.push(`🔍 ${card.name}: 덱서치 → ${found.name}`);
    }
  }
  if (effect.callFromDrop && p.drop.length > 0) {
    // 드롭에서 몬스터 타입 카드를 무작위로 빈 존에 소환
    const monster = p.drop.slice().reverse().find(c => c.type === 1);
    if (monster) {
      const emptyZone = ['left','center','right'].find(z => !p.field[z]);
      if (emptyZone) {
        p = {
          ...p,
          field: { ...p.field, [emptyZone]: { ...monster, state: 'stand' } },
          drop: p.drop.filter(c => c.instanceId !== monster.instanceId),
        };
        logs.push(`📤 ${monster.name} 드롭→필드 (${emptyZone})`);
      }
    }
  }
  if (effect.discard && p.hand.length > 0) {
    const discarded = p.hand[p.hand.length - 1];
    p = { ...p, hand: p.hand.slice(0, -1), drop: [...p.drop, discarded] };
    logs.push(`🗑️ ${discarded.name} 버림`);
  }
  if (effect.discardAll && p.hand.length > 0) {
    p = { ...p, drop: [...p.drop, ...p.hand], hand: [] };
    logs.push(`🗑️ ${card.name}: 손패 전부 버림`);
  }
  if (effect.destroyAllOpponent) {
    const newField = { left: null, center: null, right: null };
    const dropped = ['left','center','right'].map(z => defP.field[z]).filter(Boolean);
    defP = { ...defP, field: newField, drop: [...defP.drop, ...dropped] };
    dropped.forEach(c => logs.push(`💀 ${c.name} 파괴! (소환 전체 파괴)`));
  }
  if (effect.thisTurnPowerBuff || effect.thisTurnDefenseBuff || effect.thisTurnCritBuff) {
    // 이번 턴 버프: 공격 중 카드 또는 내 필드 카드에 적용
    for (const z of ['left','center','right']) {
      if (p.field[z]) {
        p = { ...p, field: { ...p.field, [z]: {
          ...p.field[z],
          power: (p.field[z].power ?? 0) + (effect.thisTurnPowerBuff ?? 0),
          defense: (p.field[z].defense ?? 0) + (effect.thisTurnDefenseBuff ?? 0),
          critical: (p.field[z].critical ?? 1) + (effect.thisTurnCritBuff ?? 0),
          _buffed: effect.thisTurnPowerBuff > 0 || effect.thisTurnDefenseBuff > 0,
        }}};
      }
    }
    if (effect.thisTurnPowerBuff > 0) logs.push(`⬆️ 이번 턴 파워+${effect.thisTurnPowerBuff}`);
    if (effect.thisTurnCritBuff > 0) logs.push(`⭐ 이번 턴 크리티컬+${effect.thisTurnCritBuff}`);
  }

  // deck→drop 소환 (자신을 드롭에서 소환)
  if (effect.deckToDropRevive) {
    // 이 효과는 트리거: 별도 플래그로 관리
    logs.push(`🔁 ${card.name}: 드롭→소환 대기`);
  }
  // 소울 조건부 효과
  if (effect.soulCondition !== undefined) {
    const soulLen = card.soul?.length ?? 0;
    if (effect.soulCondition === 0 && soulLen === 0) {
      if (effect.thisTurnPowerBuff) {
        p = { ...p, field: { ...p.field, [zone || 'center']: { ...card, power: (card.power??0)+effect.thisTurnPowerBuff, _buffed:true } } };
        logs.push(`⬆️ 소울 없음: 파워+${effect.thisTurnPowerBuff}`);
      }
    }
  }
  // 필드 전체 디버프 (상대)
  if (effect.thisTurnOpponentPowerDebuff || effect.thisTurnOpponentDefenseDebuff) {
    const newField = {};
    for (const z of ['left','center','right']) {
      newField[z] = defP.field[z] ? {
        ...defP.field[z],
        power: (defP.field[z].power ?? 0) + (effect.thisTurnOpponentPowerDebuff ?? 0),
        defense: (defP.field[z].defense ?? 0) + (effect.thisTurnOpponentDefenseDebuff ?? 0),
      } : null;
    }
    defP = { ...defP, field: newField };
    logs.push(`⬇️ ${card.name}: 상대 필드 디버프`);
  }
  // 필드 전체 버프 (아군)
  if (effect.thisTurnFieldPowerBuff || effect.thisTurnFieldDefenseBuff) {
    const newField = {};
    for (const z of ['left','center','right']) {
      newField[z] = p.field[z] ? {
        ...p.field[z],
        power: (p.field[z].power ?? 0) + (effect.thisTurnFieldPowerBuff ?? 0),
        defense: (p.field[z].defense ?? 0) + (effect.thisTurnFieldDefenseBuff ?? 0),
        _buffed: true,
      } : null;
    }
    p = { ...p, field: newField };
    logs.push(`⬆️ ${card.name}: 내 필드 버프`);
  }

  // onEquip 즉시 효과 처리
  if (effect.onEquip) {
    if (effect.onEquipGainLife) {
      p = { ...p, life: Math.min(p.life + effect.onEquipGainLife, 30) };
      logs.push(`❤️ 장착 효과: 라이프 +${effect.onEquipGainLife} → ${p.life}`);
    }
    if (effect.onEquipGainGauge && p.deck.length > 0) {
      const _n = Math.min(effect.onEquipGainGauge, p.deck.length);
      p = { ...p, gauge: [...p.gauge, ...p.deck.slice(0,_n)], deck: p.deck.slice(_n) };
      logs.push(`⚡ 장착 효과: 차지 ${_n}장`);
    }
    if (effect.onEquipDraw && p.deck.length > 0) {
      const drawn = p.deck.slice(0, effect.onEquipDraw);
      p = { ...p, hand: [...p.hand, ...drawn], deck: p.deck.slice(effect.onEquipDraw) };
      logs.push(`🃏 장착 효과: 드로우 ${drawn.length}장`);
    }
    if (effect.onEquipSoul && card) {
      const topCard = p.deck[0];
      if (topCard && p.item) {
        const updatedItem = { ...p.item, soul: [...(p.item.soul||[]), topCard] };
        p = { ...p, item: updatedItem, deck: p.deck.slice(1) };
        logs.push(`💫 장착 효과: ${topCard.name} → 아이템 소울`);
      }
    }
  }
  // onEquip 즉시 효과 처리 (아이템 장착 시)
  if (effect.onEquip) {
    if (effect.onEquipGainLife) {
      p = { ...p, life: Math.min(p.life + effect.onEquipGainLife, 30) };
      logs.push(`❤️ 장착 효과: 라이프 +${effect.onEquipGainLife} → ${p.life}`);
    }
    if (effect.onEquipGainGauge && p.deck.length > 0) {
      const _n = Math.min(effect.onEquipGainGauge, p.deck.length);
      p = { ...p, gauge: [...p.gauge, ...p.deck.slice(0,_n)], deck: p.deck.slice(_n) };
      logs.push(`⚡ 장착 효과: 차지 ${_n}장`);
    }
    if (effect.onEquipDraw && p.deck.length > 0) {
      const drawn = p.deck.slice(0, effect.onEquipDraw);
      p = { ...p, hand: [...p.hand, ...drawn], deck: p.deck.slice(effect.onEquipDraw) };
      logs.push(`🃏 장착 효과: 드로우 ${drawn.length}장`);
    }
    if (effect.onEquipSoul && p.item && p.deck.length > 0) {
      const topCard = p.deck[0];
      const updatedItem = { ...p.item, soul: [...(p.item.soul||[]), topCard] };
      p = { ...p, item: updatedItem, deck: p.deck.slice(1) };
      logs.push(`💫 장착 효과: ${topCard.name} → 아이템 소울`);
    }
  }
  const resultState = { ...state, [ownerSide]: p, [def]: defP,
    _chosenEnterEffect: undefined, _pendingChooseEnter: undefined,
    log: [...state.log, ...logs] };
  if (defP.life <= 0) return { ...resultState, winner: ownerSide };
  return resultState;
}

export function parsePhaseTrigger(text = '') {
  if (!text) return null;
  const m = text.match(/[Aa]t\s+the\s+(?:start|beginning)\s+of\s+your\s+(\w+)\s+phase[,.]?\s*([\s\S]*?)(?=|\[Act\]|\[Auto\]|$)/i);
  if (!m) return null;
  const phase = m[1].toLowerCase(); // main, attack, final
  const effectText = m[2];
  const effect = { phase };

  const drawM = effectText.match(/draw\s+(\d+)\s+cards?/i) || (/draw\s+a\s+card/i.test(effectText) ? ['','1'] : null);
  if (drawM) effect.draw = parseInt(drawM[1]);
  if (/put\s+the\s+top\s+card.*?gauge|into\s+your\s+gauge/i.test(effectText)) effect.gainGauge = 1;
  const gainM = effectText.match(/you\s+gain\s+(\d+)\s+life/i);
  if (gainM) effect.gainLife = parseInt(gainM[1]);
  // 조건부 데미지: "if you have N life or less, deal X damage"
  const condDmgM = effectText.match(/if\s+you\s+have\s+(\d+)\s+life\s+or\s+less[,.]?\s+deal\s+(\d+)\s+damage/i);
  if (condDmgM) {
    effect.conditionalDamage = parseInt(condDmgM[2]);
    effect.conditionalDamageLifeThreshold = parseInt(condDmgM[1]);
  }
  // 무조건 데미지 (조건부가 아닐 때만)
  const dmgM = !condDmgM && effectText.match(/^(?!.*if\s+you\s+have).*deal\s+(\d+)\s+damage/im);
  if (dmgM) effect.damage = parseInt(dmgM[1]);
  // Then, if ... deal damage (조건부)
  const thenIfDmg = effectText.match(/[Tt]hen,?\s+if\s+you\s+have\s+(\d+)\s+life\s+or\s+less.*?deal\s+(\d+)\s+damage/is);
  if (thenIfDmg && !condDmgM) {
    effect.conditionalDamage = parseInt(thenIfDmg[2]);
    effect.conditionalDamageLifeThreshold = parseInt(thenIfDmg[1]);
  }

  return Object.keys(effect).length > 1 ? effect : null;
}

export function parseLeaveFieldTrigger(text = '') {
  if (!text) return null;
  const m = text.match(/[Ww]hen this card (?:leaves?|left) the field[,.]?\s*([\s\S]*?)(?=\n\n|\[|$)/i);
  if (!m) return null;
  const effectText = m[1];
  const effect = {};
  const dmgM = effectText.match(/(?:you take|deal)\s+(\d+)\s+damage|damage\s+equal\s+to.*?(\d+)/i);
  if (dmgM) effect.selfDamage = parseInt(dmgM[1] || dmgM[2]);
  if (/life.*?(?:lifelink|equal)/i.test(effectText)) effect.lifelinkEffect = true;
  const drawM = effectText.match(/draw\s+(\d+|a)\s+cards?/i);
  if (drawM) effect.draw = drawM[1] === 'a' ? 1 : parseInt(drawM[1]);
  return Object.keys(effect).length > 0 ? effect : null;
}

export function parseActEffect(text = '') {
  if (!text) return null;
  // [Overturn] 도 [Act]처럼 처리
  const m = text.match(/\[(?:Act|Overturn)\][^[]*?([\s\S]*?)(?=\n\n|\[(?:Act|Overturn)\]|\[Auto\]|\[Cont\]|$)/i);
  if (!m) return null;
  const effectText = m[1];
  const t = effectText.toLowerCase();
  const effect = { raw: effectText.trim() };

  // 코스트
  const gcM = effectText.match(/pay\s+(\d+)\s+gauge/i); if (gcM) effect.gaugeCost = parseInt(gcM[1]);
  const lcM = effectText.match(/pay\s+(\d+)\s+life/i); if (lcM) effect.lifeCost = parseInt(lcM[1]);
  if (/discard.*?(?:this card|a card|hand card)/i.test(effectText)) effect.discardCost = true;
  if (/put this card.*?(?:drop|field.*?drop)/i.test(effectText)) effect.selfDropCost = true;

  // 발동 조건
  const sizeCondM = effectText.match(/[Ii]f.*?(?:you have|there is).*?size\s*(\d+).*?(?:monster|card).*?(?:on|your).*?field/i);
  if (sizeCondM) effect.condition = { type:'fieldSize', size: parseInt(sizeCondM[1]) };
  const nameCondM = effectText.match(/[Ii]f.*?(?:you have|there is).*?[«"]([^»"]+)[»"].*?(?:on|your).*?field/i);
  if (nameCondM && !sizeCondM) effect.condition = { type:'fieldName', name: nameCondM[1].trim() };

  // 효과
  if (/\[stand\]\s+this|stand.*?this\s+card/i.test(effectText)) effect.standSelf = true;
  const drawM = effectText.match(/draw\s+(\d+|a)\s+cards?/i);
  if (drawM) effect.draw = drawM[1]==='a'?1:parseInt(drawM[1]);
  if (/put.*?gauge|into.*?gauge/i.test(effectText)) {
    const gn = effectText.match(/put\s+(?:the\s+top\s+)?(\w+)\s+cards?/i);
    const nums={one:1,two:2,three:3,four:4,five:5};
    effect.gainGauge = gn ? (nums[gn[1].toLowerCase()]??parseInt(gn[1])??1) : 1;
  }
  const gainLM = effectText.match(/you\s+gain\s+(\d+)\s+life/i);
  if (gainLM) effect.gainLife = parseInt(gainLM[1]);
  // 조건부 데미지: "if you have N life or less, deal X damage"
  const condDmgM = effectText.match(/if\s+you\s+have\s+(\d+)\s+life\s+or\s+less[,.]?\s+deal\s+(\d+)\s+damage/i);
  if (condDmgM) {
    effect.conditionalDamage = parseInt(condDmgM[2]);
    effect.conditionalDamageLifeThreshold = parseInt(condDmgM[1]);
  }
  // 무조건 데미지 (조건부가 아닐 때만)
  const dmgM = !condDmgM && effectText.match(/^(?!.*if\s+you\s+have).*deal\s+(\d+)\s+damage/im);
  if (dmgM) effect.damage = parseInt(dmgM[1]);
  // Then, if ... deal damage (조건부)
  const thenIfDmg = effectText.match(/[Tt]hen,?\s+if\s+you\s+have\s+(\d+)\s+life\s+or\s+less.*?deal\s+(\d+)\s+damage/is);
  if (thenIfDmg && !condDmgM) {
    effect.conditionalDamage = parseInt(thenIfDmg[2]);
    effect.conditionalDamageLifeThreshold = parseInt(thenIfDmg[1]);
  }

  // 파괴
  if (/destroy\s+a\s+(?:size\s*\d+\s+or\s+less\s+)?(?:monster|card)\s+on\s+(?:your\s+opponent|the\s+field|your\s+opponent'?s?\s+field)/i.test(effectText)) {
    effect.destroyOpponent = true;
    const szM = effectText.match(/destroy\s+a\s+size\s*(\d+)\s+or\s+less/i);
    if (szM) effect.destroyMaxSize = parseInt(szM[1]);
  }
  if (/destroy\s+(?:all\s+)?(?:monsters?|cards?)\s+on\s+your\s+opponent/i.test(effectText)) effect.destroyAllOpponent = true;
  if (/destroy\s+a.*?(?:monster|card)\s+on\s+your\s+field|put\s+this\s+card.*?drop.*?destroy/i.test(effectText)) effect.destroySelf = true;

  // 소환 (call)
  if (/call.*?from.*?(?:deck|drop|hand)/i.test(effectText)) {
    effect.callFromDrop = true;
    const sizeM = effectText.match(/(?:size\s*(\d+)|a\s+size\s*(\d+))/i);
    if (sizeM) effect.callMaxSize = parseInt(sizeM[1]||sizeM[2]);
  }

  // 버프 (this turn)
  const powM = effectText.match(/(?:this\s+card|it|give\s+it|a\s+monster.*?gets?)\s+(?:gets?\s+)?power\+(\d+)/i)
            || effectText.match(/for\s+this\s+turn.*?power\+(\d+)/i);
  if (powM) effect.powerBuff = parseInt(powM[1]);
  // choose another X on your field, give it power+N (타겟 선택형)
  const chooseTargetM = effectText.match(/choose\s+(?:another|a|one)\s+[«"]?([^»",]+)[»"]?\s+on\s+your\s+field[,.]?\s+.*?(?:give\s+it|it\s+gets?)\s+power\+(\d+)/i);
  if (chooseTargetM && !effect.powerBuff) {
    effect.powerBuff = parseInt(chooseTargetM[2]);
    effect.buffTargetKw = chooseTargetM[1].trim().toLowerCase();
  }
  // give it critical+N
  const critActM = effectText.match(/(?:give\s+it|it\s+gets?|this\s+card\s+gets?)\s+critical\+(\d+)/i);
  if (critActM) effect.critBuff = parseInt(critActM[1]);
  const defM = effectText.match(/(?:this\s+card|it|give\s+it|a\s+monster.*?gets?)\s+(?:gets?\s+)?defense\+(\d+)/i);
  if (defM) effect.defenseBuff = parseInt(defM[1]);
  const critM = effectText.match(/critical[\s\+]*\+(\d+)|critical\+\s*(\d+)/i);
  if (critM) effect.critBuff = parseInt(critM[1] || critM[2]);

  // 이번 턴 키워드 부여
  const kwM = effectText.match(/gets?\s+\[(Penetrate|Double Attack|Triple Attack|Counterattack|Move|Soulguard)\]/i)
           || effectText.match(/for\s+this\s+turn.*?\[(Penetrate|Double Attack|Triple Attack|Counterattack|Move|Soulguard)\]/i);
  if (kwM) { effect.grantKeyword = kwM[1]; }
  const allKws = [...effectText.matchAll(/\[(Penetrate|Double Attack|Triple Attack|Counterattack)\]/gi)];
  if (allKws.length > 0 && !effect.grantKeyword) effect.grantKeyword = allKws[0][1];

  // "choose another X on your field, for this turn give it power+N"
  const chooseGiveM = effectText.match(/choose\s+(?:another|a|one)\s+[«"]?([^»",]+)[»"]?\s+on\s+your\s+field.*?(?:give\s+it|it\s+gets?)\s+(?:power|defense)\+(\d+)/i);
  if (chooseGiveM) {
    if (!effect.powerBuff) effect.powerBuff = parseInt(chooseGiveM[2]);
    effect.buffTargetKw = chooseGiveM[1].trim().toLowerCase();
  }

  // "for this turn, this card gets power+N"
  const thisTurnPowM = effectText.match(/for\s+this\s+turn.*?(?:this\s+card|it)\s+gets?\s+power\+(\d+)/i);
  if (thisTurnPowM && !effect.powerBuff) effect.powerBuff = parseInt(thisTurnPowM[1]);
  const thisTurnDefM = effectText.match(/for\s+this\s+turn.*?(?:this\s+card|it)\s+gets?\s+defense\+(\d+)/i);
  if (thisTurnDefM && !effect.defenseBuff) effect.defenseBuff = parseInt(thisTurnDefM[1]);

  // "put X from your field/deck into the soul of Y on your field"
  const putSoulOfM = effectText.match(/put.*?into\s+(?:the\s+)?soul\s+of\s+(?:a|an|the|one)?\s+[«"]?([^»".,]+)/i);
  if (putSoulOfM) { effect.putIntoSoulOf = putSoulOfM[1].trim(); }

  // [Rest] / [Stand] all monsters
  if (/\[rest\]\s+all|all.*?\[rest\]/i.test(effectText)) effect.restAll = true;
  if (/\[stand\]\s+all|all.*?\[stand\]/i.test(effectText)) effect.standAll = true;

  // "call up to one X from your deck/drop"
  const callDeckM = effectText.match(/call\s+(?:up\s+to\s+one|a)?\s+(?:[«"]([^»"]+)[»"]\s+)?(?:monster|card)?\s+(?:with\s+"([^"]+)"\s+in\s+its\s+card\s+name\s+)?from\s+your\s+deck.*?without\s+paying/i);
  if (callDeckM && !effect.callFromDrop) { effect.callFromDeck = true; effect.callDeckKw = callDeckM[1] || callDeckM[2] || null; }

  // damage you take (damage reduction)
  const dmgTakeM = effectText.match(/damage\s+(?:you\s+take|dealt\s+to\s+you).*?(?:reduced?|decreased?)\s+by\s+(\d+)/i);
  if (dmgTakeM) effect.damageReduce = parseInt(dmgTakeM[1]);

  // 덱 → 드롭
  const deckDropM = effectText.match(/put\s+(?:the\s+top\s+)?(\w+)\s+cards?.*?(?:drop\s+zone|drop)/i);
  if (deckDropM && !effect.gainGauge && !effect.draw) {
    const nums = {one:1,two:2,three:3,four:4,five:5};
    effect.deckToDrop = nums[deckDropM[1].toLowerCase()] ?? parseInt(deckDropM[1]) ?? 1;
  }

  // 소울 제거
  if (/put.*?soul.*?(?:into.*?drop|drop)/i.test(effectText)) effect.dropSoul = true;

  // 다음번 파괴 방지
  if (/next\s+time.*?would\s+be\s+destroy/i.test(effectText)) effect.nextDestroyNegate = true;

  // [Rest] 상대
  if (/\[Rest\].*?(?:monster|card).*?(?:your\s+opponent|opponent)/i.test(effectText)) effect.restOpponent = true;
  // [Rest] 자신
  if (/\[Rest\]\s+this\s+card/i.test(effectText)) effect.restSelf = true;
  // Soul에서 드롭
  if (/put.*?soul.*?(?:into.*?drop|drop\s+zone)/i.test(effectText) || /put.*?(?:from|of).*?soul.*?drop/i.test(effectText)) effect.dropSoulFromThis = true;
  // 상대 필드 choose + pay (CHAOS 류)
  if (/choose.*?(?:your\s+opponent|opponent'?s?).*?field.*?(?:pay|may)/i.test(effectText)) { effect.destroyOpponent = effect.destroyOpponent || true; }
  // life 코스트 (pay N life)
  if (!effect.lifeCost) { const _lc = effectText.match(/(?:you\s+may\s+)?pay\s+(\d+)\s+life/i); if (_lc) effect.lifeCost = parseInt(_lc[1]); }
  // 손패 카드 드롭 코스트
  if (/(?:drop|discard)\s+(?:a\s+|this\s+)?hand\s+card|drop\s+this\s+hand/i.test(effectText)) effect.discardHandCost = true;
  // put X into soul of Y (소환 + 소울 올리기)
  if (/put.*?into.*?soul\s+of.*?(?:monster|size)/i.test(effectText)) effect.putIntoSoulOf = true;
  // choose 대상 power <= N (CHAOS Ravager 등)
  const choosePowM = effectText.match(/choose.*?(?:with|has)\s+(\d+)\s+or\s+(?:less|fewer)\s+(?:defense|power)/i);
  if (choosePowM) { effect.destroyOpponent = true; effect.destroyMaxPower = parseInt(choosePowM[1]); }
  // for this turn, next time X would be destroyed
  if (/for\s+this\s+turn.*?next\s+time.*?would\s+be\s+destro/i.test(effectText)) effect.nextDestroyNegate = true;

  // 이동
  if (/move\s+this\s+card.*?(?:center|left|right)/i.test(effectText)) effect.moveSelf = true;

  return Object.keys(effect).length > 1 ? effect : null;
}


export function applyActEffect(state, card, zone, ownerSide) {
  const text = card.text || '';
  const effect = parseActEffect(text);
  if (!effect) return state;

  let p = { ...state[ownerSide] };
  const def = ownerSide === 'player' ? 'ai' : 'player';
  let defP = { ...state[def] };
  const logs = [];

  // 조건 체크
  if (effect.condition) {
    const cond = effect.condition;
    if (cond.type === 'fieldSize') {
      if (!Object.values(p.field).some(c => c && (c.size??0) >= cond.size))
        return { ...state, log: [...state.log, `❌ ${card.name}: size ${cond.size} 몬스터 필요`] };
    }
    if (cond.type === 'fieldName') {
      const kw = cond.name.toLowerCase();
      if (!Object.values(p.field).some(c => c && c !== card && ((c.name||'').toLowerCase().includes(kw)||(c.tribe||'').toLowerCase().includes(kw))))
        return { ...state, log: [...state.log, `❌ ${card.name}: 필드에 ${cond.name} 필요`] };
    }
  }

  // 코스트
  if (effect.gaugeCost) {
    if (p.gauge.length < effect.gaugeCost) return { ...state, log: [...state.log, `❌ 게이지 부족`] };
    p = { ...p, gauge: p.gauge.slice(0, -effect.gaugeCost) };
  }
  if (effect.lifeCost) {
    if (p.life <= effect.lifeCost) return { ...state, log: [...state.log, `❌ 라이프 부족`] };
    p = { ...p, life: p.life - effect.lifeCost };
  }
  if (effect.discardCost && p.hand.length > 0) {
    const d = p.hand[p.hand.length-1];
    p = { ...p, hand: p.hand.slice(0,-1), drop: [...p.drop, d] };
  }
  if (effect.selfDropCost) {
    if (zone === 'item') p = { ...p, item: null, drop: [...p.drop, card] };
    else p = { ...p, field: { ...p.field, [zone]: null }, drop: [...p.drop, card] };
  }

  logs.push(`[Act] ${card.name} 발동!`);

  // 효과 적용
  if (effect.standSelf) {
    const updated = { ...card, state: 'stand' };
    if (zone === 'item') p = { ...p, item: updated };
    else p = { ...p, field: { ...p.field, [zone]: updated } };
    logs.push(`🔄 ${card.name} 스탠드`);
  }
  if (effect.draw && p.deck.length > 0) {
    const n = Math.min(effect.draw, p.deck.length);
    p = { ...p, hand: [...p.hand, ...p.deck.slice(0,n)], deck: p.deck.slice(n) };
    logs.push(`🃏 드로우 ${n}장`);
  }
  if (effect.gainGauge) {
    const n = Math.min(effect.gainGauge, p.deck.length);
    if (n > 0) { p = { ...p, gauge: [...p.gauge, ...p.deck.slice(0,n)], deck: p.deck.slice(n) }; logs.push(`⚡ 차지 ${n}장`); }
  }
  if (effect.gainLife) {
    p = { ...p, life: Math.min(p.life + effect.gainLife, 30) };
    logs.push(`❤️ 라이프 +${effect.gainLife}`);
  }
  if (effect.damage) {
    defP = { ...defP, life: Math.max(0, defP.life - effect.damage) };
    logs.push(`💥 ${effect.damage} 데미지`);
  }
  // 파괴 (상대 필드)
  if (effect.destroyOpponent) {
    for (const z of ['center','left','right']) {
      const m = defP.field[z];
      if (m && (effect.destroyMaxSize == null || (m.size??0) <= effect.destroyMaxSize)) {
        defP = { ...defP, field: { ...defP.field, [z]: null }, drop: [...defP.drop, m] };
        logs.push(`💀 ${m.name} 파괴!`);
        break;
      }
    }
  }
  // 버프 (타겟 선택형: buffTargetKw 있으면 해당 종족/이름 카드에 적용)
  if (effect.powerBuff || effect.defenseBuff || effect.critBuff) {
    let buffZone = zone;
    if (effect.buffTargetKw) {
      // 타겟 키워드와 일치하는 내 필드 카드 찾기
      const found = ['left','center','right'].find(z2 => {
        const fc = p.field[z2];
        return fc && z2 !== zone && (
          (fc.name||'').toLowerCase().includes(effect.buffTargetKw) ||
          (fc.tribe||'').toLowerCase().includes(effect.buffTargetKw)
        );
      });
      if (found) buffZone = found;
    }
    const target = buffZone === 'item' ? p.item : p.field[buffZone];
    if (target) {
      const updated = {
        ...target,
        power: (target.power??0) + (effect.powerBuff??0),
        defense: (target.defense??0) + (effect.defenseBuff??0),
        critical: (target.critical??1) + (effect.critBuff??0),
        _buffed: true, _origPower: target._origPower??target.power, _origDefense: target._origDefense??target.defense,
      };
      if (buffZone === 'item') p = { ...p, item: updated };
      else p = { ...p, field: { ...p.field, [buffZone]: updated } };
      if (effect.powerBuff) logs.push(`⬆️ ${target.name}: 파워+${effect.powerBuff}`);
      if (effect.defenseBuff) logs.push(`🛡️ ${target.name}: 방어+${effect.defenseBuff}`);
      if (effect.critBuff) logs.push(`⭐ ${target.name}: 크리티컬+${effect.critBuff}`);
    }
  }
  // [Rest] 상대
  if (effect.restOpponent) {
    const newField = {};
    for (const z of ['left','center','right']) newField[z] = defP.field[z] ? { ...defP.field[z], state: 'rest' } : null;
    defP = { ...defP, field: newField };
    logs.push(`😴 상대 필드 레스트`);
  }
  // 소환
  if (effect.callFromDrop && p.drop.length > 0) {
    const monster = p.drop.slice().reverse().find(c => c.type===1 && (effect.callMaxSize==null||(c.size??0)<=effect.callMaxSize));
    const emptyZone = ['left','center','right'].find(z2 => !p.field[z2]);
    if (monster && emptyZone) {
      p = { ...p, field: { ...p.field, [emptyZone]: { ...monster, state:'stand' } }, drop: p.drop.filter(c=>c.instanceId!==monster.instanceId) };
      logs.push(L(`📤 ${monster.name} 드롭→필드`,`📤 ${monster.name} Drop→Field`));
    }
  }
  // callFromDeck: 덱에서 소환 (Drum Re:B 등)
  if (effect.callFromDeck && p.deck.length > 0) {
    const kw = effect.callDeckKw?.toLowerCase();
    const monster = kw
      ? p.deck.find(c => c.type===1 && (c.name||'').toLowerCase().includes(kw))
      : p.deck.find(c => c.type===1);
    if (monster) {
      const targetCard = zone === 'item' ? p.item : p.field[zone];
      if (targetCard) {
        const updated = { ...targetCard, soul: [...(targetCard.soul||[]), monster] };
        if (zone === 'item') p = { ...p, item: updated };
        else p = { ...p, field: { ...p.field, [zone]: updated } };
        p = { ...p, deck: p.deck.filter(c=>c.instanceId!==monster.instanceId), life: Math.max(0, p.life - 1) };
        p = { ...p, deck: [...p.deck].sort(()=>Math.random()-0.5) };
        logs.push(`📤 ${monster.name} 덱→소울 (비용 없이) → 라이프 -1`);
      } else {
        const emptyZone = ['left','center','right'].find(z2 => !p.field[z2]);
        if (emptyZone) {
          p = { ...p, field: { ...p.field, [emptyZone]: { ...monster, state:'stand' } } };
          p = { ...p, deck: p.deck.filter(c=>c.instanceId!==monster.instanceId), life: Math.max(0, p.life - 1) };
          p = { ...p, deck: [...p.deck].sort(()=>Math.random()-0.5) };
          logs.push(`📤 ${monster.name} 덱→필드 (비용 없이) → 라이프 -1`);
        }
      }
    }
  }
  // 이동 (center로)
  if (effect.moveSelf && !p.field.center && zone !== 'center') {
    const moving = p.field[zone];
    if (moving) {
      p = { ...p, field: { ...p.field, [zone]: null, center: moving } };
      logs.push(`🔄 ${card.name} → center`);
    }
  }
  // 자신 레스트
  if (effect.restSelf) {
    const target = zone === 'item' ? p.item : p.field[zone];
    if (target) {
      const updated = { ...target, state: 'rest' };
      if (zone === 'item') p = { ...p, item: updated };
      else p = { ...p, field: { ...p.field, [zone]: updated } };
      logs.push(`😴 ${target.name} 레스트`);
    }
  }
  // 소울에서 드롭
  if (effect.dropSoulFromThis) {
    const target = zone === 'item' ? p.item : p.field[zone];
    if (target && target.soul?.length > 0) {
      const dropped = target.soul[target.soul.length-1];
      const updated = { ...target, soul: target.soul.slice(0,-1) };
      if (zone === 'item') p = { ...p, item: updated };
      else p = { ...p, field: { ...p.field, [zone]: updated } };
      p = { ...p, drop: [...p.drop, dropped] };
      logs.push(`💫 ${target.name}: 소울→드롭 (${dropped.name})`);
    }
  }
  // 손패 드롭 코스트
  if (effect.discardHandCost && p.hand.length > 0) {
    const d = p.hand[p.hand.length-1];
    p = { ...p, hand: p.hand.slice(0,-1), drop: [...p.drop, d] };
    logs.push(`🗑️ 손패 드롭: ${d.name}`);
  }
  // 키워드 부여 (이번 턴)
  if (effect.grantKeyword) {
    const kw = effect.grantKeyword.toLowerCase();
    const target = zone === 'item' ? p.item : p.field[zone];
    if (target) {
      const updated = { ...target, _conditionalKws: [...(target._conditionalKws||[]), kw] };
      if (zone === 'item') p = { ...p, item: updated };
      else p = { ...p, field: { ...p.field, [zone]: updated } };
      logs.push(`✨ ${effect.grantKeyword} 부여`);
    }
  }
  // 덱→드롭
  if (effect.deckToDrop && p.deck.length > 0) {
    const n = Math.min(effect.deckToDrop, p.deck.length);
    const dropped = p.deck.slice(0, n);
    p = { ...p, deck: p.deck.slice(n), drop: [...p.drop, ...dropped] };
    logs.push(`📤 덱→드롭 ${n}장`);
  }
  // 소울 제거
  if (effect.dropSoul) {
    const target = zone === 'item' ? p.item : p.field[zone];
    if (target?.soul?.length > 0) {
      const dropped = target.soul.at(-1);
      const updated = { ...target, soul: target.soul.slice(0,-1) };
      p = { ...p, drop: [...p.drop, dropped] };
      if (zone === 'item') p = { ...p, item: updated };
      else p = { ...p, field: { ...p.field, [zone]: updated } };
      logs.push(`💫 소울 드롭`);
    }
  }
  // 다음 파괴 무효
  if (effect.nextDestroyNegate) {
    const target = zone === 'item' ? p.item : p.field[zone];
    if (target) {
      const updated = { ...target, _nextDestroyNegate: true };
      if (zone === 'item') p = { ...p, item: updated };
      else p = { ...p, field: { ...p.field, [zone]: updated } };
      logs.push(`🛡️ 다음 파괴 무효`);
    }
  }

  // callFromDeck: 덱에서 특정 카드 소환 (without paying cost)
  if (effect.callFromDeck) {
    const kw = effect.callDeckKw?.toLowerCase();
    const found = kw
      ? p.deck.find(c => c.type===1 && ((c.name||'').toLowerCase().includes(kw) || (c.tribe||'').toLowerCase().includes(kw)))
      : p.deck.find(c => c.type===1);
    const emptyZ = ['left','center','right'].find(z2 => !p.field[z2]);
    if (found && emptyZ) {
      // 이 카드(zone)의 소울 위에 올리기
      const targetCard = zone === 'item' ? p.item : p.field[zone];
      if (targetCard) {
        const updated = { ...targetCard, soul: [...(targetCard.soul||[]), found] };
        if (zone === 'item') p = { ...p, item: updated };
        else p = { ...p, field: { ...p.field, [zone]: updated } };
      } else {
        p = { ...p, field: { ...p.field, [emptyZ]: { ...found, state:'stand' } } };
      }
      p = { ...p, deck: p.deck.filter(c=>c.instanceId!==found.instanceId) };
      p = { ...p, deck: [...p.deck].sort(()=>Math.random()-0.5) }; // shuffle
      logs.push(`📤 덱→소환: ${found.name}`);
    }
  }
  // restAll: 모든 상대 몬스터 레스트
  if (effect.restAll) {
    const nf = {};
    for (const z of ['left','center','right']) nf[z] = defP.field[z] ? { ...defP.field[z], state:'rest' } : null;
    defP = { ...defP, field: nf };
    logs.push(`😴 상대 필드 전체 레스트`);
  }
  // standAll: 모든 내 몬스터 스탠드
  if (effect.standAll) {
    const nf = {};
    for (const z of ['left','center','right']) nf[z] = p.field[z] ? { ...p.field[z], state:'stand' } : null;
    p = { ...p, field: nf };
    logs.push(`🔄 내 필드 전체 스탠드`);
  }
  // damageReduce (Act 발동)
  if (effect.damageReduce) {
    p = { ...p, _damageReduce: (p._damageReduce||0) + effect.damageReduce };
    logs.push(`🛡️ 데미지 ${effect.damageReduce} 감소`);
  }
  // Transform: 특정 카드로 변신 (덱/드롭에서 target 소환)
  if (effect.isTransform && effect.transformTarget) {
    const tgt = effect.transformTarget.toLowerCase();
    const found = p.drop.find(c => c.type===1 && (c.name||'').toLowerCase().includes(tgt))
                || p.deck.find(c => c.type===1 && (c.name||'').toLowerCase().includes(tgt));
    if (found) {
      const isInDeck = p.deck.some(c => c.instanceId === found.instanceId);
      // 현재 카드를 드롭으로, 타겟 카드를 같은 존에 소환
      const currentCard = zone === 'item' ? p.item : p.field[zone];
      const newCard = { ...found, state: 'stand', soul: currentCard?.soul || [] };
      if (isInDeck) {
        p = { ...p, deck: p.deck.filter(c => c.instanceId !== found.instanceId) };
        p = { ...p, deck: [...p.deck].sort(() => Math.random()-0.5) };
      } else {
        p = { ...p, drop: p.drop.filter(c => c.instanceId !== found.instanceId) };
      }
      if (currentCard) p = { ...p, drop: [...p.drop, currentCard] };
      if (zone === 'item') p = { ...p, item: newCard };
      else p = { ...p, field: { ...p.field, [zone]: newCard } };
      logs.push(`🔀 [Transform] ${currentCard?.name} → ${found.name}`);
    } else {
      logs.push(`❌ Transform 대상 없음: "${effect.transformTarget}"`);
    }
  }
  // putIntoSoulOf: 특정 카드의 소울에 추가
  if (effect.putIntoSoulOf) {
    const kw = effect.putIntoSoulOf.toLowerCase();
    for (const z2 of ['left','center','right']) {
      const fc = p.field[z2];
      if (fc && ((fc.name||'').toLowerCase().includes(kw) || (fc.tribe||'').toLowerCase().includes(kw))) {
        const cardToAdd = zone === 'item' ? p.item : p.field[zone];
        if (cardToAdd && z2 !== zone) {
          const updated = { ...fc, soul: [...(fc.soul||[]), cardToAdd] };
          p = { ...p, field: { ...p.field, [z2]: updated, [zone]: null }, drop: [...p.drop] };
          logs.push(`💫 ${cardToAdd.name} → ${fc.name} 소울`);
          break;
        }
      }
    }
  }

  // 드롭에서 소환 (Act: "Call up to one X from your drop zone")
  if (effect.callFromDrop) {
    const dropTxt = (text||'').toLowerCase();
    const sizeNumM = dropTxt.match(/size\s+(\d+)/i);
    const nameKwM = (text||'').match(/with\s+"([^"]+)"\s+in\s+its\s+card\s+name/i);
    const sizeFilter = sizeNumM ? parseInt(sizeNumM[1]) : null;
    const nameFilter = nameKwM ? nameKwM[1].toLowerCase() : null;
    const candidates = p.drop.filter(c => {
      if (c.type !== 1) return false;
      if (sizeFilter !== null && (c.size??0) !== sizeFilter) return false;
      if (nameFilter && !(c.name||'').toLowerCase().includes(nameFilter)) return false;
      return true;
    });
    if (candidates.length > 0) {
      const monster = candidates[candidates.length - 1];
      const emptyZones = ['left','center','right'].filter(z => !p.field[z]);
      if (emptyZones.length > 0) {
        const targetZone = emptyZones[0];
        p = { ...p,
          field: { ...p.field, [targetZone]: { ...monster, state: 'stand', soul: [] } },
          drop: p.drop.filter(c => c.instanceId !== monster.instanceId),
        };
        logs.push(`📤 [Act] ${monster.name} 드롭→필드(${targetZone})`);
      } else { logs.push(`❌ 빈 존 없음`); }
    } else {
      logs.push(`❌ 드롭에 대상 카드 없음${nameFilter?` ("${nameFilter}")`:''}${sizeFilter?` size${sizeFilter}`:''}`);
    }
  }

  // once per turn 체크 (actOncePT 재선언)
  const actOncePT = /you may only use "[^"]*" once per turn/i.test(text);
  const _actUsed = { ...(state._usedThisTurn||{}) };
  if (actOncePT) _actUsed[`act_${card.id}_${zone}`] = true;
  const result = { ...state, [ownerSide]: p, [def]: defP, _usedThisTurn: _actUsed, log: [...state.log, ...logs] };
  if (defP.life <= 0) return { ...result, winner: ownerSide };
  return result;
}


