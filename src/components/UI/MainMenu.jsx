import React, { useState, useEffect } from 'react';
import { t as i18nT, getCardText } from '../../i18n/useI18n.js';
import StatsModal from './StatsModal.jsx';
import { recordGame } from '../../utils/gameStats.js';
import useGameStore from '../../store/gameStore.js';
import { bgmToggle, bgmNext, bgmSubscribe, bgmSetPlaylist, BGM_TRACKS } from '../../hooks/useBGM.js';
import allCards from '../../data/cards.json';
import prebuiltDecks from '../../data/prebuilt_decks.json';
import { CARD_TYPE } from '../../utils/constants.js';

const cardMap = Object.fromEntries(allCards.map(c => [c.id, c]));

// 월드 이름 매핑
const WORLD_NAMES = {
  1: 'Ancient World', 2: 'Danger World', 3: 'Magic World', 4: 'Dungeon World',
  5: 'Hero World', 6: 'Dragon World', 7: 'Katana World', 8: 'Generic',
  9: 'Legend World', 10: 'Star Dragon World', 11: 'Darkness Dragon World',
};

function buildDeckFromPrebuilt(deckData) {
  const cards = [];
  for (const entry of deckData.cards) {
    const card = cardMap[entry.id];
    if (card && card.type !== 5) {
      for (let i = 0; i < Math.min(entry.count, 4); i++) {
        cards.push(card);
      }
    }
  }
  return cards;
}

