import { useState, useMemo, useEffect } from 'react';
import { bgmToggle, bgmNext, bgmSubscribe } from '../../hooks/useBGM.js';
import { t as i18nT } from '../../i18n/useI18n.js';
import useGameStore from '../../store/gameStore.js';
import { getCardsCache, getDecksCache } from '../../store/cardCache.js';

import Card from '../Card/Card.jsx';
import { CARD_TYPE, CARD_TYPE_NAME } from '../../utils/constants.js';

const WORLD_NAMES = {1:'Katana',2:'Danger',3:'Magic',4:'Dungeon',5:'Legend',6:'Dragon',7:'Ancient',8:'Generic',9:'Darkness Dragon',10:'Hero',11:'Star Dragon'};
const cardMap = Object.fromEntries(allCards.map(c=>[c.id,c]));
const flagCards = allCards.filter(c=>c.type===CARD_TYPE.FLAG);

// localStorage에 덱 저장/불러오기
const SAVE_KEY = 'bf_saved_decks';
function loadSavedDecks() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'); } catch { return {}; }
}
function saveDeckToStorage(name, deckData) {
  const all = loadSavedDecks();
  all[name] = deckData;
  localStorage.setItem(SAVE_KEY, JSON.stringify(all));
}
function deleteDeckFromStorage(name) {
  const all = loadSavedDecks();
  delete all[name];
  localStorage.setItem(SAVE_KEY, JSON.stringify(all));
}

