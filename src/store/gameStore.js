import { create } from 'zustand';
import {
  createInitialGameState, castSpell,
  doStandPhase, doDrawPhase, chargeFromHand, drawOne,
  playActEffect as _enginePlayAct, playHandActEffect as _enginePlayHandAct,
  callMonster, equipItem, declareAttack, cancelAttack,
  resolveAttack, addToLinkAttack, resolveDoubleAttack,
  moveMonster, endTurn, setSpell, counterCastSpell,
} from '../engine/GameEngine.js';
import { runAITurn, setAIDifficulty, getAIDifficulty } from '../engine/AIEngine.js';
import { parseSpellEffect } from '../engine/CostSystem.js';
import { applyEnterEffect } from '../engine/MonsterEffects.js';
import { TURN_PHASE } from '../utils/constants.js';
import { recordGame } from '../utils/gameStats.js';

// 카운터 스펠용 Promise resolve 보관
let _counterResolve = null;

const useGameStore = create((set, get) => ({
  gameState: null,
  isAIThinking: false,
  selectedCard: null,
  gameMode: 'menu',
  aiDifficulty: 'normal',
  lang: (typeof localStorage !== 'undefined' ? localStorage.getItem('bf_language') : null) || 'ko',
  pendingChooseEffect: null, // { instanceId, options: [{text, effect}] }
  pendingActChoice: null,   // { zone, effects: [{label, idx}] }
  chargeStep: null,
  counterWindow: null,   // { attackerCard, targetZone } AI 공격 시 카운터 타이밍
  linkMode: false,
  setMode: false,

  startGame: (pDeck, pFlag, pBuddy, aDeck, aFlag, aBuddy, pSleeve=0, aSleeve=0) => {
    setAIDifficulty(get().aiDifficulty);
    const gs = createInitialGameState(pDeck, pFlag, pBuddy, aDeck, aFlag, aBuddy, pSleeve, aSleeve);
    // 재대전용 초기 설정 저장
    const initConfig = { pDeck, pFlag, pBuddy, aDeck, aFlag, aBuddy, pSleeve, aSleeve };
    const gsWithConfig = { ...gs, _initConfig: initConfig };
    set({ gameState: gsWithConfig, gameMode: 'game', selectedCard: null,
          chargeStep: null, linkMode: false, setMode: false, isAIThinking: false });
    if (gsWithConfig.activePlayer === 'ai') {
      setTimeout(() => get()._runAITurn(gsWithConfig), 150);
    }
  },
  reMatch: () => {
    const cfg = get().gameState?._initConfig;
    if (!cfg) return;
    const { pDeck, pFlag, pBuddy, aDeck, aFlag, aBuddy, pSleeve=0, aSleeve=0 } = cfg;
    get().startGame(pDeck, pFlag, pBuddy, aDeck, aFlag, aBuddy, pSleeve, aSleeve);
  },

  _runAITurn: async (initialState) => {
    if (get().isAIThinking) return;
    set({ isAIThinking: true });

    // counterCb: Promise + resolve 방식
    // 플레이어가 스펠 사용하면 즉시 resolve(수정된state)
    // 2.5초 타임아웃 후 resolve(null) → 공격 진행
    const counterCb = async (aiState, zone, card, target) => {
      // [Counter] 태그가 있는 스펠만 필터링
      const hasCounterSpell = aiState.player.hand.some(c =>
        (c.type === 3 || c.type === 4) && /\[Counter\]/i.test(c.text||'')
      );
      if (!hasCounterSpell) return null;
      return new Promise(resolve => {
        _counterResolve = resolve;
        set({ gameState: aiState, counterWindow: { attackerCard: card, targetZone: target, zone } });
        // 시간 제한 없음 - 플레이어가 패스/스펠 선택할 때까지 대기
      });
    };

    try {
      const final = await runAITurn(
        initialState,
        updated => set({ gameState: updated }),
        counterCb
      );
      set({ gameState: final, isAIThinking: false });
    } catch (err) {
      console.error('AI 턴 에러:', err);
      const gs = get().gameState;
      if (gs && gs.activePlayer === 'ai') {
        try {
          const recovered = endTurn(gs);
          set({ gameState: {
            ...recovered,
            log: [...recovered.log, `⚠️ AI 오류 복구 (${err.message?.slice(0,30)||'unknown'})`]
          }, isAIThinking: false, counterWindow: null });
        } catch(e) {
          set({ isAIThinking: false, counterWindow: null });
        }
      } else {
        set({ isAIThinking: false, counterWindow: null });
      }
    }
  },

  selectCard: (id) => set({ selectedCard: id }),
  clearSelection: () => set({ selectedCard: null }),
  toggleLinkMode: () => set(s => ({ linkMode: !s.linkMode, selectedCard: null })),
  toggleSetMode: () => set(s => ({ setMode: !s.setMode, selectedCard: null })),

  nextPhase: async () => {
    const { gameState, isAIThinking } = get();
    if (!gameState || gameState.winner || gameState.activePlayer !== 'player' || isAIThinking) return;
    const phase = gameState.phase;
    let s = gameState;

    if (phase === TURN_PHASE.STAND) {
      s = doStandPhase(s); s = { ...s, phase: TURN_PHASE.DRAW };
    } else if (phase === TURN_PHASE.DRAW) {
      s = doDrawPhase(s); s = { ...s, phase: TURN_PHASE.CHARGE };
      set({ gameState: s, chargeStep: 'selectCard' }); return;
    } else if (phase === TURN_PHASE.CHARGE) {
      s = { ...s, phase: TURN_PHASE.MAIN };
    } else if (phase === TURN_PHASE.MAIN) {
      s = { ...s, phase: TURN_PHASE.ATTACK };
    } else if (phase === TURN_PHASE.ATTACK) {
      s = { ...s, phase: TURN_PHASE.FINAL };
    } else if (phase === TURN_PHASE.FINAL) {
      s = { ...s, phase: TURN_PHASE.END };
    } else if (phase === TURN_PHASE.END) {
      s = endTurn(s);
      set({ gameState: s, chargeStep: null, linkMode: false, setMode: false });
      get()._runAITurn(s);
      return;
    }
    set({ gameState: s, chargeStep: null });
  },

  doCharge: (instanceId) => {
    const { gameState } = get();
    if (!gameState) return;
    let s = chargeFromHand(gameState, instanceId);
    s = drawOne(s);
    set({ gameState: { ...s, phase: TURN_PHASE.MAIN }, chargeStep: null, selectedCard: null });
  },

  skipCharge: () => {
    const { gameState } = get();
    if (!gameState) return;
    set({ gameState: { ...gameState, phase: TURN_PHASE.MAIN, log: [...gameState.log, '[나] 차지 스킵'] }, chargeStep: null });
  },

  playCallMonster: (instanceId, zone) => {
    const { gameState } = get();
    if (!gameState) return;
    set({ gameState: callMonster(gameState, instanceId, zone), selectedCard: null });
  },

  playEquipItem: (instanceId) => {
    const { gameState } = get();
    if (!gameState) return;
    set({ gameState: equipItem(gameState, instanceId), selectedCard: null });
  },

  playDeclareAttack: (zone) => {
    const { gameState, linkMode } = get();
    if (!gameState) return;
    if (linkMode) { set({ gameState: addToLinkAttack(gameState, zone) }); return; }
    set({ gameState: declareAttack(gameState, zone) });
  },

  executeLinkAttack: (targetZone) => {
    const { gameState } = get();
    if (!gameState || gameState.linkAttackQueue.length < 2) return;
    set({ gameState: resolveAttack(gameState, targetZone), linkMode: false });
  },

  playCancelAttack: () => {
    const { gameState } = get();
    if (!gameState) return;
    set({ gameState: cancelAttack({ ...gameState, linkAttackQueue: [] }), linkMode: false });
  },

  playResolveAttack: (targetZone) => {
    const { gameState } = get();
    if (!gameState) return;
    set({ gameState: resolveAttack(gameState, targetZone), linkMode: false });
  },

  playDropSpell: (instanceId, targetZone=null) => {
    const { gameState } = get();
    if (!gameState) return;
    // targetZone이 이미 지정된 경우(버프 대상 선택 완료) → 바로 발동
    if (!targetZone) {
      // choose-one 감지: 플레이어가 선택해야 할 스펠인지 확인
      const card = gameState.player.hand.find(c => c.instanceId === instanceId);
      if (card) {
        const effect = parseSpellEffect(card.text || '');
        if (effect?.chooseOptions?.length > 1) {
          set({ pendingChooseEffect: { instanceId, options: effect.chooseOptions, targetZone }, selectedCard: null });
          return;
        }
      }
    }
    const stateWithHint = targetZone ? { ...gameState, _spellTargetZone: targetZone } : gameState;
    set({ gameState: castSpell(stateWithHint, instanceId), selectedCard: null });
  },

  resolveChooseEffect: (instanceId, chosenEffect, targetZone=null) => {
    if (!chosenEffect) { set({ pendingChooseEffect: null }); return; } // 취소
    const { gameState } = get();
    if (!gameState) return;
    const stateWithChoice = {
      ...(targetZone ? { ...gameState, _spellTargetZone: targetZone } : gameState),
      _chosenEffect: chosenEffect,
    };
    set({ gameState: castSpell(stateWithChoice, instanceId), pendingChooseEffect: null, selectedCard: null });
  },

  playSetSpell: (instanceId) => {
    const { gameState } = get();
    if (!gameState) return;
    set({ gameState: setSpell(gameState, instanceId), selectedCard: null, setMode: false });
  },

  // AI 공격 중 카운터 스펠
  playCounterDuringAI: (instanceId) => {
    const { gameState } = get();
    if (!gameState) return;
    const s = counterCastSpell(gameState, instanceId);
    set({ gameState: s, counterWindow: null, selectedCard: null });
    // AI Promise 즉시 해제 - 수정된 state 전달
    if (_counterResolve) {
      const r = _counterResolve;
      _counterResolve = null;
      r(s);
    }
  },

  passCounter: () => {
    set({ counterWindow: null });
    if (_counterResolve) {
      const r = _counterResolve;
      _counterResolve = null;
      r(null);
    }
  },

  playDoubleAttack: (zone) => {
    const { gameState } = get();
    if (!gameState) return;
    set({ gameState: resolveDoubleAttack(gameState, zone) });
  },

  playMoveMonster: (fromZone, toZone) => {
    const { gameState } = get();
    if (!gameState) return;
    set({ gameState: moveMonster(gameState, fromZone, toZone) });
  },

  playActEffect: (zone) => {
    const { gameState } = get();
    if (!gameState) return;
    // 다중 효과 선택 팝업 표시
    const ap = gameState.activePlayer;
    const card = zone === 'item' ? gameState[ap].item : gameState[ap].field[zone];
    if (card) {
      const text = card.text || '';
      const actMatches = [...text.matchAll(/(?:When you take damage[^\n]*(?:\n[^\n[]+)*|(?:\[Counter\]\s*)?\[(?:Act|Overturn)\][^\n]*(?:\n[^\n[]+)*)/gi)];
      const validEffects = actMatches.filter(m => m[0].trim().length > 10);
      if (validEffects.length >= 2) {
        set({ pendingActChoice: { zone, effects: validEffects.map((m, i) => ({ label: m[0].trim().slice(0,80), idx: i })) } });
        return;
      }
    }
    set({ gameState: _enginePlayAct(gameState, zone) });
  },
  resolveActChoice: (zone) => {
    const { gameState } = get();
    if (!gameState) return;
    const ns = _enginePlayAct(gameState, zone);
    set({ gameState: ns, pendingActChoice: null });
  },
  clearActChoice: () => set({ pendingActChoice: null }),
  resolveChooseEnter: (chosenEffect) => {
    const { gameState } = get();
    if (!gameState?._pendingChooseEnter) return;
    const { card } = gameState._pendingChooseEnter;
    const ap = gameState.activePlayer;
    const stateWithChoice = {
      ...gameState,
      _chosenEnterEffect: chosenEffect || undefined,
      _pendingChooseEnter: undefined,
    };
    const ns = applyEnterEffect(stateWithChoice, card, ap);
    set({ gameState: ns });
  },

  playHandActEffect: (instanceId) => {
    const { gameState } = get();
    if (!gameState) return;
    set({ gameState: _enginePlayHandAct(gameState, instanceId), selectedCard: null });
  },

  setAIDifficulty: (d) => {
    setAIDifficulty(d);
    set({ aiDifficulty: d });
  },

  setLang: (lang) => {
    localStorage.setItem('bf_language', lang);
    set({ lang });
  },
  saveGameState: () => {
    const { gameState } = get();
    if (!gameState || gameState.winner) {
      try { localStorage.removeItem('bf_saved_game'); } catch {}
      return;
    }
    try {
      localStorage.setItem('bf_saved_game', JSON.stringify({ ...gameState, _savedAt: Date.now() }));
    } catch(e) {}
  },
  loadSavedGame: () => {
    try {
      const raw = localStorage.getItem('bf_saved_game');
      if (!raw) return false;
      const gs = JSON.parse(raw);
      if (!gs || Date.now() - (gs._savedAt||0) > 3600000) {
        localStorage.removeItem('bf_saved_game'); return false;
      }
      set({ gameState: gs, gameMode: 'game', selectedCard: null,
            chargeStep: null, linkMode: false, setMode: false, isAIThinking: false,
            counterWindow: null, pendingActChoice: null });
      return true;
    } catch { return false; }
  },

  goToMenu: () => {
    // 게임 종료 시 통계 기록 (get() 사용 - self-reference 방지)
    const gs = get().gameState;
    if (gs?.winner) {
      try {
        const pFlag = gs.player?.flag;
        const pDeck = gs.player?.deckName || (pFlag ? `${pFlag.name} 덱` : '커스텀 덱');
        recordGame({
          result: gs.winner === 'player' ? 'win' : 'loss',
          deckName: pDeck,
          flagName: pFlag?.name || '',
          turns: gs.turn || 0,
          opponentDeck: gs.ai?.flag?.name ? `${gs.ai.flag.name} 덱` : 'AI 덱',
        });
      } catch(e) { console.warn('통계 기록 실패:', e); }
    }
    set({ gameState: null, gameMode: 'menu', selectedCard: null,
      chargeStep: null, linkMode: false, setMode: false, isAIThinking: false,
    });
  },
  goToDeckBuilder: () => set({ gameMode: 'deckbuilder' }),
  setGameMode: (mode) => set({ gameMode: mode }),
}));

export default useGameStore;