export default function MainMenu() {
  const { startGame, goToDeckBuilder, aiDifficulty, setAIDifficulty, lang, setLang } = useGameStore();
  const [selectedDeck, setSelectedDeck] = useState('S-SD01 Dradeity');
  const [aiDeck, setAiDeck] = useState('S-SD02 Triangulum Galaxy');

  const deckNames = Object.keys(prebuiltDecks);

  const handleStart = () => {
    const playerDeckData = prebuiltDecks[selectedDeck];
    const aiDeckData = prebuiltDecks[aiDeck];

    if (!playerDeckData || !aiDeckData) { alert('덱을 선택해주세요'); return; }

    const playerCards = buildDeckFromPrebuilt(playerDeckData);
    const aiCards = buildDeckFromPrebuilt(aiDeckData);
    const playerFlag = cardMap[playerDeckData.flagId];
    const playerBuddy = cardMap[playerDeckData.buddyId];
    const aiFlag = cardMap[aiDeckData.flagId];
    const aiBuddy = cardMap[aiDeckData.buddyId];

    startGame(playerCards, playerFlag, playerBuddy, aiCards, aiFlag, aiBuddy);
  };

  const [bgmState, setBgmState] = useState({playing:false,title:'',playlist:[]});
  const [showBgmSelect, setShowBgmSelect] = useState(false);
  useEffect(() => {
    const unsub = bgmSubscribe(s => setBgmState(s));
    return unsub;
  }, []);
  const [showStats, setShowStats] = useState(false);
  const t = (ko, en) => lang === 'ko' ? ko : en;

  return (
    <div style={{
      minHeight: '100vh', position:'relative',
      background: 'linear-gradient(135deg,#0d0d1a 0%,#1a0533 50%,#0d0d1a 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', color: '#eee', fontFamily: 'Arial, sans-serif', gap: 20, padding: 20,
    }}>
      {/* 타이틀 */}
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontSize: 52, fontWeight: 'bold',
          background: 'linear-gradient(135deg, #fd79a8, #e17055, #fdcb6e)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>🐉 BUDDYFIGHT</div>
        <div style={{ color: '#a29bfe', fontSize: 18, letterSpacing: 4 }}>ONLINE</div>
      </div>

      {/* 덱 선택 */}
      <div style={{
        background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '16px 24px',
        border: '1px solid #333', width: '100%', maxWidth: 480,
      }}>
        <div style={{ fontSize: 14, color: '#74b9ff', marginBottom: 12, fontWeight: 'bold' }}>⚔️ 덱 선택</div>

        {/* 내 덱 */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: '#aaa', marginBottom: 4 }}>내 덱</div>
          <select value={selectedDeck} onChange={e => setSelectedDeck(e.target.value)}
            style={{ width: '100%', background: '#2d3748', color: '#eee', border: '1px solid #555', borderRadius: 6, padding: '8px 10px', fontSize: 13 }}>
            {deckNames.map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          {prebuiltDecks[selectedDeck] && (
            <div style={{ fontSize: 11, color: '#636e72', marginTop: 4 }}>
              플래그: {prebuiltDecks[selectedDeck].flagName} | 버디: {prebuiltDecks[selectedDeck].buddyName} | {prebuiltDecks[selectedDeck].totalCards}장
            </div>
          )}
        </div>

        {/* AI 덱 */}
        <div>
          <div style={{ fontSize: 12, color: '#aaa', marginBottom: 4 }}>AI 덱</div>
          <select value={aiDeck} onChange={e => setAiDeck(e.target.value)}
            style={{ width: '100%', background: '#2d3748', color: '#eee', border: '1px solid #555', borderRadius: 6, padding: '8px 10px', fontSize: 13 }}>
            {deckNames.map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 카드 수 정보 */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ color: '#74b9ff', fontSize: 12 }}>전체 카드 데이터</div>
        <div style={{ fontSize: 28, fontWeight: 'bold', color: '#ffd700' }}>{allCards.length.toLocaleString()}장</div>
        <div style={{ color: '#aaa', fontSize: 11 }}>모든 월드 포함</div>
      </div>

      {/* 난이도 선택 */}
      <div style={{width:'100%',maxWidth:320,marginBottom:8}}>
        <div style={{fontSize:12,color:'#aaa',marginBottom:8,textAlign:'center'}}>AI 난이도</div>
        <div style={{display:'flex',gap:6,justifyContent:'center'}}>
          {[{id:'easy',label:'😊 Easy',color:'#00b894'},{id:'normal',label:'⚔️ Normal',color:'#0984e3'},{id:'hard',label:'🔥 Hard',color:'#e17055'},{id:'disaster',label:'💀 Disaster',color:'#6c5ce7'}].map(d=>(
            <button key={d.id} onClick={()=>setAIDifficulty(d.id)} style={{
              background:aiDifficulty===d.id?d.color:'rgba(255,255,255,0.05)',
              color:aiDifficulty===d.id?'#fff':'#888',
              border:`1px solid ${aiDifficulty===d.id?d.color:'#444'}`,
              borderRadius:8,padding:'7px 10px',cursor:'pointer',fontSize:12,
              fontWeight:aiDifficulty===d.id?'bold':'normal',transition:'all 0.2s',
            }}>{d.label}</button>
          ))}
        </div>
      </div>

      {/* 버튼 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 320 }}>
        <button onClick={handleStart} style={{
          background: 'linear-gradient(135deg, #e17055, #d63031)',
          color: '#fff', border: 'none', borderRadius: 10,
          padding: '14px', fontSize: 18, fontWeight: 'bold',
          cursor: 'pointer', boxShadow: '0 4px 20px rgba(225,112,85,0.4)',
        }}>⚔️ 게임 시작</button>

        <button onClick={goToDeckBuilder} style={{
          background: 'linear-gradient(135deg, #0984e3, #6c5ce7)',
          color: '#fff', border: 'none', borderRadius: 10,
          padding: '14px', fontSize: 16, cursor: 'pointer',
        }}>🃏 덱 빌더</button>

           <button onClick={() => setShowStats(true)} style={{
          background: 'linear-gradient(135deg,rgba(116,185,255,0.2),rgba(108,92,231,0.2))',
          color: '#74b9ff', border: '1px solid rgba(116,185,255,0.4)',
          borderRadius: 10, padding: '14px', fontSize: 16, cursor: 'pointer', fontWeight:'bold',
        }}>📊 {t('게임 기록 & 통계','Records & Stats')}</button>
      </div>

      <div style={{ color: '#555', fontSize: 11 }}>MVP v0.3 · 프리빌트 덱 {deckNames.length}개</div>
      {showStats && <StatsModal onClose={() => setShowStats(false)} />}
      {/* BGM 플레이리스트 선택 팝업 */}
      {showBgmSelect && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200}} onClick={()=>setShowBgmSelect(false)}>
          <div style={{background:'#1a1a2e',borderRadius:14,border:'1px solid rgba(255,215,0,0.3)',padding:'20px 24px',minWidth:320}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:14,fontWeight:'bold',color:'#ffd700',marginBottom:12}}>🎵 {t('재생 목록 선택','Select Playlist')}</div>
            <div style={{fontSize:11,color:'#aaa',marginBottom:10}}>{t('선택한 곡만 반복 재생됩니다','Selected tracks will loop')}</div>
            <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:14}}>
              {BGM_TRACKS.map((track,i)=>{
                const isSelected = bgmState.playlist?.includes(i) ?? true;
                return(
                  <div key={i} onClick={()=>{
                    const cur = bgmState.playlist || BGM_TRACKS.map((_,j)=>j);
                    const next = cur.includes(i) ? cur.filter(x=>x!==i) : [...cur,i].sort((a,b)=>a-b);
                    bgmSetPlaylist(next.length === BGM_TRACKS.length ? [] : next);
                  }} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',borderRadius:8,cursor:'pointer',background:isSelected?'rgba(255,215,0,0.1)':'rgba(255,255,255,0.03)',border:`1px solid ${isSelected?'rgba(255,215,0,0.4)':'rgba(255,255,255,0.1)'}`}}>
                    <div style={{width:16,height:16,borderRadius:3,background:isSelected?'#ffd700':'transparent',border:`2px solid ${isSelected?'#ffd700':'#666'}`,display:'flex',alignItems:'center',justifyContent:'center'}}>
                      {isSelected&&<span style={{fontSize:10,color:'#000',fontWeight:'bold'}}>✓</span>}
                    </div>
                    <div style={{fontSize:12,color:isSelected?'#ffd700':'#aaa'}}>{i===bgmState.idx?'▶ ':''}{track.title}</div>
                  </div>
                );
              })}
            </div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>{bgmSetPlaylist([]);}} style={{flex:1,background:'rgba(255,255,255,0.07)',color:'#aaa',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,padding:'7px',cursor:'pointer',fontSize:12}}>{t('전체 선택','All')}</button>
              <button onClick={()=>setShowBgmSelect(false)} style={{flex:1,background:'#6c5ce7',color:'#fff',border:'none',borderRadius:8,padding:'7px',cursor:'pointer',fontSize:12,fontWeight:'bold'}}>{t('완료','Done')}</button>
            </div>
          </div>
        </div>
      )}

      {/* BGM 컨트롤 + 언어 선택 */}
      <div style={{position:'fixed',top:12,right:16,display:'flex',gap:6,zIndex:100,alignItems:'center'}}>
        <button onClick={()=>setLang(lang==='ko'?'en':'ko')}
          style={{background:'rgba(255,255,255,0.1)',color:'#e8e0d0',border:'1px solid rgba(255,255,255,0.2)',borderRadius:20,padding:'6px 12px',cursor:'pointer',fontSize:12,fontWeight:'bold'}}>
          {lang==='ko'?'🇰🇷 KO':'🇺🇸 EN'}
        </button>
        <button onClick={bgmToggle} title={bgmState.title} style={{background:bgmState.playing?'rgba(255,215,0,0.15)':'rgba(255,255,255,0.08)',color:bgmState.playing?'#ffd700':'#888',border:`1px solid ${bgmState.playing?'rgba(255,215,0,0.4)':'rgba(255,255,255,0.15)'}`,borderRadius:20,padding:'6px 12px',cursor:'pointer',fontSize:14}}>{bgmState.playing?'🎵':'🔇'}</button>
        <button onClick={()=>setShowBgmSelect(true)} title={t('재생목록','Playlist')} style={{background:'rgba(255,255,255,0.08)',color:'#888',border:'1px solid rgba(255,255,255,0.15)',borderRadius:20,padding:'6px 10px',cursor:'pointer',fontSize:12}}>☰</button>
        <button onClick={bgmNext} title={t('다음 곡','Next')} style={{background:'rgba(255,255,255,0.08)',color:'#888',border:'1px solid rgba(255,255,255,0.15)',borderRadius:20,padding:'6px 12px',cursor:'pointer',fontSize:14}}>⏭</button>
      </div>
    </div>
  );
}
