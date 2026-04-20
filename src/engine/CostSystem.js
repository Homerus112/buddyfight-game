// ── 코스트 / 조건 / 효과 파싱 ────────────────────────────

/** parseCost: [Call Cost] / [Equip Cost] / [Cast Cost] 파싱 */
export function parseCost(text = '') {
  if (!text) return null;
  // [Call Cost] [내용] 형태: 대괄호 블록 직접 추출 (Drum Re:B 등 복합 코스트)
  const bracketBlock = text.match(/\[(?:Call Cost|Equip Cost|Cast Cost)\]\s*\[([^\]]+)\]/);
  // 일반 패턴 fallback
  const blockM = bracketBlock ? null : text.match(/\[(?:Call Cost|Equip Cost|Cast Cost)\]\s*([\s\S]*?)(?=\n\n|\[(?:Counter|Auto|Act|Cont|Penetrate|Soulguard|Double|Triple|Move|Lifelink|Set|Omni|Transform)\]|You may only|$)/);
  const costText = bracketBlock ? bracketBlock[1] : (blockM ? blockM[1] : '');
  // &로 분리된 복합 코스트 처리
  const parts = costText.split(/\s*&\s*/);
  const search = costText || text.split('\n')[0];
  // bracketBlock 전용 part 체크 (search와 별도)
  const _bracketParts = bracketBlock ? bracketBlock[1].split(/\s*&\s*/) : parts;
  const cost = {};

  const gm = search.match(/[Pp]ay\s+(\d+)\s+gauge/);
  if (gm) cost.gauge = parseInt(gm[1]);
  const lm = search.match(/[Pp]ay\s+(\d+)\s+life/);
  if (lm) cost.life = parseInt(lm[1]);
  const dm = search.match(/[Dd]iscard\s+(one|two|three|\d+)\s+card/);
  if (dm) { const w={one:1,two:2,three:3}; cost.discard = w[dm[1]] ?? parseInt(dm[1]); }
  const sm = search.match(/[Pp]ut\s+(?:the\s+top\s+)?(?:(\d+|two|three|four|one)\s+)?cards?\s+(?:\w+\s+)*?into\s+(?:its\s+|this\s+(?:card|monster)'?s\s+)?soul/i);
  if (sm) {
    const numWords = {one:1,two:2,three:3,four:4};
    cost.soulFromDeck = numWords[sm[1]?.toLowerCase()] ?? parseInt(sm[1] || 1);
  }
  // "&분리 코스트에서도 체크 (Drum Bunker Dragon 등: "[Pay 1 gauge & Put top card into its soul]")"
  if (!cost.soulFromDeck) {
    for (const part of _bracketParts) {
      const smP = part.match(/[Pp]ut\s+(?:the\s+top\s+)?(?:(\d+|two|three|four|one)\s+)?cards?\s+(?:\w+\s+)*?into\s+(?:its\s+|this\s+(?:card|monster)'?s\s+)?soul/i);
      if (smP) {
        const numWords = {one:1,two:2,three:3,four:4};
        cost.soulFromDeck = numWords[smP[1]?.toLowerCase()] ?? parseInt(smP[1] || 1);
        break;
      }
    }
  }
  // 손패에서 소울 (put X from your hand into this card's soul)
  const smHand = search.match(/[Pp]ut\s+(?:up\s+to\s+)?(?:(\d+|two|three|one)\s+)?.*?from\s+your\s+hand\s+into\s+(?:this\s+(?:card|monster)'s\s+)?soul/i);
  if (smHand) {
    const numWords = {one:1,two:2,three:3};
    cost.soulFromHand = numWords[smHand[1]?.toLowerCase()] ?? parseInt(smHand[1] || 1);
  }
  const dropM = search.match(/[«"]([^»"]+)[»"]\s+in\s+(?:your\s+)?drop/i);
  if (dropM) cost.dropMonster = dropM[1].trim();

  return Object.keys(cost).length > 0 ? cost : null;
}

/** parseCastCondition: "You may only cast this card if/during..." 파싱 */
export function parseCastCondition(text = '') {
  if (!text) return null;
  const onlyM = text.match(/You may only (?:cast|use) this card(.*?)(?=\n\n|\n■|$)/is);
  if (!onlyM) return null;
  const condText = onlyM[1].toLowerCase();
  const cond = {};

  if (condText.includes("opponent's turn")) cond.opponentTurn = true;
  if (condText.includes('during an attack')) cond.duringAttack = true;
  if (condText.includes('if you are being attacked')) { cond.opponentTurn=true; cond.duringAttack=true; }
  if ((condText.includes('no monster') || condText.includes('no monsters')) && condText.includes('center')) cond.noCenterMonster = true;
  if (condText.includes('neither') && condText.includes('center')) cond.noCenterBoth = true;
  if (condText.includes('have a monster') && condText.includes('center')) cond.hasCenterMonster = true;

  const myLifeM = text.match(/your life is\s+(\d+)\s+or\s+less/i);
  if (myLifeM) cond.maxLife = parseInt(myLifeM[1]);
  const opLifeM = text.match(/opponent'?s?\s+life\s+is\s+(\d+)\s+or\s+less/i);
  if (opLifeM) cond.opponentMaxLife = parseInt(opLifeM[1]);

  // "you have a/an «X» on your field" 또는 "«X» monster on your field" 패턴
  // "and if you have ..." 복합 조건도 처리
  const fieldM = text.match(/[«\"]([^»\"]+)[»\"]\s+(?:monster\s+)?on\s+your\s+field/i)
               || text.match(/[«\"]([^»\"]+)[»\"]\s+is\s+on\s+your\s+field/i)
               || text.match(/you have (?:a|an)\s+[«\"]?([^»\",]+)[»\"]?\s+(?:monster\s+)?on\s+your\s+field/i)
               || text.match(/you have (?:a|an)\s+[«\"]?([^»\",]+)[»\"]?\s+on\s+(?:the\s+)?field/i);
  if (fieldM) cond.requireFieldMonster = (fieldM[1] || fieldM[0]).trim();

  if (condText.includes('once per turn')) cond.oncePerTurn = true;
  if (condText.includes('final phase')) cond.finalPhase = true;
  if (condText.includes("opponent's final")) cond.opponentFinalPhase = true;

  return Object.keys(cond).length > 0 ? cond : null;
}

export function isCounterSpell(text = '') {
  if (!/\[Counter\]/i.test(text)) return false;
  // [Cast Cost]가 있거나 [Counter][Act] 형태이면 메인 페이즈에도 사용 가능
  // → 순수 [Counter] (반응형): cast cost 없고 [Act] 없는 경우
  // 예: "Dragonic Charge" = [Counter] Put two cards into gauge → Cast Cost 없음 → 카운터 전용
  // 단, 플레이어가 메인 페이즈에 발동하면 허용 (이 게임에서는 모든 스펠 메인 페이즈 발동 가능)
  // → 항상 false 반환: 메인 페이즈에서도 발동 가능하게 함
  return false; // 메인 페이즈 발동 허용 - counter window에서만 별도 처리
}

export function isStrictCounterSpell(text = '') {
  // 진짜 카운터 전용 (상대 공격 중에만): [Counter]가 있고 Cast Cost 없는 반응형
  if (!/\[Counter\]/i.test(text)) return false;
  // "During your turn"이 있으면 메인 페이즈 전용
  if (/during your turn/i.test(text)) return false;
  return true;
}

export function canPayCost(playerState, cost) {
  if (!cost) return { ok: true };
  const errors = [];
  if (cost.gauge != null && playerState.gauge.length < cost.gauge) errors.push(`게이지 부족 (필요 ${cost.gauge})`);
  if (cost.life != null && playerState.life <= cost.life) errors.push('라이프 부족');
  if (cost.discard != null && playerState.hand.length < cost.discard + 1) errors.push('손패 부족');
  if (cost.soulFromDeck != null && playerState.deck.length < cost.soulFromDeck) errors.push('덱 부족');
  if (cost.soulFromHand != null && playerState.hand.length < cost.soulFromHand) errors.push(`손패 부족 (소울용 ${cost.soulFromHand}장)`);
  if (cost.soulFromDrop && !playerState.drop.some(c => c.type === 1)) errors.push('드롭존에 몬스터 없음');
  if (cost.dropMonster) {
    const kw = cost.dropMonster.toLowerCase();
    if (!playerState.drop.some(c => (c.name||'').toLowerCase().includes(kw))) errors.push(`드롭에 «${cost.dropMonster}» 없음`);
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

export function canCastSpell(gameState, card, casterSide) {
  const text = card.text || '';
  const cond = parseCastCondition(text);
  const isCounter = isCounterSpell(text);
  const isOpponentTurn = gameState.activePlayer !== casterSide;
  const p = gameState[casterSide];
  const opp = gameState[casterSide === 'player' ? 'ai' : 'player'];

  // [Counter] 카드: 상대 공격 중이면 opponentTurn/duringAttack 자동 충족
  if (isCounter && isOpponentTurn && gameState.attackingCard && !cond) return { ok: true };

  if (!cond) return { ok: true };
  const errors = [];

  if (cond.opponentTurn && !isOpponentTurn) errors.push('상대 턴에만 사용 가능');
  if (cond.duringAttack && !gameState.attackingCard) errors.push('상대 공격 중에만 사용 가능');
  if (cond.finalPhase && gameState.phase !== 'final') errors.push('파이널 페이즈에만 사용 가능');
  if (cond.noCenterMonster && p.field.center) errors.push('내 센터에 몬스터 없어야 함');
  if (cond.noCenterBoth && (p.field.center || opp.field.center)) errors.push('양측 센터 비어야 함');
  if (cond.hasCenterMonster && !p.field.center) errors.push('내 센터에 몬스터 필요');
  if (cond.maxLife && p.life > cond.maxLife) errors.push(`라이프 ${cond.maxLife} 이하 필요`);
  if (cond.opponentMaxLife && opp.life > cond.opponentMaxLife) errors.push(`상대 라이프 ${cond.opponentMaxLife} 이하 필요`);
  if (cond.requireFieldMonster) {
    const kw = cond.requireFieldMonster.toLowerCase();
    const hasIt = Object.values(p.field).some(c => c && (
      (c.name||'').toLowerCase().includes(kw) ||
      (c.tribe||'').toLowerCase().includes(kw) ||
      (c.text||'').toLowerCase().includes(kw)
    ));
    if (!hasIt) errors.push(`필드에 «${cond.requireFieldMonster}» 필요`);
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

export function payCost(playerState, cost, excludeInstanceId = null) {
  if (!cost) return playerState;
  let p = { ...playerState };
  if (cost.gauge) p = { ...p, gauge: p.gauge.slice(0, p.gauge.length - cost.gauge) };
  if (cost.life) p = { ...p, life: Math.max(0, p.life - cost.life) };
  if (cost.discard) {
    const hand = excludeInstanceId ? p.hand.filter(c => c.instanceId !== excludeInstanceId) : p.hand;
    const discarded = hand.slice(-cost.discard);
    const ids = new Set(discarded.map(c => c.instanceId));
    p = { ...p, hand: p.hand.filter(c => !ids.has(c.instanceId)), drop: [...p.drop, ...discarded] };
  }
  if (cost.soulFromDeck && cost.soulFromDeck > 0) {
    const n = Math.min(cost.soulFromDeck, p.deck.length);
    p = { ...p, _pendingSoul: [...(p._pendingSoul||[]), ...p.deck.slice(0, n)], deck: p.deck.slice(n) };
  }
  if (cost.soulFromHand && cost.soulFromHand > 0) {
    const n = Math.min(cost.soulFromHand, p.hand.length);
    const soulCards = p.hand.slice(-n);
    const ids = new Set(soulCards.map(c => c.instanceId));
    p = { ...p, _pendingSoul: [...(p._pendingSoul||[]), ...soulCards], hand: p.hand.filter(c => !ids.has(c.instanceId)) };
  }
  // 드롭존에서 소울 (Spartand 등)
  if (cost.soulFromDrop) {
    const dropMonster = p.drop.slice().reverse().find(c => c.type === 1);
    if (dropMonster) {
      p = { ...p, _pendingSoul: [...(p._pendingSoul||[]), dropMonster], drop: p.drop.filter(c => c.instanceId !== dropMonster.instanceId) };
    }
  }
  return p;
}

/** parseSpellEffect: Counter 이후 또는 전체 텍스트에서 효과 추출 */
export function parseSpellEffect(text = '') {
  if (!text) return null;
  const counterM = text.match(/\[Counter\]\s*([\s\S]+)/i);
  const overturnM = text.match(/\[Overturn\]\s*(?:\[[^\]]+\]\s*)?([\s\S]+)/i);
  const effectText = counterM ? counterM[1] : (overturnM ? overturnM[1] : text);
  if (counterM) effect.isCounter = true;
  if (overturnM) effect.isOverturn = true;
  const t = effectText.toLowerCase();
  const effect = {};

  // ── 공격 무효화 ──
  if (/nullify\s+(?:the|that|this|an?)\s+attack/i.test(effectText)) effect.nullifyAttack = true;
  if (/cannot\s+\[?[Ss]tand\]?|for\s+this\s+turn.*?cannot/i.test(effectText)) effect.cannotStand = true;

  // ── 라이프 ──
  const gainM = effectText.match(/you\s+gain\s+(\d+)\s+life/i);
  if (gainM) effect.gainLife = parseInt(gainM[1]);

  // ── 데미지 ──
  const dmgM = effectText.match(/[Dd]eal\s+(\d+)\s+damage/i);
  if (dmgM) effect.damage = parseInt(dmgM[1]);

  // ── 데미지 경감 ──
  const dmgRedM = effectText.match(/(?:damage.*?reduc|reduc.*?damage)[^\d]*(\d+)/i);
  if (dmgRedM) effect.damageReduce = parseInt(dmgRedM[1]);
  if (/the\s+next\s+time\s+damage.*?(?:it\s+is\s+)?(?:reduc|negat|prevent|0)/i.test(effectText)) effect.nextDamageNegate = true;

  // ── 드로우 ──
  const drawM = effectText.match(/draw\s+(\d+)\s+cards?/i) || (/draw\s+a\s+card/i.test(effectText) ? ['','1'] : null);
  if (drawM) effect.draw = parseInt(drawM[1]);

  // ── 차지 (게이지) - 다중 장 패턴 먼저 체크 ──
  const _gNums = {one:1,two:2,three:3,four:4,five:5,six:6};
  // 다중 장: "put two cards from the top of your deck into the gauge"
  const deckGaugeM2 = effectText.match(/put\s+(\w+)\s+cards?\s+from\s+the\s+top.*?(?:into\s+(?:the\s+|your\s+)?gauge)/i)
                   || effectText.match(/put\s+(?:the\s+top\s+)?(\w+)\s+cards?.*?(?:into\s+(?:the\s+|your\s+)?gauge)/i);
  if (deckGaugeM2) {
    effect.gainGauge = _gNums[deckGaugeM2[1].toLowerCase()] ?? parseInt(deckGaugeM2[1]) ?? 1;
  }
  // 단일 장 fallback
  if (!effect.gainGauge && (/put\s+the\s+top\s+card.*?gauge/i.test(effectText) || /into\s+(?:your\s+|the\s+)?gauge/i.test(effectText))) {
    effect.gainGauge = 1;
  }

  // ── 손패 버리기 ──
  if (/discard\s+all\s+your\s+hand|drop\s+all\s+your\s+hand\s+cards?/i.test(effectText)) effect.discardAll = true;
  const _discNums = {one:1,two:2,three:3};
  const discardNM = effectText.match(/discard\s+(?:a\s+|one\s+|two\s+|three\s+|(\d+)\s+)?(?:hand\s+)?cards?/i);
  if (discardNM && !effect.discardAll) {
    const raw = discardNM[1]; effect.discardN = raw ? parseInt(raw) : (/two/i.test(discardNM[0])?2:/three/i.test(discardNM[0])?3:1);
  }
  if (/drop\s+(?:a\s+|one\s+)?hand\s+cards?/i.test(effectText) && !effect.discardAll) {
    const dm = effectText.match(/drop\s+(two|three|\d+)\s+hand/i);
    effect.discardN = (effect.discardN ?? 0) + (_discNums[dm?.[1]?.toLowerCase()] ?? parseInt(dm?.[1]) ?? 1);
  }

  // ── 덱 드롭 ──
  const deckDropM = effectText.match(/put\s+the\s+top\s+(\w+)\s+cards?\s+of\s+your\s+deck\s+into\s+(?:your\s+)?drop/i);
  if (deckDropM) { const nums={one:1,two:2,three:3,four:4,five:5}; effect.deckToDrop = nums[deckDropM[1].toLowerCase()] ?? parseInt(deckDropM[1]) ?? 1; }

  // ── 덱 → 손패 ──
  const deckHandM = effectText.match(/put\s+(?:up\s+to\s+)?(?:the\s+top\s+)?(?:(\w+)\s+)?cards?\s+(?:from\s+(?:the\s+top\s+of\s+)?your\s+deck\s+)?into\s+your\s+hand/i);
  if (deckHandM) { const nums={one:1,two:2,three:3,four:4,five:5}; effect.deckToHand = nums[(deckHandM[1]||'one').toLowerCase()] ?? parseInt(deckHandM[1] || '1') ?? 1; }

  // ── 파괴 ──
  const destroyPM = effectText.match(/[Dd]estroy\s+(?:a|all)?\s*(?:monsters?)?\s*.*?with\s+(\d+)\s+or\s+less\s+power/i);
  if (destroyPM) effect.destroyMaxPower = parseInt(destroyPM[1]);
  if (/destroy\s+all\s+monsters/i.test(effectText)) effect.destroyAll = true;
  const destroyTargetM = effectText.match(/[Dd]estroy\s+(?:a\s+)?(?:size\s*(\d+)\s+or\s+less\s+)?(?:monster|card|spell|item)/i);
  if (destroyTargetM && !effect.destroyMaxPower && !effect.destroyAll) {
    effect.destroyTarget = 'opponent';
    if (destroyTargetM[1]) effect.destroyMaxSize = parseInt(destroyTargetM[1]);
  }
  if (/destroy.*?(?:on\s+)?your\s+opponent/i.test(effectText)) effect.destroyTarget = 'opponent';

  // ── 드롭에서 호출 ──
  const callDropM = effectText.match(/[Cc]all\s+(?:up\s+to\s+one\s+)?(?:a\s+)?(?:size\s*\d+\s+or\s+less\s+)?(?:monster|card|[«"][^»"]+[»"])\s+from\s+your\s+drop/i);
  if (callDropM) effect.callFromDrop = true;

  // ── 덱 서치 ──
  if (/[Ss]earch\s+your\s+deck/i.test(effectText)) effect.searchDeck = true;

  // ── 파워/방어/크리티컬 버프 ──
  // 전투 버프: "give it power+N" 또는 "for this battle, give it power+N"
  const battlePowM = effectText.match(/(?:for\s+this\s+battle|in\s+battle).*?power\+(\d+)/i)
                  || effectText.match(/power\+(\d+).*?(?:for\s+this\s+battle|in\s+battle)/i)
                  || effectText.match(/give\s+it\s+power\+(\d+)/i)
                  || effectText.match(/gets?\s+power\+(\d+)/i);
  if (battlePowM) effect.battlePowerBuff = parseInt(battlePowM[1]);

  const battleDefM = effectText.match(/(?:for\s+this\s+battle|in\s+battle).*?defense\+(\d+)/i)
                  || effectText.match(/defense\+(\d+).*?(?:for\s+this\s+battle|in\s+battle)/i)
                  || effectText.match(/give\s+it.*?defense\+(\d+)/i)
                  || effectText.match(/gets?.*?defense\+(\d+)/i);
  if (battleDefM) effect.battleDefenseBuff = parseInt(battleDefM[1]);

  // 전투 버프 타겟: "Choose an «X» in battle"
  const battleTargetM = effectText.match(/[Cc]hoose (?:a|an)\s+[«\"]([^»\"]+)[»\"]\s+in\s+battle/i);
  if (battleTargetM) effect.battleTarget = battleTargetM[1].trim();

  // Then, if [조건] → 조건부 추가 효과
  const thenIfM = effectText.match(/[Tt]hen[,.]?\s+if\s+you have (?:a|an)\s+[«\"]?([^»\",]+)[»\"]?\s+on\s+your\s+field[,.]?\s+(.*?)(?=\n|$)/i);
  if (thenIfM) {
    effect.conditionalFieldMonster = thenIfM[1].trim();
    const condEffect = thenIfM[2];
    // 조건부 효과 파싱
    const cgM = condEffect.match(/put\s+the\s+top\s+(\w+)\s+cards?.*?gauge/i);
    if (cgM) { const nums={one:1,two:2,three:3,four:4,five:5}; effect.conditionalGauge = nums[cgM[1].toLowerCase()] ?? parseInt(cgM[1]) ?? 1; }
    const clM = condEffect.match(/you\s+gain\s+(\d+)\s+life/i);
    if (clM) effect.conditionalLife = parseInt(clM[1]);
    const cdM = condEffect.match(/deal\s+(\d+)\s+damage/i);
    if (cdM) effect.conditionalDamage = parseInt(cdM[1]);
    const cDrawM = condEffect.match(/draw\s+(\d+)\s+cards?/i);
    if (cDrawM) effect.conditionalDraw = parseInt(cDrawM[1]);
  }
  const powM = effectText.match(/power\+(\d+)/i);
  if (powM && !battlePowM) effect.powerBuff = parseInt(powM[1]);
  const defM = effectText.match(/defense\+(\d+)/i);
  if (defM && !battleDefM) effect.defenseBuff = parseInt(defM[1]);
  const critM = effectText.match(/critical\+(\d+)/i);
  if (critM) effect.criticalBuff = parseInt(critM[1]);

  // ── [Stand] / [Rest] ──
  if (/\[Stand\]|(?:^|[\s,])stand\b.{0,50}(?:monster|card|item)/im.test(effectText)) {
    effect.standTarget = /opponent/i.test(effectText) ? 'opponent' : 'player';
  }
  if (/\[Rest\]|(?:^|[\s,])rest\b.{0,50}(?:monster|card)/im.test(effectText)) {
    effect.restTarget = /opponent/i.test(effectText) ? 'opponent' : 'player';
  }

  // ── 손패 반환 ──
  if (/[Rr]eturn.{0,60}(?:to|into).{0,20}hand/i.test(effectText)) {
    const sizeM = effectText.match(/size\s+(\d+)\s+or\s+less/i);
    effect.returnToHand = {
      target: /opponent/i.test(effectText) ? 'opponent' : 'player',
      maxSize: sizeM ? parseInt(sizeM[1]) : null,
    };
  }

  // ── 소울 추가 ──
  if (/put.*?(?:into|to)\s+(?:this|the|a|your)\s+(?:card|monster)'?s?\s+soul/i.test(effectText)) effect.addToSoul = true;

  // ── 추가 어택 페이즈 ──
  if (/you\s+get\s+another\s+(?:attack|final)\s+phase/i.test(effectText)) effect.extraPhase = true;

  // ── 부여 불가 / 파괴 불가 ──
  if (/cannot\s+be\s+(?:destroy|attack|nullif)/i.test(effectText)) effect.cannotBeDestroyed = true;
  // [Counterattack] 부여
  if (/\[Counterattack\]|give\s+it.*?\[counterattack\]|gets?\s+\[counterattack\]/i.test(effectText)) effect.giveCounterattack = true;
  if (/the\s+next\s+time.*?(?:destroy|would\s+be)/i.test(effectText)) effect.nextDestroyNegate = true;

  // choose one of - 선택지 파싱 (여러 패턴 지원)
  const _hasChoose = /[Cc]hoose and use one of|[Cc]hoose one of the following|[Cc]hoose one of two/i.test(effectText);
  if (_hasChoose) {
    const opts = [];
    const optParts = effectText.split(/\n[-•]\s*/);
    for (let i = 1; i < optParts.length; i++) {
      const optText = optParts[i].trim();
      if (!optText) continue;
      const subEffect = {};
      if (/nullify.*?attack/i.test(optText)) subEffect.nullifyAttack = true;
      if (/you gain (\d+) life/i.test(optText)) { const m=optText.match(/you gain (\d+) life/i); subEffect.gainLife=parseInt(m[1]); }
      if (/deal (\d+) damage/i.test(optText)) { const m=optText.match(/deal (\d+) damage/i); subEffect.damage=parseInt(m[1]); }
      if (/draw (\d+|a) cards?/i.test(optText)) { const m=optText.match(/draw (\d+|a) cards?/i); subEffect.draw=m[1]==='a'?1:parseInt(m[1]); }
      if (/(?:into|your) gauge/i.test(optText)) subEffect.gainGauge=1;
      if (/\[Stand\]/i.test(optText)) subEffect.standTarget='player';
      if (/\[Rest\]/i.test(optText)) subEffect.restTarget='opponent';
      if (/return.{0,50}hand/i.test(optText)) { subEffect.returnToHand={target:/opponent/i.test(optText)?'opponent':'player',maxSize:null}; }
      if (/destroy/i.test(optText)) subEffect.destroyTarget='opponent';
      if (/put.*?soul/i.test(optText)) subEffect.addToSoul=true;
      if (/power\+(\d+)/i.test(optText)) { const m=optText.match(/power\+(\d+)/i); subEffect.battlePowerBuff=parseInt(m[1]); }
      if (/defense\+(\d+)/i.test(optText)) { const m=optText.match(/defense\+(\d+)/i); subEffect.battleDefenseBuff=parseInt(m[1]); }
      if (/critical\+(\d+)/i.test(optText)) { const m=optText.match(/critical\+(\d+)/i); subEffect.criticalBuff=parseInt(m[1]); }
      opts.push({ text: optText.slice(0,80), effect: subEffect });
    }
    if (opts.length > 0) {
      effect.chooseOptions = opts;
      // 기본값으로 첫번째 옵션 적용 (UI에서 선택하면 덮어씀)
      if (opts[0]?.effect) Object.assign(effect, opts[0].effect);
    }
  }

  // 필드 전체 버프
  const fieldBM = effectText.match(/all\s+(?:monsters?|cards?)\s+on\s+your\s+field\s+get[s]?\s+power\+(\d+)/i);
  if (fieldBM) effect.fieldPowerBuff = parseInt(fieldBM[1]);
  const fieldDM = effectText.match(/all\s+(?:monsters?|cards?)\s+on\s+your\s+field\s+get[s]?.*?defense\+(\d+)/i);
  if (fieldDM) effect.fieldDefenseBuff = parseInt(fieldDM[1]);
  // 드롭에서 소환
  if (/[Cc]all\s+.*?from\s+your\s+drop/i.test(effectText)) effect.callFromDrop = true;
  // 상대 공격 불가
  if (/cannot\s+(?:be\s+)?attack/i.test(effectText)) effect.cannotAttack = true;

  // deck→hand (put from deck into hand)
  if (!effect.searchDeck && /put\s+up\s+to\s+(?:one|\d+).*?from\s+your\s+deck.*?into\s+your\s+hand/i.test(effectText)) effect.deckToHand = true;
  if (!effect.searchDeck && /put\s+.*?from\s+your\s+(?:deck|drop\s+zone).*?into\s+your\s+hand/i.test(effectText)) effect.deckToHand = true;

  // deck drop + call (Drop top N, call from among them)
  if (/drop\s+the\s+top\s+\w+\s+cards?\s+of\s+your\s+deck.*?call/i.test(effectText)) effect.deckDropCall = true;

  // shuffle deck
  if (/shuffle\s+your\s+deck/i.test(effectText)) effect.shuffleDeck = true;

  // life equal to size/power
  if (/you\s+gain\s+life\s+equal\s+to/i.test(effectText)) effect.gainLifeEqual = true;

  // choose a card on field + this turn prevention
  if (/during\s+this\s+turn.*?(?:next\s+time|would\s+be\s+destroy)/i.test(effectText)) effect.nextDestroyNegate = true;

  // [Act] in spell text
  if (/^\s*\[Act\]/i.test(effectText)) effect.isActSpell = true;

  // for this turn, gets [keyword]
  const thisTurnKwM = effectText.match(/for\s+this\s+turn.*?gets?\s+\[(Penetrate|Double Attack|Triple Attack|Counterattack|Move|Soulguard)\]/i);
  if (thisTurnKwM) effect.thisTurnKeyword = thisTurnKwM[1];

  // opponent cannot X
  if (/opponent.*?cannot\s+(?:attack|declare\s+attack)/i.test(effectText)) effect.cannotAttack = true;

  // nullify opponent spell
  if (/nullify\s+the\s+spell\s+cast\s+by\s+your\s+opponent/i.test(effectText)) effect.nullifyOpponentSpell = true;
  // cast condition (인식용)
  if (/you\s+may\s+only\s+cast\s+this\s+card\s+if/i.test(effectText)) effect.castCondition = true;
  // tribe buff: all «X» on your field get
  const tribeBufM = effectText.match(/all\s+[«"]([^»"]+)[»"]\s+on\s+your\s+field\s+get[s]?\s+(?:power\+(\d+)|.*?power\+(\d+))/i);
  if (tribeBufM) { effect.fieldPowerBuff = parseInt(tribeBufM[2]||tribeBufM[3]||0); }
  // remain on field
  if (/remain\s+on\s+the\s+field/i.test(effectText)) effect.remainOnField = true;
  // destroy by name/tribe
  if (!effect.destroyTarget && /destroy.*?[«"][^»"]+[»"].*?on\s+the\s+field/i.test(effectText)) effect.destroyTarget = 'named';
  // opponent life condition (recognition)
  if (/opponent.*?life\s+is\s+\d+\s+or\s+less/i.test(effectText)) effect.opponentLifeCondition = true;

  // 데미지 감소: "next time damage would be dealt, reduce by N"
  const dmgReduceM = effectText.match(/(?:damage|it)\s+is\s+reduced\s+by\s+(\d+)|damage.*?reduced\s+by\s+(\d+)/i)
                  || effectText.match(/next\s+time.*?damage.*?reduced?\s+by\s+(\d+)/i);
  if (dmgReduceM) effect.damageReduce = parseInt(dmgReduceM[1]||dmgReduceM[2]||dmgReduceM[3]||1);

  // 이번 턴 다음 번 피해 무효/감소
  if (/next\s+time.*?(?:damage|attack|would\s+be\s+destroy)/i.test(effectText)) effect.nextTimePrevent = true;

  // 다음 번 파괴 방지 (스펠)
  if (/next\s+time.*?(?:that\s+card|this\s+card).*?would\s+be\s+destroy/i.test(effectText)) effect.nextDestroyNegate = true;

  // damage increased
  const dmgIncM = effectText.match(/damage.*?(?:increas|increased)\s+by\s+(\d+)/i);
  if (dmgIncM) effect.damageIncrease = parseInt(dmgIncM[1]);

  // choose field card + effect
  if (/choose.*?on\s+your\s+field.*?(?:for\s+this\s+turn|during\s+this)/i.test(effectText)) effect.chooseFieldEffect = true;

  // [Cast Cost] 태그 (인식용)
  if (/\[cast\s+cost\]/i.test(effectText)) effect.hasCastCost = true;

  // put to zone
  if (/put.*?(?:into|to)\s+(?:the|your)\s+(?:soul|gauge|drop\s+zone|hand)/i.test(effectText)) {
    if (!effect.addToSoul && !effect.gainGauge && !effect.deckToHand) effect.putToZone = true;
  }

  // "look at the top N cards of your deck" → 덱 상단 확인 (인식용)
  if (/look\s+at\s+the\s+top\s+(?:\d+|\w+)\s+cards?\s+of\s+your\s+deck/i.test(effectText)) effect.deckPeek = true;
  // "put top N cards into soul of this monster"
  const putSoulM = effectText.match(/put\s+the\s+top\s+(\w+|\d+)\s+cards?\s+(?:of\s+your\s+deck\s+)?into.*?soul/i);
  if (putSoulM && !effect.addToSoul) {
    const _ns={one:1,two:2,three:3,four:4};
    effect.addToSoulN = _ns[putSoulM[1]?.toLowerCase()] ?? parseInt(putSoulM[1]) ?? 1;
    effect.addToSoul = true;
  }
  // "all monsters on your field get [keyword]"
  if (/all\s+(?:monsters?|«[^»]+»)\s+on\s+your\s+field.*?gets?\s+\[/i.test(effectText)) {
    if (/penetrate/i.test(effectText)) effect.fieldPenetrate = true;
    if (/move/i.test(effectText)) effect.fieldMove = true;
    if (/double\s+attack/i.test(effectText)) effect.fieldDoubleAttack = true;
  }
  // "for this turn, your opponent cannot use [counter]"
  if (/for\s+this\s+turn.*?(?:your\s+opponent|opponent).*?cannot.*?(?:use|cast)\s+(?:\[counter\]|counter|spell)/i.test(effectText)) {
    effect.blockOpponentCounter = true;
  }
  // "choose and use one of the following" → choose-one (인식용)
  if (/choose\s+and\s+use\s+one\s+of\s+the\s+following/i.test(effectText)) effect.chooseOne = true;
  // "the next time your life would become 0, it becomes 1" → 생명 보호
  if (/next\s+time.*?(?:life|your\s+life).*?(?:become|would\s+be)\s+0.*?(?:becomes?|it\s+is)\s+1/i.test(effectText)) effect.lifeProtection = true;
  // "put the top N cards of your deck into the drop zone"
  const deckDropM2 = effectText.match(/put\s+the\s+top\s+(\w+|\d+)\s+cards?\s+of\s+your\s+deck\s+into\s+(?:your\s+)?(?:the\s+)?drop/i);
  if (deckDropM2 && !effect.deckToDrop) { const _dn={one:1,two:2,three:3,four:4,five:5}; effect.deckToDrop = _dn[deckDropM2[1]?.toLowerCase()] ?? parseInt(deckDropM2[1]) ?? 1; }
  // "return a card from your opponent's field to hand"
  if (/return.*?(?:your\s+opponent'?s?|opponent'?s?)\s+(?:monster|card|item).*?(?:to\s+(?:your\s+)?hand|hand)/i.test(effectText)) {
    if (!effect.returnToHand) effect.returnToHand = { target: 'opponent' };
  }
  // "for this turn, your opponent cannot use Counter"
  if (/for\s+this\s+turn.*?(?:your\s+opponent|opponent).*?cannot\s+use\s+(?:counter|spell)/i.test(effectText)) effect.blockOpponentCounter = true;
  // "all X on your field get size-N"
  const sizeRedSpellM = effectText.match(/all\s+.*?on\s+your\s+field\s+(?:get|have)\s+size-?(\d+)|(?:reduce|lowered?)\s+(?:their|its)?\s+size\s+by\s+(\d+)/i);
  if (sizeRedSpellM) effect.fieldSizeReduce = parseInt(sizeRedSpellM[1]||sizeRedSpellM[2]||1);
  // "if you have a X on your field" 조건 (이미 있지만 강화)
  if (!effect.fieldCondition) {
    const fcM = effectText.match(/if\s+you\s+have\s+(?:a|an|no)\s+[«"]([^»"]+)[»"]\s+(?:monster\s+)?on\s+(?:your\s+)?field/i);
    if (fcM) effect.fieldCondition = fcM[1];
  }
  // [Set] 효과 파싱 강화
  if (/\[set\]/i.test(effectText)) {
    effect.setSpell = true;
    // "during your turn, when a X [Move]" 등 세트 효과
    const setBodyM = effectText.match(/\[set\]\s*(?:\([^)]+\))?\s*([\s\S]+?)(?=\[cast\s+cost\]|$)/i);
    const setBody = setBodyM ? setBodyM[1].toLowerCase() : '';
    if (/draw\s+a\s+card|드로우/i.test(setBody)) effect.setDraw = true;
    if (/all.*?(?:monsters?|characters?).*?(?:get|gain).*?(?:power|defense)\+(\d+)/i.test(setBody)) {
      const buffM = setBody.match(/power\+(\d+)/i);
      if (buffM) effect.fieldPowerBuff = parseInt(buffM[1]);
    }
    if (/cannot\s+(?:attack|be\s+attacked|move)/i.test(setBody)) effect.setRestrict = true;
    if (/at\s+the\s+(?:start|beginning).*?(?:gauge|draw)/i.test(setBody)) effect.setPhaseEffect = true;
    if (/when.*?(?:\[move\]|moves?)/i.test(setBody)) effect.setMoveEffect = true;
    if (/damage.*?(?:reduc|decreas)/i.test(setBody)) effect.damageReduction = 1;
    if (/opponent\s+cannot.*?(?:call|cast|use)/i.test(setBody)) effect.setBlockOpponent = true;
  }
  // destroy a card on the field (no size restriction)
  if (!effect.destroyMaxPower && !effect.destroyTarget && !effect.destroyAll &&
      /destroy\s+a\s+card\s+on\s+(?:the|your\s+opponent's)\s+field/i.test(effectText)) {
    effect.destroyTarget = 'opponent';
  }
  // life becomes 1 instead (life protection)
  if (/(?:next\s+time|would\s+become)\s+0.*?(?:becomes?|it\s+is)\s+1\s+instead/i.test(effectText)) effect.lifeProtection = true;
  // defense of that card is increased (for this battle)
  if (/defense\s+of\s+that\s+card\s+is\s+(?:increased|decreased)/i.test(effectText)) effect.battlePowerBuff = (effect.battlePowerBuff ?? 0);
  // if you have «X» on your field
  if (/if\s+you\s+have\s+(?:a|an)\s+[«"]/i.test(effectText)) effect.fieldCondition = true;
  // damage increased/decreased
  if (/damage\s+dealt.*?(?:increased|decreased)\s+by\s+(\d+)/i.test(effectText)) {
    const dm = effectText.match(/damage\s+dealt.*?(?:increased|decreased)\s+by\s+(\d+)/i);
    effect.damageModifier = parseInt(dm[1]);
  }

  return Object.keys(effect).length > 0 ? effect : null;
}
