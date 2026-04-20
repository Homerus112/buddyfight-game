import { useEffect } from 'react';
import { Analytics } from '@vercel/analytics/react';
import useGameStore from './store/gameStore.js';
import MainMenu from './components/UI/MainMenu.jsx';
import GameBoard from './components/GameBoard/GameBoard.jsx';
import DeckBuilder from './components/DeckBuilder/DeckBuilder.jsx';
import { bgmAutoStart } from './hooks/useBGM.js';

export default function App() {
  const { gameMode } = useGameStore();
  useEffect(() => {
    // 첫 클릭 시 BGM 시작 (브라우저 autoplay 정책)
    const handler = () => { bgmAutoStart(); document.removeEventListener('click', handler); };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);
  return (
    <div style={{ margin: 0, padding: 0 }}>
      {gameMode === 'menu' && <MainMenu />}
      {gameMode === 'game' && <GameBoard />}
      {gameMode === 'deckbuilder' && <DeckBuilder />}
      <Analytics />
    </div>
  );
}
