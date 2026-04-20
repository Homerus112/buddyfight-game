import { useState } from 'react';
import { getStats, getHistory, getWinRate, getMostUsedDeck, resetStats } from '../../utils/gameStats.js';
import useGameStore from '../../store/gameStore.js';

export default function StatsModal({ onClose }) {
  const lang = useGameStore(st => st.lang) || 'ko';
  const t = (ko, en) => lang === 'ko' ? ko : (en || ko);
  const [tab, setTab] = useState('summary');
  const stats = getStats();
  const history = getHistory();
  const winRate = getWinRate();
  const mostUsed = getMostUsedDeck();

  const tabStyle = (id) => ({
    padding: '6px 16px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12,
    background: tab === id ? '#0984e3' : 'rgba(255,255,255,0.07)',
    color: tab === id ? '#fff' : '#aaa',
  });

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:300}}>
      <div style={{background:'#1a1a2e',borderRadius:16,border:'1px solid rgba(255,255,255,0.1)',padding:'24px',width:500,maxHeight:'80vh',overflow:'hidden',display:'flex',flexDirection:'column'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div style={{fontSize:18,fontWeight:'bold',color:'#ffd700'}}>📊 {t('stats.title')}</div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'#aaa',fontSize:20,cursor:'pointer'}}>✕</button>
        </div>

        <div style={{display:'flex',gap:6,marginBottom:16}}>
          <button style={tabStyle('summary')} onClick={()=>setTab('summary')}>{t('요약','Summary')}</button>
          <button style={tabStyle('decks')} onClick={()=>setTab('decks')}>{t('덱별','By Deck')}</button>
          <button style={tabStyle('history')} onClick={()=>setTab('history')}>{t('기록','History')}</button>
        </div>

        <div style={{flex:1,overflow:'auto'}}>
          {tab === 'summary' && (
            <div>
              {/* 승률 원형 */}
              <div style={{display:'flex',justifyContent:'center',marginBottom:20}}>
                <div style={{
                  width:120,height:120,borderRadius:'50%',
                  background:`conic-gradient(#00b894 ${winRate}%, rgba(255,255,255,0.1) 0)`,
                  display:'flex',alignItems:'center',justifyContent:'center',position:'relative'
                }}>
                  <div style={{width:90,height:90,borderRadius:'50%',background:'#1a1a2e',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
                    <div style={{fontSize:24,fontWeight:'bold',color:'#00b894'}}>{winRate}%</div>
                    <div style={{fontSize:10,color:'#aaa'}}>{t('stats.winRate')}</div>
                  </div>
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:16}}>
                {[
                  {label:t('stats.totalGames'), value:stats.totalGames||0, color:'#74b9ff'},
                  {label:t('stats.wins'), value:stats.wins||0, color:'#00b894'},
                  {label:t('stats.losses'), value:stats.losses||0, color:'#e17055'},
                ].map(({label,value,color})=>(
                  <div key={label} style={{background:'rgba(255,255,255,0.05)',borderRadius:10,padding:'12px',textAlign:'center',border:`1px solid ${color}33`}}>
                    <div style={{fontSize:28,fontWeight:'bold',color}}>{value}</div>
                    <div style={{fontSize:11,color:'#888',marginTop:4}}>{label}</div>
                  </div>
                ))}
              </div>
              {mostUsed && (
                <div style={{background:'rgba(255,215,0,0.08)',borderRadius:10,padding:'12px',border:'1px solid rgba(255,215,0,0.2)'}}>
                  <div style={{fontSize:11,color:'#ffd700',marginBottom:4}}>⭐ {t('stats.mostUsedDeck')}</div>
                  <div style={{fontSize:14,fontWeight:'bold',color:'#fff'}}>{mostUsed[0]}</div>
                  <div style={{fontSize:11,color:'#aaa',marginTop:2}}>{mostUsed[1].wins}승 {mostUsed[1].losses}패 ({mostUsed[1].games}게임)</div>
                </div>
              )}
              <button onClick={()=>{if(confirm('기록을 초기화할까요?')){resetStats();onClose();}}}
                style={{marginTop:16,width:'100%',background:'rgba(231,76,60,0.15)',color:'#e74c3c',border:'1px solid rgba(231,76,60,0.3)',borderRadius:8,padding:'8px',cursor:'pointer',fontSize:12}}>
                🗑️ {t('stats.reset')}
              </button>
            </div>
          )}

          {tab === 'decks' && (
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {Object.keys(stats.deckStats||{}).length === 0
                ? <div style={{color:'#555',textAlign:'center',padding:20}}>{t('stats.noRecord')}</div>
                : Object.entries(stats.deckStats||{}).sort((a,b)=>b[1].games-a[1].games).map(([name, s])=>(
                  <div key={name} style={{background:'rgba(255,255,255,0.05)',borderRadius:8,padding:'10px 14px',border:'1px solid rgba(255,255,255,0.07)'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <div style={{fontSize:13,fontWeight:'bold',color:'#e8e0d0'}}>{name}</div>
                      <div style={{fontSize:11,color:'#aaa'}}>{s.games}게임</div>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginTop:6}}>
                      <div style={{flex:1,height:6,background:'rgba(255,255,255,0.1)',borderRadius:3,overflow:'hidden'}}>
                        <div style={{width:`${s.games?s.wins/s.games*100:0}%`,height:'100%',background:'#00b894',borderRadius:3}}/>
                      </div>
                      <div style={{fontSize:11,color:'#00b894',minWidth:40}}>{s.games?Math.round(s.wins/s.games*100):0}%</div>
                      <div style={{fontSize:11,color:'#888'}}>{s.wins}승 {s.losses}패</div>
                    </div>
                  </div>
                ))
              }
            </div>
          )}

          {tab === 'history' && (
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {history.length === 0
                ? <div style={{color:'#555',textAlign:'center',padding:20}}>{t('stats.noRecord')}</div>
                : history.map((g,i)=>(
                  <div key={i} style={{display:'flex',alignItems:'center',gap:10,background:'rgba(255,255,255,0.03)',borderRadius:8,padding:'8px 12px',border:'1px solid rgba(255,255,255,0.05)'}}>
                    <div style={{fontSize:16}}>{g.result==='win'?'🏆':'💀'}</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12,color:g.result==='win'?'#00b894':'#e17055',fontWeight:'bold'}}>{g.result==='win'?'승리':'패배'}</div>
                      <div style={{fontSize:10,color:'#666'}}>{g.deckName} vs {g.opponentDeck}</div>
                    </div>
                    <div style={{fontSize:10,color:'#555',textAlign:'right'}}>
                      <div>{g.date}</div>
                      <div>{g.turns}턴</div>
                    </div>
                  </div>
                ))
              }
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