export default function DeckBuilder() {
  const { goToMenu, startGame, setGameMode, aiDifficulty, setAIDifficulty, lang } = useGameStore();
  const T = (ko, en) => (lang||'ko') === 'ko' ? ko : (en||ko);
  const [search, setSearch] = useState('');
  const [filterWorld, setFilterWorld] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterTribe, setFilterTribe] = useState('');
  const [filterKeyword, setFilterKeyword] = useState('');
  const [tab, setTab] = useState('deck');
  const [deck, setDeck] = useState([]);
  const [selectedFlag, setSelectedFlag] = useState(null);
  const [selectedBuddy, setSelectedBuddy] = useState(null);
  const [deckName, setDeckName] = useState('내 덱');
  const [savedDecks, setSavedDecks] = useState(loadSavedDecks);
  const [saveMsg, setSaveMsg] = useState('');
    const [selectedSleeve, setSelectedSleeve] = useState(0); // 0 또는 1
  const [sortBy, setSortBy] = useState('name');

  const worlds = [...new Set(allCards.map(c=>c.world).filter(Boolean))].sort((a,b)=>a-b);
  const deckCount = deck.reduce((s,e)=>s+e.count,0);

  const filtered = useMemo(()=>{
    let base = tab==='flag' ? flagCards
             : tab==='buddy' ? allCards.filter(c=>c.type===CARD_TYPE.MONSTER)
             : allCards.filter(c=>c.type!==CARD_TYPE.FLAG);
    let result = base.filter(c=>{
      if(filterWorld&&c.world!==parseInt(filterWorld)) return false;
      if(filterType&&c.type!==parseInt(filterType)) return false;
      if(search&&!c.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
    // 정렬
    const sortFns = {
      'name':   (a,b)=>(a.name||'').localeCompare(b.name||''),
      'power_desc':  (a,b)=>(b.power??0)-(a.power??0),
      'power_asc':   (a,b)=>(a.power??0)-(b.power??0),
      'defense_desc':(a,b)=>(b.defense??0)-(a.defense??0),
      'defense_asc': (a,b)=>(a.defense??0)-(b.defense??0),
      'critical_desc':(a,b)=>(b.critical??0)-(a.critical??0),
      'critical_asc': (a,b)=>(a.critical??0)-(b.critical??0),
      'size_desc':   (a,b)=>(b.size??0)-(a.size??0),
      'size_asc':    (a,b)=>(a.size??0)-(b.size??0),
    };
    if(sortFns[sortBy]) result = [...result].sort(sortFns[sortBy]);
    return result.slice(0,120);
  },[search,filterWorld,filterType,tab,sortBy]);

  const addCard = (card) => {
    if(tab==='flag'){setSelectedFlag(card);return;}
    if(tab==='buddy'){setSelectedBuddy(card);return;}
    if(deckCount>=52) return;
    // ── 월드 검증 ──
    if(selectedFlag && card.world) {
      const flagWorld = selectedFlag.world;
      const cardWorld = card.world;
      const isGeneric = cardWorld === 8; // Generic World
      const isOmniLord = (card.text||'').includes('[Omni Lord]');
      const isMultiWorld = cardWorld === 12 || cardWorld === 13 || cardWorld === 14 || cardWorld === 15;
      if(!isGeneric && !isOmniLord && !isMultiWorld && cardWorld !== flagWorld) {
        setSaveMsg(`❌ ${card.name}: 플래그 월드(${WORLD_NAMES[flagWorld]})와 불일치`);
        setTimeout(()=>setSaveMsg(''),2500);
        return;
      }
    }
    const max = card.id===selectedBuddy?.id ? 5 : 4;
    setDeck(prev=>{
      const ex=prev.find(e=>e.id===card.id);
      if(ex){if(ex.count>=max)return prev; return prev.map(e=>e.id===card.id?{...e,count:e.count+1}:e);}
      return [...prev,{id:card.id,count:1}];
    });
  };

  const removeCard = (id) => {
    setDeck(prev=>{
      const e=prev.find(x=>x.id===id);
      if(!e) return prev;
      if(e.count<=1) return prev.filter(x=>x.id!==id);
      return prev.map(x=>x.id===id?{...x,count:x.count-1}:x);
    });
  };

  const handleSave = () => {
    if(!selectedFlag){setSaveMsg('⚠️ 플래그 카드를 선택하세요');return;}
    if(deckCount<52){setSaveMsg(`⚠️ 덱이 ${deckCount}/52장입니다`);return;}
    // 월드 불일치 카드 최종 검증
    const flagWorld = selectedFlag.world;
    const wrongWorld = deck.filter(entry=>{
      const c = allCards.find(x=>x.id===entry.id);
      if(!c||!c.world) return false;
      return c.world!==8 && c.world!==flagWorld && !(c.text||'').includes('[Omni Lord]');
    });
    if(wrongWorld.length>0){
      const names = wrongWorld.slice(0,3).map(e=>allCards.find(x=>x.id===e.id)?.name).join(', ');
      setSaveMsg(`❌ 월드 불일치 카드: ${names}${wrongWorld.length>3?` 외 ${wrongWorld.length-3}장`:''}`);
      return;
    }
    const data = { flagId:selectedFlag.id, buddyId:selectedBuddy?.id||null, cards:deck };
    saveDeckToStorage(deckName, data);
    setSavedDecks(loadSavedDecks());
    setSaveMsg(`✅ "${deckName}" 저장 완료!`);
    setTimeout(()=>setSaveMsg(''),2500);
  };

  const handleLoadDeck = (name) => {
    const data = savedDecks[name];
    if(!data) return;
    setSelectedFlag(cardMap[data.flagId]||null);
    setSelectedBuddy(data.buddyId?cardMap[data.buddyId]:null);
    setDeck(data.cards||[]);
    setDeckName(name);
  };

  const handleDeleteDeck = (name) => {
    deleteDeckFromStorage(name);
    setSavedDecks(loadSavedDecks());
  };

  const handleStartGame = () => {
    if(!selectedFlag){setSaveMsg('⚠️ 플래그 카드를 선택하세요');return;}
    if(deckCount<1){setSaveMsg('⚠️ 덱에 카드를 추가하세요');return;}
    // 플레이어 덱 구성
    const deckCards = [];
    for(const entry of deck){
      const c=cardMap[entry.id];
      if(c) for(let i=0;i<entry.count;i++) deckCards.push(c);
    }
    // AI: 플레이어와 같은 월드/비슷한 덱 선택 (없으면 랜덤)
    const deckNames = Object.keys(prebuiltDecks);
    const playerWorld = selectedFlag?.world;
    const sameWorldDecks = deckNames.filter(dn => {
      const d = prebuiltDecks[dn];
      const flag = cardMap[d.flagId];
      return flag && flag.world === playerWorld;
    });
    const aiPool = sameWorldDecks.length > 0 ? sameWorldDecks : deckNames;
    const aiDeckName = aiPool[Math.floor(Math.random() * aiPool.length)];
    const aiData = prebuiltDecks[aiDeckName];
    const aiDeckCards = [];
    for(const entry of aiData.cards){
      const c=cardMap[entry.id];
      if(c && c.type!==5) for(let i=0;i<Math.min(entry.count,4);i++) aiDeckCards.push(c);
    }
    const aiFlag = cardMap[aiData.flagId];
    const aiBuddy = aiData.buddyId ? cardMap[aiData.buddyId] : null;
    setSaveMsg(`AI 덱: ${aiDeckName}`);
    setTimeout(()=>setSaveMsg(''),2000);
    startGame(deckCards, selectedFlag, selectedBuddy||null, aiDeckCards, aiFlag, aiBuddy, selectedSleeve, Math.floor(Math.random()*2));
  };

  const [bgmState, setBgmState] = useState({playing:false,title:''});
  useEffect(() => { const u = bgmSubscribe(s=>setBgmState(s)); return u; }, []);

  const tabStyle = t => ({padding:'6px 14px',border:'none',borderRadius:6,cursor:'pointer',fontSize:12,background:tab===t?'#0984e3':'#2d3748',color:tab===t?'#fff':'#aaa'});

  return (
    <div style={{minHeight:'100vh',background:'#0d0d1a',color:'#eee',fontFamily:'Arial',display:'flex',flexDirection:'column'}}>
      {/* 헤더 */}
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderBottom:'1px solid #333',background:'#111',flexWrap:'wrap'}}>
        <button onClick={goToMenu} style={{background:'#333',color:'#aaa',border:'none',borderRadius:6,padding:'6px 12px',cursor:'pointer'}}>← 메뉴</button>
        <span style={{fontWeight:'bold',fontSize:15}}>🃏 덱 빌더</span>
        <input value={deckName} onChange={e=>setDeckName(e.target.value)}
          style={{background:'#2d3748',color:'#eee',border:'1px solid #555',borderRadius:6,padding:'5px 10px',fontSize:13,width:140}}/>
        <span style={{color:deckCount>=52?'#ffd700':'#aaa',fontSize:12}}>{deckCount}/52장</span>
        {selectedFlag&&<span style={{fontSize:11,color:'#74b9ff'}}>🚩{selectedFlag.name}</span>}
        {selectedBuddy&&<span style={{fontSize:11,color:'#fdcb6e'}}>👤{selectedBuddy.name}</span>}
        <div style={{display:'flex',gap:6}}>
          <button style={tabStyle('flag')} onClick={()=>setTab('flag')}>🚩 플래그</button>
          <button style={tabStyle('buddy')} onClick={()=>setTab('buddy')}>👤 버디</button>
          <button style={tabStyle('deck')} onClick={()=>setTab('deck')}>🃏 덱</button>
        </div>
        <div style={{display:'flex',gap:6,marginLeft:'auto'}}>
          <button onClick={handleSave} style={{background:'#00b894',color:'#fff',border:'none',borderRadius:6,padding:'6px 14px',cursor:'pointer',fontSize:12,fontWeight:'bold'}}>💾 {T('저장','Save')}</button>
          <button onClick={() => {
            const exportData = { name: deckName, flagId: selectedFlag?.id, buddyId: selectedBuddy?.id, cards: deck.map(c => c.id) };
            const code = btoa(unescape(encodeURIComponent(JSON.stringify(exportData))));
            navigator.clipboard?.writeText(code).catch(() => {});
            setSaveMsg(T('📋 덱 코드 복사됨!','📋 Code copied!'));
            setTimeout(() => setSaveMsg(''), 2500);
          }} style={{background:'rgba(0,184,148,0.2)',color:'#00b894',border:'1px solid rgba(0,184,148,0.4)',borderRadius:6,padding:'6px 12px',cursor:'pointer',fontSize:11}}>
            {T('📤 내보내기','📤 Export')}
          </button>
          <button onClick={() => {
            const code = prompt(T('덱 코드를 붙여넣으세요:','Paste deck code:'));
            if (!code) return;
            try {
              const data = JSON.parse(decodeURIComponent(escape(atob(code))));
              if (data.name) setDeckName(data.name);
              if (data.flagId) { const f = cardMap[data.flagId]; if (f) setSelectedFlag(f); }
              if (data.buddyId) { const b = cardMap[data.buddyId]; if (b) setSelectedBuddy(b); }
              if (data.cards?.length) {
                const imported = data.cards.map(id => cards.find(c => c.id === id)).filter(Boolean)
                  .map(c => ({ ...c, instanceId: `inst_${c.id}_${Math.random().toString(36).slice(2)}` }));
                setDeck(imported);
                setSaveMsg(T('✅ 덱 가져오기 완료!','✅ Deck imported!'));
                setTimeout(() => setSaveMsg(''), 2500);
              }
            } catch(e) { alert(T('잘못된 덱 코드입니다.','Invalid code.')); }
          }} style={{background:'rgba(116,185,255,0.15)',color:'#74b9ff',border:'1px solid rgba(116,185,255,0.3)',borderRadius:6,padding:'6px 12px',cursor:'pointer',fontSize:11}}>
            {T('📥 가져오기','📥 Import')}
          </button>
          <button onClick={handleStartGame} style={{background:'#e17055',color:'#fff',border:'none',borderRadius:6,padding:'6px 14px',cursor:'pointer',fontSize:12,fontWeight:'bold'}}>▶ 게임 시작</button>
          {/* 난이도 선택 */}
          <div style={{display:'flex',alignItems:'center',gap:4,marginLeft:8}}>
            <span style={{fontSize:11,color:'#aaa'}}>AI:</span>
            {[{id:'easy',label:'😊',color:'#00b894'},{id:'normal',label:'⚔️',color:'#0984e3'},{id:'hard',label:'🔥',color:'#e17055'},{id:'disaster',label:'💀',color:'#6c5ce7'}].map(d=>(
              <button key={d.id} onClick={()=>setAIDifficulty(d.id)} title={d.id} style={{
                background:aiDifficulty===d.id?d.color:'rgba(255,255,255,0.05)',
                border:`1px solid ${aiDifficulty===d.id?d.color:'#444'}`,
                borderRadius:6,padding:'4px 8px',cursor:'pointer',fontSize:13,
                transition:'all 0.15s',
              }}>{d.label}</button>
            ))}
          </div>
          {/* 슬리브 선택 */}
          <div style={{display:'flex',alignItems:'center',gap:6,marginLeft:8}}>
            <span style={{fontSize:11,color:'#aaa'}}>슬리브:</span>
            {[0,1].map(i=>(
              <div key={i} onClick={()=>setSelectedSleeve(i)} style={{
                width:32,height:44,borderRadius:4,overflow:'hidden',cursor:'pointer',
                border:`2px solid ${selectedSleeve===i?'#ffd700':'#444'}`,
                boxShadow:selectedSleeve===i?'0 0 8px #ffd700':'none',
                transition:'all 0.15s',
              }}>
                <img src={`/sleeves-mini/s${i}.png`} alt={`sleeve ${i}`}
                  style={{width:'100%',height:'100%',objectFit:'cover'}}/>
              </div>
            ))}
          </div>
        </div>
      </div>
      {saveMsg&&<div style={{background:'#2d3748',color:'#ffd700',padding:'6px 14px',fontSize:12,textAlign:'center'}}>{saveMsg}</div>}

      <div style={{display:'flex',flex:1,overflow:'hidden'}}>
        {/* 왼쪽: 저장된 덱 목록 */}
        <div style={{width:160,borderRight:'1px solid #333',display:'flex',flexDirection:'column'}}>
          <div style={{padding:'8px 10px',fontSize:11,color:'#aaa',borderBottom:'1px solid #222'}}>저장된 덱</div>
          <div style={{flex:1,overflowY:'auto',padding:6}}>
            {Object.keys(savedDecks).length===0&&<div style={{color:'#555',fontSize:11,padding:4}}>없음</div>}
            {Object.keys(savedDecks).map(name=>(
              <div key={name} style={{marginBottom:4}}>
                <div onClick={()=>handleLoadDeck(name)} style={{cursor:'pointer',padding:'4px 6px',borderRadius:4,background:deckName===name?'#2d3748':'transparent',fontSize:11,color:'#eee',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>{name}</span>
                  <button onClick={e=>{e.stopPropagation();handleDeleteDeck(name);}} style={{background:'none',color:'#e17055',border:'none',cursor:'pointer',fontSize:13,padding:'0 2px',flexShrink:0}}>×</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 중앙: 카드 목록 */}
        <div style={{flex:1,display:'flex',flexDirection:'column',borderRight:'1px solid #333'}}>
          <div style={{padding:'8px 10px',display:'flex',gap:6,flexWrap:'wrap',borderBottom:'1px solid #222'}}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="카드 이름..."
              style={{flex:1,minWidth:120,background:'#2d3748',color:'#eee',border:'1px solid #555',borderRadius:6,padding:'5px 8px',fontSize:12}}/>
            {tab==='deck'&&(
              <>
                <select value={filterWorld} onChange={e=>setFilterWorld(e.target.value)} style={{background:'#2d3748',color:'#eee',border:'1px solid #555',borderRadius:6,padding:'5px 6px',fontSize:12}}>
                  <option value="">전체 월드</option>
                  {worlds.map(w=><option key={w} value={w}>{WORLD_NAMES[w]||`W${w}`}</option>)}
                </select>
                <select value={filterType} onChange={e=>setFilterType(e.target.value)} style={{background:'#2d3748',color:'#eee',border:'1px solid #555',borderRadius:6,padding:'5px 6px',fontSize:12}}>
                  <option value="">전체 타입</option>
                  {[1,2,3,4].map(t=><option key={t} value={t}>{CARD_TYPE_NAME[t]}</option>)}
                </select>
                <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{background:'#2d3748',color:'#eee',border:'1px solid #555',borderRadius:6,padding:'5px 6px',fontSize:12}}>
                  <option value="name">이름순</option>
                  <option value="power_desc">공격력↑</option>
                  <option value="power_asc">공격력↓</option>
                  <option value="defense_desc">방어력↑</option>
                  <option value="defense_asc">방어력↓</option>
                  <option value="critical_desc">크리티컬↑</option>
                  <option value="critical_asc">크리티컬↓</option>
                  <option value="size_desc">사이즈↑</option>
                  <option value="size_asc">사이즈↓</option>
                </select>
              </>
            )}
          </div>
          <div style={{flex:1,overflowY:'auto',padding:8,display:'flex',flexWrap:'wrap',gap:5,alignContent:'flex-start'}}>
            {filtered.map(card=>(
              <div key={card.id} onClick={()=>addCard(card)} style={{cursor:'pointer',position:'relative'}}
                >
                <Card card={card} displayMode="hand"
                  isSelected={(tab==='flag'&&selectedFlag?.id===card.id)||(tab==='buddy'&&selectedBuddy?.id===card.id)}/>
                {tab==='deck'&&deck.find(e=>e.id===card.id)&&(
                  <div style={{position:'absolute',top:2,right:2,background:'#e17055',color:'#fff',borderRadius:'50%',width:16,height:16,fontSize:10,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:'bold'}}>
                    {deck.find(e=>e.id===card.id).count}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 오른쪽: 내 덱 */}
        <div style={{width:200,display:'flex',flexDirection:'column'}}>
          <div style={{padding:'8px 10px',borderBottom:'1px solid #222',fontSize:12,color:'#aaa'}}>덱 목록 ({deckCount}장)</div>
          <div style={{flex:1,overflowY:'auto',padding:6}}>
            {deck.length===0&&<div style={{color:'#555',fontSize:11,padding:8}}>카드를 추가하세요</div>}
            {deck.map(entry=>{
              const c=cardMap[entry.id]; if(!c) return null;
              const isBuddy=selectedBuddy?.id===c.id;
              return (
                <div key={entry.id} style={{display:'flex',alignItems:'center',gap:5,padding:'3px 0',borderBottom:'1px solid #222'}}>
                  <span style={{color:isBuddy?'#fdcb6e':'#ffd700',fontSize:11,minWidth:14}}>{entry.count}</span>
                  <span style={{fontSize:10,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:isBuddy?'#fdcb6e':'#eee'}}>{c.name}</span>
                  <button onClick={()=>removeCard(entry.id)} style={{background:'none',color:'#e17055',border:'none',cursor:'pointer',fontSize:13,padding:'0 2px'}}>−</button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
