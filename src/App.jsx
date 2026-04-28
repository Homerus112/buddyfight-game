import { useEffect, useState } from 'react';
import useGameStore from './store/gameStore.js';
import MainMenu from './components/UI/MainMenu.jsx';
import GameBoard from './components/GameBoard/GameBoard.jsx';
import DeckBuilder from './components/DeckBuilder/DeckBuilder.jsx';
import { bgmAutoStart } from './hooks/useBGM.js';

import { getCardsCache, setCardsCache, setDecksCache } from './store/cardCache.js';

export default function App() {
  const { gameMode, loadSavedGame } = useGameStore();
  const [dataLoaded, setDataLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  useEffect(() => {
    // BGM 시작
    const handler = () => { bgmAutoStart(); document.removeEventListener('click', handler); };
    document.addEventListener('click', handler);

    // 카드 데이터 fetch (번들 분리로 초기 로딩 속도 향상)
    if (getCardsCache()) { setDataLoaded(true); return; }
    Promise.all([
      fetch('/cards.json').then(r => { if (!r.ok) throw new Error('cards.json 로드 실패'); return r.json(); }),
      fetch('/prebuilt_decks.json').then(r => r.ok ? r.json() : {}).catch(() => ({})),
    ]).then(([cards, decks]) => {
      setCardsCache(cards);
      setDecksCache(decks);
      setDataLoaded(true);
      // 저장된 게임 복원 (카드 데이터 로딩 후)
      setTimeout(() => { try { loadSavedGame?.(); } catch {} }, 100);
    }).catch(err => {
      console.error('카드 데이터 로드 실패:', err);
      setLoadError('카드 데이터를 불러올 수 없습니다. 새로고침 해주세요.');
      setDataLoaded(true);
    });

    return () => document.removeEventListener('click', handler);
  }, []);

  if (!dataLoaded) {
    return (
      <div style={{
        minHeight:'100vh', background:'#0a0a12',
        display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16,
      }}>
        <div style={{fontSize:40}}>⚔️</div>
        <div style={{color:'#ffd700', fontSize:18, fontWeight:'bold'}}>Buddyfight Online</div>
        <div style={{color:'#aaa', fontSize:13}}>카드 데이터 로딩 중... Loading card data...</div>
        {loadError && <div style={{color:'#ff6b6b', fontSize:11}}>오류: {loadError}</div>}
      </div>
    );
  }

  return (
    <div style={{ margin: 0, padding: 0 }}>
      {gameMode === 'menu' && <MainMenu />}
      {gameMode === 'game' && <GameBoard />}
      {gameMode === 'deckbuilder' && <DeckBuilder />}
    </div>
  );
}
