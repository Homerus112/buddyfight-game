import React, { useState, useEffect, useRef } from 'react';
import { bgmToggle, bgmNext, bgmSubscribe } from '../../hooks/useBGM.js';
import { t as i18nT } from '../../i18n/useI18n.js';
import useGameStore from '../../store/gameStore.js';
import Card from '../Card/Card.jsx';
import CardModal from '../UI/CardModal.jsx';
import { TURN_PHASE, TURN_PHASE_NAME, CARD_TYPE, CARD_STATE } from '../../utils/constants.js';

// ── 버디 콜 팝업 ──────────────────────────────────
function BuddyCallPopup({ name }) {
  const [visible, setVisible] = useState(false);
  const [shownFor, setShownFor] = useState(null);
  useEffect(() => {
    if (name && name !== shownFor) {
      setVisible(true); setShownFor(name);
      const t = setTimeout(() => setVisible(false), 3000);
      return () => clearTimeout(t);
    }
    if (!name) setVisible(false);
  }, [name]);
  if (!visible || !name) return null;
  return (
    <div onClick={() => setVisible(false)} style={{
      position:'fixed',top:80,left:'50%',transform:'translateX(-50%)',
      background:'linear-gradient(135deg,#fdcb6e,#e17055)',color:'#fff',
      borderRadius:12,padding:'14px 28px',fontSize:17,fontWeight:'bold',
      zIndex:500,boxShadow:'0 4px 20px rgba(253,203,110,0.5)',textAlign:'center',cursor:'pointer',
    }}>
      🌟 버디 콜! {name}<br/><span style={{fontSize:12,fontWeight:'normal'}}>라이프 +1!</span>
    </div>
  );
}

// ── 소환 코스트 확인 팝업 ────────────────────────────
function CallCostConfirm({ card, zone, player, onConfirm, onCancel }) {
  if (!card) return null;
  const [selectedDrop, setSelectedDrop] = React.useState(null);
  const typeMap = {1:'Monster',2:'Item',3:'Spell',4:'Impact',5:'Flag'};
  const costM = (card.text||'').match(/\[(?:Call Cost|Equip Cost)\]\s*([\s\S]*?)(?=\n\n|\[(?:Soulguard|Counter|Penetrate|Double|Triple|Move|Lifelink)|$)/i);
  const costText = costM ? costM[1].trim() : '없음';
  const needsDrop = /from\s+your\s+drop\s+zone\s+into.*?soul/i.test(costText);
  const needsHandDrop = /drop\s+(?:a|one)\s+(?:card\s+from\s+your\s+hand|hand\s+card)|discard\s+(?:a|one)\s+(?:card|hand)/i.test(costText);
  const dropMonsters = player.drop.filter(c => c.type === 1);
  const handCards = player.hand ? player.hand.filter(c => c.instanceId !== card.instanceId) : [];
  const [selectedHandDrop, setSelectedHandDrop] = React.useState(null);
  const canConfirm = (!needsDrop || selectedDrop) && (!needsHandDrop || selectedHandDrop);
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200}}>
      <div style={{background:'#1a1a2e',borderRadius:12,border:'1px solid #6c5ce7',padding:'18px 22px',maxWidth:400,width:'100%'}}>
        <div style={{fontSize:14,fontWeight:'bold',color:'#a29bfe',marginBottom:10}}>소환 코스트 확인</div>
        <div style={{display:'flex',gap:10,marginBottom:12,alignItems:'flex-start'}}>
          <img src={`/cards/n${card.id}.png`} alt="" style={{width:64,height:90,borderRadius:6,objectFit:'cover'}} onError={e=>{e.target.style.display='none';}}/>
          <div>
            <div style={{fontSize:13,fontWeight:'bold',color:'#ffd700',marginBottom:3}}>{card.name}</div>
            <div style={{fontSize:10,color:'#81ecec',marginBottom:5}}>{typeMap[card.type]} {card.size!=null?`· Size ${card.size}`:''}</div>
            <div style={{fontSize:10,color:'#aaa',background:'rgba(255,255,255,0.05)',borderRadius:6,padding:'5px 7px'}}>
              <span style={{color:'#fdcb6e'}}>코스트: </span>{costText.slice(0,80)}
            </div>
          </div>
        </div>
        {needsHandDrop && (
          <div style={{marginBottom:10}}>
            <div style={{fontSize:11,color:'#fdcb6e',marginBottom:6}}>✋ 손패에서 드롭할 카드 선택:</div>
            {handCards.length === 0
              ? <div style={{fontSize:11,color:'#555'}}>손패 없음</div>
              : <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                  {handCards.map(c=>(
                    <div key={c.instanceId} onClick={()=>setSelectedHandDrop(c)}
                      style={{cursor:'pointer',border:`2px solid ${selectedHandDrop?.instanceId===c.instanceId?'#ffd700':'rgba(255,255,255,0.15)'}`,borderRadius:6,overflow:'hidden',opacity:selectedHandDrop&&selectedHandDrop.instanceId!==c.instanceId?0.4:1}}>
                      <img src={`/cards-mini/n${c.id}.png`} alt={c.name} style={{width:44,height:62,objectFit:'cover',display:'block'}} onError={e=>{e.target.style.display='none';}}/>
                      <div style={{fontSize:7,color:'#aaa',textAlign:'center',padding:'1px 2px',maxWidth:44,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.name}</div>
                    </div>
                  ))}
                </div>
            }
          </div>
        )}
        {needsHandDrop && (
          <div style={{marginBottom:10}}>
            <div style={{fontSize:11,color:'#fdcb6e',marginBottom:6}}>✋ 손패에서 드롭할 카드 선택:</div>
            {handCards.length === 0
              ? <div style={{fontSize:11,color:'#555'}}>손패 없음</div>
              : <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                  {handCards.map(c=>(
                    <div key={c.instanceId} onClick={()=>setSelectedHandDrop(c)}
                      style={{cursor:'pointer',border:`2px solid ${selectedHandDrop?.instanceId===c.instanceId?'#ffd700':'rgba(255,255,255,0.15)'}`,borderRadius:6,overflow:'hidden'}}>
                      <img src={`/cards-mini/n${c.id}.png`} alt={c.name} style={{width:44,height:62,objectFit:'cover',display:'block'}} onError={e=>{e.target.style.display='none';}}/>
                    </div>
                  ))}
                </div>
            }
          </div>
        )}
        {needsDrop && (
          <div style={{marginBottom:10}}>
            <div style={{fontSize:11,color:'#fd79a8',marginBottom:6}}>🗂 드롭존에서 소울용 카드 선택:</div>
            {dropMonsters.length === 0
              ? <div style={{fontSize:11,color:'#555'}}>드롭존에 몬스터 없음</div>
              : <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                  {dropMonsters.map(c=>(
                    <div key={c.instanceId} onClick={()=>setSelectedDrop(c)}
                      style={{cursor:'pointer',border:`2px solid ${selectedDrop?.instanceId===c.instanceId?'#ffd700':'rgba(255,255,255,0.15)'}`,borderRadius:6,overflow:'hidden',opacity:selectedDrop&&selectedDrop.instanceId!==c.instanceId?0.4:1}}>
                      <img src={`/cards-mini/n${c.id}.png`} alt={c.name} style={{width:44,height:62,objectFit:'cover',display:'block'}} onError={e=>{e.target.style.display='none';}}/>
                      <div style={{fontSize:7,color:'#aaa',textAlign:'center',padding:'1px 2px',maxWidth:44,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.name}</div>
                    </div>
                  ))}
                </div>
            }
          </div>
        )}
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>onConfirm(selectedDrop)} disabled={!canConfirm}
            style={{flex:1,background:canConfirm?'#6c5ce7':'#444',color:'#fff',border:'none',borderRadius:8,padding:'9px',cursor:canConfirm?'pointer':'not-allowed',fontSize:13,fontWeight:'bold'}}>✅ 소환</button>
          <button onClick={onCancel} style={{flex:1,background:'#2d3748',color:'#aaa',border:'none',borderRadius:8,padding:'9px',cursor:'pointer',fontSize:12}}>취소</button>
        </div>
      </div>
    </div>
  );
}

// ── 스펠 버프 타겟 선택 팝업 ────────────────────────
function SpellTargetSelect({ info, player, onSelect, onCancel }) {
  if (!info) return null;
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200}}>
      <div style={{background:'#1a1a2e',borderRadius:12,border:'1px solid #ffd700',padding:'20px 24px',maxWidth:380,textAlign:'center'}}>
        <div style={{fontSize:14,fontWeight:'bold',color:'#ffd700',marginBottom:8}}>✨ 버프 대상 선택</div>
        <div style={{fontSize:11,color:'#aaa',marginBottom:14}}>{info.card?.name} 효과를 적용할 몬스터를 선택하세요</div>
        <div style={{display:'flex',gap:10,justifyContent:'center',marginBottom:14}}>
          {info.matchingZones.map(z=>(
            <div key={z} onClick={()=>onSelect(z)}
              style={{cursor:'pointer',border:'2px solid #ffd700',borderRadius:8,overflow:'hidden',padding:4}}>
              <Card card={player.field[z]} displayMode="field"/>
              <div style={{fontSize:9,color:'#ffd700',textAlign:'center',marginTop:2}}>{z}</div>
            </div>
          ))}
        </div>
        <button onClick={onCancel} style={{background:'#2d3748',color:'#aaa',border:'none',borderRadius:8,padding:'8px 20px',cursor:'pointer'}}>취소</button>
      </div>
    </div>
  );
}

// ── 드롭존 뷰어 ─────────────────────────────────────
function DropViewer({ cards, title, onClose, onCardClick }) {
  if (!cards) return null;
  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'#1a1a2e',borderRadius:12,border:'1px solid #555',padding:16,maxWidth:600,width:'90%',maxHeight:'80vh',display:'flex',flexDirection:'column'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <div style={{fontSize:14,fontWeight:'bold',color:'#aaa'}}>🗑️ {title} 드롭존 ({cards.length}장)</div>
          <button onClick={onClose} style={{background:'#444',color:'#eee',border:'none',borderRadius:6,padding:'4px 10px',cursor:'pointer'}}>✕</button>
        </div>
        <div style={{overflowY:'auto',display:'flex',flexWrap:'wrap',gap:6,padding:4}}>
          {cards.length === 0
            ? <div style={{color:'#555',fontSize:12,padding:8}}>드롭존이 비어있습니다</div>
            : [...cards].reverse().map((c,i)=>(
                <div key={i} onDoubleClick={() => onCardClick && onCardClick(c)}
                  style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2,cursor:'pointer',opacity:1}}
                  title={`${c.name} (더블클릭: 상세보기)`}>
                  <img src={`/cards-mini/n${c.id}.png`} alt={c.name}
                    style={{width:54,height:74,borderRadius:5,objectFit:'cover',border:'1px solid #444',transition:'transform 0.15s'}}
                    onMouseEnter={e=>e.target.style.transform='scale(1.1)'}
                    onMouseLeave={e=>e.target.style.transform='scale(1)'}
                    onError={e=>{e.target.style.display='none';}}/>
                  <div style={{fontSize:7,color:'#aaa',textAlign:'center',maxWidth:54,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.name}</div>
                </div>
              ))
          }
        </div>
      </div>
    </div>
  );
}

// ── choose-one 효과 선택 팝업 ───────────────────────
function ChooseEffectPopup({ info, onSelect, onCancel }) {
  if (!info) return null;
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:250}}>
      <div style={{background:'#1a1a2e',borderRadius:12,border:'1px solid #ffd700',padding:'20px 24px',maxWidth:420,width:'90%'}}>
        <div style={{fontSize:14,fontWeight:'bold',color:'#ffd700',marginBottom:12}}>✨ 효과 선택</div>
        <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:14}}>
          {info.options.map((opt,i)=>(
            <button key={i} onClick={()=>onSelect(opt.effect)}
              style={{background:'rgba(255,255,255,0.07)',color:'#eee',border:'1px solid #555',
                      borderRadius:8,padding:'10px 14px',cursor:'pointer',fontSize:12,textAlign:'left',
                      transition:'background 0.15s'}}
              onMouseEnter={e=>e.target.style.background='rgba(255,215,0,0.15)'}
              onMouseLeave={e=>e.target.style.background='rgba(255,255,255,0.07)'}>
              <span style={{color:'#ffd700',marginRight:8}}>{i+1}.</span>{opt.text}
            </button>
          ))}
        </div>
        <button onClick={onCancel} style={{background:'#2d3748',color:'#aaa',border:'none',borderRadius:8,padding:'8px 20px',cursor:'pointer',fontSize:13}}>취소</button>
      </div>
    </div>
  );
}

// ── 스펠 발동 팝업 (3초) ────────────────────────────
function SpellPopup({ spell, onClose }) {
  useEffect(() => {
    if (!spell) return;
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [spell]);
  if (!spell) return null;
  return (
    <div onClick={onClose} style={{
      position:'fixed', top:90, left:'50%', transform:'translateX(-50%)',
      background:'linear-gradient(135deg,#1a1a2e,#2d1b69)',
      border:'1px solid #a29bfe', borderRadius:12,
      padding:'14px 22px', zIndex:300, maxWidth:380, width:'100%',
      boxShadow:'0 4px 20px rgba(108,92,231,0.4)', cursor:'pointer',
      animation:'fadeIn 0.2s ease',
    }}>
      <div style={{display:'flex',gap:12,alignItems:'flex-start'}}>
        {spell.id && (
          <img src={`/cards-mini/n${spell.id}.png`} alt="" style={{width:52,height:72,borderRadius:5,objectFit:'cover',flexShrink:0}} onError={e=>{e.target.style.display='none';}}/>
        )}
        <div>
          <div style={{fontSize:14,fontWeight:'bold',color:'#ffd700',marginBottom:4}}>{spell.name}</div>
          <div style={{fontSize:11,color:'#aaa',lineHeight:1.5}}>{spell.effect}</div>
        </div>
      </div>
      <div style={{fontSize:9,color:'rgba(255,255,255,0.3)',textAlign:'right',marginTop:6}}>클릭으로 닫기</div>
    </div>
  );
}

// ── 선공/후공 팝업 ─────────────────────────────────
function TossPopup({ goFirst, onClose }) {
  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:400}}>
      <div style={{background:'#1a1a2e',borderRadius:16,border:'1px solid #ffd700',padding:'32px 48px',textAlign:'center',maxWidth:320}}>
        <div style={{fontSize:42,marginBottom:10}}>{goFirst==='player'?'⚔️':'🛡️'}</div>
        <div style={{fontSize:24,fontWeight:'bold',color:'#ffd700',marginBottom:8}}>{goFirst==='player'?'선공!':'후공!'}</div>
        <div style={{fontSize:13,color:'#aaa',marginBottom:20,lineHeight:1.6}}>
          {goFirst==='player'
            ? <><div>내가 먼저 시작합니다.</div><div style={{fontSize:11,color:'#666',marginTop:4}}>첫 턴: 드로우 불가 · 소환 1회 · 공격 1회</div></>
            : <><div>AI가 먼저 시작합니다.</div><div style={{fontSize:11,color:'#666',marginTop:4}}>AI 첫 턴 후 내 차례</div></>}
        </div>
        <button onClick={onClose} style={{background:'#ffd700',color:'#000',border:'none',borderRadius:8,padding:'12px 32px',fontSize:16,fontWeight:'bold',cursor:'pointer'}}>시작!</button>
      </div>
    </div>
  );
}

// ── 필드 존 ───────────────────────────────────────
function FieldZone({ card, label, isAttackable, isTargetable, isSelected, isLinkSelected, onClick }) {
  const border = isLinkSelected?'2px solid #a29bfe':isSelected?'2px solid #ffd700':isAttackable?'2px solid #ff6b6b':isTargetable?'2px solid #ff4444':'2px solid #444';
  const glow = isLinkSelected?'0 0 12px #a29bfe':isSelected?'0 0 14px #ffd700':isAttackable?'0 0 10px #ff6b6b':isTargetable?'0 0 10px #ff4444':'none';
  return (
    <div onClick={onClick} style={{width:90,height:126,borderRadius:8,border,boxShadow:glow,display:'flex',alignItems:'center',justifyContent:'center',cursor:onClick?'pointer':'default',background:'rgba(255,255,255,0.04)',transition:'all 0.2s'}}>
      {card?<Card card={card} isRest={card.state===CARD_STATE.REST} displayMode="field"/>:<span style={{color:'#555',fontSize:11}}>{label}</span>}
    </div>
  );
}

// ── 플래그/버디 ────────────────────────────────────
function FlagBuddyArea({ p }) {
  const [showFlag, setShowFlag] = useState(false);
  const [showBuddy, setShowBuddy] = useState(false);
  return (
    <div style={{display:'flex',flexDirection:'column',gap:4,alignItems:'center'}}>
      {showFlag&&p.flag&&<CardModal card={p.flag} onClose={()=>setShowFlag(false)}/>}
      {showBuddy&&p.buddy&&<CardModal card={p.buddy} onClose={()=>setShowBuddy(false)}/>}
      <div style={{fontSize:9,color:'#aaa'}}>플래그</div>
      <div onClick={()=>p.flag&&setShowFlag(true)} style={{width:48,height:68,borderRadius:5,border:'1px solid #ffd70055',background:'#1a1a3e',overflow:'hidden',cursor:p.flag?'pointer':'default',display:'flex',alignItems:'center',justifyContent:'center'}}>
        {p.flag?<img src={`/cards/n${p.flag.id}.png`} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} onError={e=>{e.target.style.display='none';}}/>:<span style={{color:'#555',fontSize:9}}>없음</span>}
      </div>
      <div style={{fontSize:9,color:'#aaa'}}>버디존</div>
      <div onClick={()=>p.buddy&&setShowBuddy(true)} style={{width:48,height:68,borderRadius:5,border:'1px dashed #ffd70044',background:'rgba(255,215,0,0.04)',overflow:'hidden',cursor:p.buddy?'pointer':'default',display:'flex',alignItems:'center',justifyContent:'center'}}>
        {p.buddy?<img src={`/cards-mini/n${p.buddy.id}.png`} alt="" style={{width:'100%',height:'100%',objectFit:'cover',opacity:0.7}} onError={e=>{e.target.style.display='none';}}/>:<span style={{color:'#555',fontSize:9}}>버디존</span>}
      </div>
    </div>
  );
}

// ── 스탯 바 ───────────────────────────────────────
function Stats({ p, label, isActive }) {
  return (
    <div style={{display:'flex',gap:10,alignItems:'center',padding:'5px 12px',background:isActive?'rgba(255,215,0,0.08)':'rgba(255,255,255,0.04)',borderRadius:8,border:`1px solid ${isActive?'#ffd700':'#333'}`,fontSize:12}}>
      <span style={{color:'#aaa'}}>{label}</span>
      <span style={{color:'#ff6b6b'}}>❤️{p.life}</span>
      <span style={{color:'#ffd700'}}>⚡{p.gauge.length}</span>
      <span style={{color:'#74b9ff'}}>📚{p.deck.length}</span>
      <span style={{color:'#a29bfe'}}>🃏{p.hand.length}</span>
      <span style={{color:'#55efc4'}}>🗑️{p.drop.length}</span>
    </div>
  );
}

// ── 사이드 존 (게이지/드롭/덱) ──────────────────────
function SideZone({ p, showDeck=false, label='', onDropClick }) {
  const topDrop = p.drop[p.drop.length - 1];
  return (
    <div style={{display:'flex',flexDirection:'column',gap:7,alignItems:'center'}}>
      {label && <div style={{fontSize:8,color:'rgba(255,255,255,0.35)',letterSpacing:1}}>{label}</div>}
      {/* 게이지 */}
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
        <div style={{fontSize:9,color:'#ffd700',fontWeight:'bold'}}>GAUGE</div>
        <div style={{width:54,height:74,borderRadius:6,background:'linear-gradient(180deg,#2d2b00,#111)',border:'1px solid #ffd700',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',boxShadow:'0 0 6px rgba(255,215,0,0.2)'}}>
          <div style={{fontSize:18,color:'#ffd700'}}>⚡</div>
          <div style={{fontSize:15,fontWeight:'bold',color:'#ffd700'}}>{p.gauge.length}</div>
        </div>
      </div>
      {/* 드롭 - 슬리브 이미지 표시 */}
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
        <div style={{fontSize:9,color:'#aaa',fontWeight:'bold'}}>DROP</div>
        <div onClick={onDropClick} style={{width:54,height:74,borderRadius:6,border:'1px solid #555',background:'#111',overflow:'hidden',display:'flex',alignItems:'center',justifyContent:'center',position:'relative',cursor:p.drop.length>0?'pointer':'default'}}>
          {topDrop
            ? <img src={p.sleeve!=null?`/sleeves-mini/s${p.sleeve}.png`:`/cards-mini/n${topDrop.id}.png`}
                   alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}
                   onError={e=>{e.target.style.display='none';}}/>
            : <span style={{fontSize:9,color:'#555'}}>0</span>}
          {p.drop.length>0&&<div style={{position:'absolute',bottom:2,right:3,fontSize:9,color:'rgba(255,255,255,0.8)',fontWeight:'bold',background:'rgba(0,0,0,0.5)',borderRadius:3,padding:'0 2px'}}>{p.drop.length}</div>}
          {p.drop.length>0&&<div style={{position:'absolute',top:2,left:0,right:0,textAlign:'center',fontSize:8,color:'rgba(255,255,255,0.4)'}}>👁</div>}
        </div>
      </div>
      {/* 덱 - 슬리브 이미지 표시 */}
      {showDeck && (
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
          <div style={{fontSize:9,color:'#74b9ff',fontWeight:'bold'}}>DECK</div>
          <div style={{width:54,height:74,borderRadius:6,overflow:'hidden',border:'1px solid #6c5ce7',position:'relative'}}>
            {p.sleeve!=null
              ? <img src={`/sleeves-mini/s${p.sleeve}.png`} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
              : <div style={{width:'100%',height:'100%',background:'linear-gradient(135deg,#1a1a3e,#2d1b69)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
                  <div style={{fontSize:16,color:'#9d4edd'}}>★</div>
                </div>}
            <div style={{position:'absolute',bottom:2,left:0,right:0,textAlign:'center',fontSize:10,fontWeight:'bold',color:'#fff',background:'rgba(0,0,0,0.55)',padding:'1px 0'}}>{p.deck.length}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 카운터 오버레이 (2.5초 타이머) ──────────────────
function CounterOverlay({ player, info, onUse, onPass, setSpellPopup, onUseFieldAct }) {
  // 손패: [Counter] 스펠 + [Counter][Act] 몬스터
  const spells = player.hand.filter(c => {
    if (c.type===CARD_TYPE.SPELL || c.type===CARD_TYPE.IMPACT) return true;
    if (c.type===CARD_TYPE.MONSTER) {
      const t = c.text || '';
      return t.includes('[Counter]') && t.includes('[Act]')
          && !/during\s+your\s+turn/i.test(t);
    }
    return false;
  });
  // ✅ fix67: 필드/아이템의 [Counter][Act] 몬스터
  const fieldCounterActs = ['left','center','right','item'].map(z => {
    const card = z === 'item' ? player.item : player.field[z];
    if (!card) return null;
    const t = card.text || '';
    if (t.includes('[Counter]') && t.includes('[Act]') && !/during\s+your\s+turn/i.test(t)) {
      return { card, zone: z };
    }
    return null;
  }).filter(Boolean);

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:150}}>
      <div style={{background:'#1a1a2e',borderRadius:12,border:'1px solid #e17055',padding:'18px 22px',maxWidth:480,width:'100%'}}>
        <div style={{marginBottom:6}}>
          <div style={{fontSize:15,fontWeight:'bold',color:'#ff6b6b'}}>⚠️ 카운터 타이밍</div>
        </div>
        <div style={{fontSize:12,color:'#aaa',marginBottom:12}}>
          <span style={{color:'#ffd700'}}>{info.attackerCard?.name}</span> 공격 중
        </div>
        {spells.length>0 && (
          <>
            <div style={{fontSize:10,color:'#81ecec',marginBottom:6}}>🃏 손패 (🔵=[Counter]):</div>
            <div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:10}}>
              {spells.map(c=>(
                <div key={c.instanceId} style={{position:'relative'}}>
                  {(c.text||'').includes('[Counter]')&&<div style={{position:'absolute',top:2,left:2,background:'#0984e3',color:'#fff',fontSize:7,padding:'1px 3px',borderRadius:2,zIndex:1}}>🔵</div>}
                  <div onClick={()=>{ setSpellPopup({ id:c.id, name:c.name, effect:c.text||'' }); onUse(c.instanceId); }} style={{cursor:'pointer',border:'2px solid #e17055',borderRadius:6,overflow:'hidden'}}>
                    <Card card={c} displayMode="hand"/>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {fieldCounterActs.length>0 && (
          <>
            <div style={{fontSize:10,color:'#fdcb6e',marginBottom:6}}>⚡ 필드 [Counter][Act]:</div>
            <div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:10}}>
              {fieldCounterActs.map(({card,zone})=>(
                <div key={card.instanceId} style={{position:'relative'}}>
                  <div style={{position:'absolute',top:2,left:2,background:'#e17055',color:'#fff',fontSize:7,padding:'1px 3px',borderRadius:2,zIndex:1}}>ACT</div>
                  <div onClick={()=>onUseFieldAct && onUseFieldAct(zone)} style={{cursor:'pointer',border:'2px solid #fdcb6e',borderRadius:6,overflow:'hidden'}}>
                    <Card card={card} displayMode="hand"/>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {spells.length===0 && fieldCounterActs.length===0 && (
          <div style={{fontSize:11,color:'#555',marginBottom:12}}>사용 가능한 카운터 효과 없음</div>
        )}
        <button onClick={onPass} style={{width:'100%',background:'#2d3748',color:'#aaa',border:'1px solid #555',borderRadius:8,padding:'9px',fontSize:13,cursor:'pointer'}}>패스 / Pass</button>
      </div>
    </div>
  );
}

// ── 차지 오버레이 ─────────────────────────────────
function ChargeOverlay({ player, onSelect, onSkip }) {
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.82)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:150}}>
      <div style={{background:'#1a1a2e',borderRadius:12,border:'1px solid #0984e3',padding:'20px 24px',maxWidth:520,width:'100%'}}>
        <div style={{fontSize:16,fontWeight:'bold',color:'#ffd700',marginBottom:8}}>③ 차지 &amp; 드로우</div>
        <div style={{fontSize:12,color:'#aaa',marginBottom:14}}>
          게이지로 보낼 카드 선택 후 덱에서 1장 드로우<br/>
          게이지 <span style={{color:'#ffd700'}}>⚡{player.gauge.length}</span> · 덱 <span style={{color:'#74b9ff'}}>📚{player.deck.length}</span>
        </div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:14}}>
          {player.hand.map(c=>(
            <div key={c.instanceId} onClick={()=>onSelect(c.instanceId)} style={{cursor:'pointer',border:'2px solid #0984e3',borderRadius:6,overflow:'hidden'}}>
              <Card card={c} displayMode="hand"/>
            </div>
          ))}
        </div>
        <button onClick={onSkip} style={{background:'#2d3748',color:'#aaa',border:'1px solid #555',borderRadius:8,padding:'8px 20px',fontSize:13,cursor:'pointer'}}>스킵</button>
      </div>
    </div>
  );
}

// ── 링크어택 대상 ─────────────────────────────────
function LinkTargetOverlay({ ai, onSelect, onCancel }) {
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:150}}>
      <div style={{background:'#1a1a2e',borderRadius:12,border:'1px solid #6c5ce7',padding:'20px 24px',maxWidth:400,textAlign:'center'}}>
        <div style={{fontSize:15,fontWeight:'bold',color:'#a29bfe',marginBottom:12}}>🔗 링크어택 대상</div>
        <div style={{display:'flex',gap:8,justifyContent:'center',flexWrap:'wrap',marginBottom:14}}>
          {['left','center','right'].filter(z=>ai.field[z]).map(z=>(
            <div key={z} onClick={()=>onSelect(z)} style={{cursor:'pointer',border:'2px solid #a29bfe',borderRadius:8,overflow:'hidden'}}>
              <Card card={ai.field[z]} displayMode="field"/>
            </div>
          ))}
          <button onClick={()=>onSelect('player')} style={{background:'#e74c3c',color:'#fff',border:'none',borderRadius:8,padding:'12px 20px',cursor:'pointer',fontSize:14,fontWeight:'bold'}}>직접 공격</button>
        </div>
        <button onClick={onCancel} style={{background:'#2d3748',color:'#aaa',border:'none',borderRadius:8,padding:'8px 20px',cursor:'pointer',fontSize:13}}>취소</button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════
export default function GameBoard() {
  const {
    gameState, isAIThinking, selectedCard, chargeStep, counterWindow, linkMode, setMode,
    selectCard, clearSelection, nextPhase, doCharge, skipCharge,
    toggleLinkMode, toggleSetMode, playCallMonster, playEquipItem,
    playDeclareAttack, playCancelAttack, playResolveAttack, executeLinkAttack,
    playDropSpell, playSetSpell, playCounterDuringAI, passCounter,
    playDoubleAttack, playMoveMonster, goToMenu, playActEffect, playHandActEffect,
    pendingChooseEffect, resolveChooseEffect,
    lang, pendingActChoice, resolveActChoice, clearActChoice, resolveChooseEnter,
    saveGameState, // ✅ fix64: saveGameState 구조분해 누락 수정
  } = useGameStore();

  const [logOpen, setLogOpen] = useState(true);
  const [bgmState, setBgmState] = useState({playing:false,title:''});
  const T = (ko, en) => (lang||'ko') === 'ko' ? ko : en;
  useEffect(() => {
    const unsub = bgmSubscribe(s => setBgmState(s));
    return unsub;
  }, []);
  const [showLinkTarget, setShowLinkTarget] = useState(false);
  const [showMoveUI, setShowMoveUI] = useState(false);
  const [tossShown, setTossShown] = useState(false);
  const [spellPopup, setSpellPopup] = useState(null);
  const [cardDetailPopup, setCardDetailPopup] = useState(null);
  const [showRules, setShowRules] = useState(false);
  const [showTutorial, setShowTutorial] = useState(() => {
    try { return !localStorage.getItem('bf_tutorial_shown'); } catch { return true; }
  }); // 카드 상세보기 (드롭/소울)
  const [dropViewer, setDropViewer] = useState(null); // 'player' | 'ai' | null
  const [callCostConfirm, setCallCostConfirm] = useState(null);
  const [spellTargetSelect, setSpellTargetSelect] = useState(null); // { instanceId, targetKw, matchingZones } // { card, zone } 소환 코스트 확인 // { id, name, effect }
  const [moveSelectZone, setMoveSelectZone] = useState(null); // 이동할 카드 존 선택

  if (!gameState) return null;
  const { player, ai, phase, turn, activePlayer, winner, attackingCard, isFirstTurn } = gameState;
  const linkQueue = gameState.linkAttackQueue || [];
  const isMyTurn = activePlayer === 'player';
  const isMain = phase === TURN_PHASE.MAIN && isMyTurn;
  const isAttack = phase === TURN_PHASE.ATTACK && isMyTurn;
  const isFinal = phase === TURN_PHASE.FINAL && isMyTurn;

  const selCard = player.hand.find(c => c.instanceId === selectedCard);
  const selIsMonster = selCard?.type === CARD_TYPE.MONSTER;
  const selIsItem = selCard?.type === CARD_TYPE.ITEM;
  // [Counter] 카드는 모든 페이즈에서 사용 가능
  const _isCounterCard = selCard && /\[Counter\]/i.test(selCard.text || '');
  // Counter 카드는 어느 페이즈, 어느 턴에서나 발동 가능
  const selIsSpell = ((isMain || isFinal) || _isCounterCard) && (selCard?.type === CARD_TYPE.SPELL || selCard?.type === CARD_TYPE.IMPACT);
  const selCanSet = isMain && setMode && (selCard?.type === CARD_TYPE.SPELL || (selCard?.type === CARD_TYPE.IMPACT && (selCard?.text||'').includes('[Set]')));

  // AI 공격 중 카운터 가능한 스펠
  const canCounterNow = isAIThinking && attackingCard === null;
  // (AI declareAttack 후 공격 처리 사이에 attackingCard 잠깐 세팅됨)

  const onHandClick = (card) => {
    // Counter 스펠/임팩트는 어느 페이즈에서나 선택 가능
    const isCounterCard = (card.type === CARD_TYPE.SPELL || card.type === CARD_TYPE.IMPACT)
      && /\[Counter\]/i.test(card.text || '');
    if (!isMain && !isFinal && !isCounterCard) return;
    selectCard(selectedCard === card.instanceId ? null : card.instanceId);
  };
  const onMyZoneClick = (zone) => {
    if (isMain && selIsMonster) {
      // 코스트가 있는 경우 확인 팝업
      const card = player.hand.find(c => c.instanceId === selectedCard);
      const hasCost = card && /\[(?:Call Cost)\]/i.test(card.text || '');
      if (hasCost) { setCallCostConfirm({ card, zone }); return; }
      playCallMonster(selectedCard, zone); return;
    }
    if (isAttack && !attackingCard) {
      if (linkMode) { playDeclareAttack(zone); return; }
      if (player.field[zone]?.state === CARD_STATE.STAND) playDeclareAttack(zone);
    }
  };
  const onMyItemClick = () => {
    if (isMain && selIsItem) { playEquipItem(selectedCard); return; }
    if (isAttack && !attackingCard) {
      if (linkMode) { playDeclareAttack('item'); return; }
      if (player.item?.state === CARD_STATE.STAND) playDeclareAttack('item');
    }
  };
  const onCastSpell = () => {
    if (!selectedCard) return;
    if (selCanSet) { playSetSpell(selectedCard); return; }
    if (selIsSpell) {
      const card = player.hand.find(c => c.instanceId === selectedCard);
      if (card) {
        // battleTarget 있으면 타겟 선택
        const btM = (card.text||'').match(/[Cc]hoose\s+(?:a|an)\s+[«"]([^»"]+)[»"]\s+in\s+battle|give\s+it\s+power\+/i);
        const targetKw = btM ? btM[1]?.toLowerCase() : null;
        if (targetKw) {
          const matching = ['left','center','right'].filter(z => {
            const fc = player.field[z];
            return fc && ((fc.name||'').toLowerCase().includes(targetKw) || (fc.tribe||'').toLowerCase().includes(targetKw));
          });
          if (matching.length > 1) {
            setSpellTargetSelect({ instanceId: selectedCard, card, targetKw, matchingZones: matching });
            return;
          }
        }
        setSpellPopup({ id: card.id, name: card.name, effect: card.text || '' });
      }
      playDropSpell(selectedCard);
    }
  };

  return (
    <div style={{
      width:'100vw', height:'100vh', overflow:'hidden',
      background:'linear-gradient(160deg,#0a0a12 0%,#0d1117 40%,#0a0c10 100%)',
      display:'flex', flexDirection:'column', fontFamily:"'Segoe UI',sans-serif",
      userSelect:'none', color:'#e8e0d0', fontSize:'13px',
    }}>

      {/* ── 오버레이 팝업들 ── */}
      <BuddyCallPopup name={gameState.buddyCallPopup}/>
      {!tossShown && gameState.goFirstPlayer && <TossPopup goFirst={gameState.goFirstPlayer} onClose={()=>setTossShown(true)}/>}
      {chargeStep==='selectCard' && <ChargeOverlay player={player} onSelect={doCharge} onSkip={skipCharge}/>}
      <SpellPopup spell={spellPopup} onClose={()=>setSpellPopup(null)}/>
      {pendingChooseEffect && (
        <ChooseEffectPopup info={pendingChooseEffect} player={player}
          onSelect={(e)=>resolveChooseEffect(pendingChooseEffect.instanceId,e,pendingChooseEffect.targetZone)}
          onCancel={()=>resolveChooseEffect(pendingChooseEffect.instanceId,null)}/>
      )}
      {gameState?._pendingChooseEnter && (
        <ChooseEffectPopup info={gameState._pendingChooseEnter} player={player}
          onSelect={(chosenEffect) => resolveChooseEnter(chosenEffect)}
          onCancel={() => resolveChooseEnter(null)}/>
      )}
      {callCostConfirm && (
        <CallCostConfirm card={callCostConfirm.card} zone={callCostConfirm.zone} player={player}
          onConfirm={()=>{const{card,zone}=callCostConfirm;setCallCostConfirm(null);zone==='item'?playEquipItem(card.instanceId):playCallMonster(card.instanceId,zone);}}
          onCancel={()=>setCallCostConfirm(null)}/>
      )}
      {spellTargetSelect && (
        <SpellTargetSelect info={spellTargetSelect} player={player}
          onSelect={(zone)=>{const{card}=spellTargetSelect;setSpellPopup({id:card.id,name:card.name,effect:card.text||''});setSpellTargetSelect(null);playDropSpell(spellTargetSelect.instanceId,zone);}}
          onCancel={()=>setSpellTargetSelect(null)}/>
      )}
      <DropViewer cards={dropViewer==='player'?player.drop:dropViewer==='ai'?ai.drop:null}
        title={dropViewer==='player'?T('나','Me'):T('AI','AI')} onClose={()=>setDropViewer(null)}
        onCardClick={(c)=>setCardDetailPopup(c)}/>
      {counterWindow && <CounterOverlay
        player={player}
        info={counterWindow}
        onUse={playCounterDuringAI}
        onPass={passCounter}
        setSpellPopup={setSpellPopup}
        onUseFieldAct={(zone) => {
          // ✅ fix67: 필드 [Counter][Act] 몬스터 발동 - playActEffect 호출 후 counterWindow 닫기
          playActEffect(zone);
          passCounter(); // counterWindow 닫기
        }}
      />}
      {showLinkTarget && <LinkTargetOverlay ai={ai} onSelect={z=>{setShowLinkTarget(false);executeLinkAttack(z);}} onCancel={()=>setShowLinkTarget(false)}/>}
      {showMoveUI && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:150}}>
          <div style={{background:'#1a1f2e',borderRadius:12,border:'1px solid #81ecec',padding:'20px 24px',maxWidth:380,textAlign:'center'}}>
            {!moveSelectZone ? (
              <>
                <div style={{fontSize:15,fontWeight:'bold',color:'#81ecec',marginBottom:12}}>🔄 이동할 카드 선택</div>
                <div style={{display:'flex',gap:8,justifyContent:'center',marginBottom:14}}>
                  {['left','center','right'].filter(z=>{const c=player.field[z];if(!c)return false;return(c.text||'').includes('[Move]')||(c.text||'').includes('gets [Move]');}).map(z=>(
                    <div key={z} onClick={()=>setMoveSelectZone(z)} style={{cursor:'pointer',border:'2px solid #81ecec',borderRadius:8,overflow:'hidden'}}>
                      <Card card={player.field[z]} displayMode="field"/>
                      <div style={{fontSize:9,color:'#aaa',textAlign:'center',padding:'2px'}}>{z}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div style={{fontSize:15,fontWeight:'bold',color:'#81ecec',marginBottom:8}}>이동할 위치 선택</div>
                <div style={{display:'flex',gap:8,justifyContent:'center',marginBottom:14}}>
                  {['left','center','right'].filter(z=>z!==moveSelectZone&&!player.field[z]).map(z=>(
                    <button key={z} onClick={()=>{playMoveMonster(moveSelectZone,z);setShowMoveUI(false);setMoveSelectZone(null);}}
                      style={{background:'#81ecec',color:'#000',border:'none',borderRadius:8,padding:'10px 20px',cursor:'pointer',fontSize:14,fontWeight:'bold'}}>{z}</button>
                  ))}
                </div>
                <button onClick={()=>setMoveSelectZone(null)} style={{background:'#2d3748',color:'#aaa',border:'none',borderRadius:8,padding:'6px 14px',cursor:'pointer',fontSize:12}}>← 다시</button>
              </>
            )}
            <br/>
            <button onClick={()=>{setShowMoveUI(false);setMoveSelectZone(null);}} style={{background:'#2d3748',color:'#aaa',border:'none',borderRadius:8,padding:'8px 20px',cursor:'pointer',marginTop:8}}>취소</button>
          </div>
        </div>
      )}
      {/* 카드 상세보기 팝업 (드롭존/소울 클릭) */}
      {cardDetailPopup && (
        <div onClick={() => setCardDetailPopup(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:250}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'#1a1a2e',borderRadius:14,border:'1px solid rgba(255,255,255,0.15)',padding:'20px',maxWidth:420,width:'90%'}}>
            <div style={{display:'flex',gap:14,marginBottom:14,alignItems:'flex-start'}}>
              <img src={`/cards/n${cardDetailPopup.id}.png`} alt="" style={{width:90,height:126,objectFit:'cover',borderRadius:8,border:'1px solid rgba(255,255,255,0.2)'}} onError={e=>{e.target.style.display='none';}}/>
              <div style={{flex:1}}>
                <div style={{fontSize:15,fontWeight:'bold',color:'#ffd700',marginBottom:4}}>{cardDetailPopup.name}</div>
                <div style={{fontSize:11,color:'#81ecec',marginBottom:3}}>{cardDetailPopup.tribe||''}</div>
                <div style={{display:'flex',gap:8,fontSize:11,color:'#aaa',marginBottom:6}}>
                  {cardDetailPopup.power!=null&&<span>⚔️ {cardDetailPopup.power?.toLocaleString()}</span>}
                  {cardDetailPopup.defense!=null&&<span>🛡️ {cardDetailPopup.defense?.toLocaleString()}</span>}
                  {cardDetailPopup.critical!=null&&<span>★{cardDetailPopup.critical}</span>}
                </div>
                <div style={{fontSize:11,color:'#dfe6e9',whiteSpace:'pre-wrap',lineHeight:1.6,maxHeight:160,overflowY:'auto',background:'rgba(255,255,255,0.03)',borderRadius:6,padding:'6px 8px'}}>
                  {(lang==='ko'&&cardDetailPopup.text_ko) ? cardDetailPopup.text_ko : (cardDetailPopup.text||'')}
                </div>
              </div>
            </div>
            <button onClick={() => setCardDetailPopup(null)} style={{width:'100%',background:'rgba(255,255,255,0.07)',color:'#aaa',border:'none',borderRadius:8,padding:'8px',cursor:'pointer',fontSize:12}}>
              {T('닫기','Close')}
            </button>
          </div>
        </div>
      )}
      {/* 다중 Act 효과 선택 팝업 */}
      {pendingActChoice && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:250}}>
          <div style={{background:'#1a1a2e',borderRadius:14,border:'1px solid rgba(255,150,0,0.5)',padding:'20px 24px',maxWidth:420,width:'90%'}}>
            <div style={{fontSize:14,fontWeight:'bold',color:'#f39c12',marginBottom:4}}>✨ {T('효과 선택','Choose Effect')}</div>
            <div style={{fontSize:11,color:'#aaa',marginBottom:14}}>{T('발동할 효과를 선택하세요','Select an effect to activate')}</div>
            <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:14}}>
              {pendingActChoice.effects.map((eff, i) => (
                <button key={i} onClick={() => resolveActChoice(pendingActChoice.zone)}
                  style={{background:'rgba(255,150,0,0.1)',color:'#f39c12',border:'1px solid rgba(255,150,0,0.4)',borderRadius:8,padding:'10px 14px',cursor:'pointer',fontSize:11,textAlign:'left',lineHeight:1.5}}>
                  {eff.label}
                </button>
              ))}
            </div>
            <button onClick={() => clearActChoice()}
              style={{width:'100%',background:'rgba(255,255,255,0.07)',color:'#aaa',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,padding:'8px',cursor:'pointer',fontSize:12}}>
              {T('취소','Cancel')}
            </button>
          </div>
        </div>
      )}
      {/* 카드 상세보기 팝업 (드롭존/소울 클릭) */}
      {cardDetailPopup && (
        <div onClick={() => setCardDetailPopup(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:250}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'#1a1a2e',borderRadius:14,border:'1px solid rgba(255,255,255,0.15)',padding:'20px',maxWidth:420,width:'90%'}}>
            <div style={{display:'flex',gap:14,marginBottom:14,alignItems:'flex-start'}}>
              <img src={`/cards/n${cardDetailPopup.id}.png`} alt="" style={{width:90,height:126,objectFit:'cover',borderRadius:8,border:'1px solid rgba(255,255,255,0.2)'}} onError={e=>{e.target.style.display='none';}}/>
              <div style={{flex:1}}>
                <div style={{fontSize:15,fontWeight:'bold',color:'#ffd700',marginBottom:4}}>{cardDetailPopup.name}</div>
                <div style={{fontSize:11,color:'#81ecec',marginBottom:3}}>{cardDetailPopup.tribe||''}</div>
                <div style={{display:'flex',gap:8,fontSize:11,color:'#aaa',marginBottom:6}}>
                  {cardDetailPopup.power!=null&&<span>⚔️ {cardDetailPopup.power?.toLocaleString()}</span>}
                  {cardDetailPopup.defense!=null&&<span>🛡️ {cardDetailPopup.defense?.toLocaleString()}</span>}
                  {cardDetailPopup.critical!=null&&<span>★{cardDetailPopup.critical}</span>}
                </div>
                <div style={{fontSize:11,color:'#dfe6e9',whiteSpace:'pre-wrap',lineHeight:1.6,maxHeight:160,overflowY:'auto',background:'rgba(255,255,255,0.03)',borderRadius:6,padding:'6px 8px'}}>
                  {(lang==='ko'&&cardDetailPopup.text_ko) ? cardDetailPopup.text_ko : (cardDetailPopup.text||'')}
                </div>
              </div>
            </div>
            <button onClick={() => setCardDetailPopup(null)} style={{width:'100%',background:'rgba(255,255,255,0.07)',color:'#aaa',border:'none',borderRadius:8,padding:'8px',cursor:'pointer',fontSize:12}}>
              {T('닫기','Close')}
            </button>
          </div>
        </div>
      )}
      {/* 다중 Act 효과 선택 팝업 */}
      {pendingActChoice && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:250}}>
          <div style={{background:'#1a1a2e',borderRadius:14,border:'1px solid rgba(255,150,0,0.5)',padding:'20px 24px',maxWidth:420,width:'90%'}}>
            <div style={{fontSize:14,fontWeight:'bold',color:'#f39c12',marginBottom:4}}>✨ {T('효과 선택','Choose Effect')}</div>
            <div style={{fontSize:11,color:'#888',marginBottom:14}}>{T('발동할 효과를 선택하세요','Select an effect to activate')}</div>
            <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:14}}>
              {pendingActChoice.effects.map((eff, i) => (
                <button key={i} onClick={() => resolveActChoice(pendingActChoice.zone)}
                  style={{background:'rgba(255,150,0,0.1)',color:'#f39c12',border:'1px solid rgba(255,150,0,0.4)',borderRadius:8,padding:'10px 14px',cursor:'pointer',fontSize:11,textAlign:'left',lineHeight:1.5}}>
                  {eff.label}
                </button>
              ))}
            </div>
            <button onClick={() => clearActChoice()}
              style={{width:'100%',background:'rgba(255,255,255,0.07)',color:'#aaa',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,padding:'8px',cursor:'pointer',fontSize:12}}>
              {T('취소','Cancel')}
            </button>
          </div>
        </div>
      )}
      {/* 미니 규칙북 */}
      {showRules && (
        <div onClick={()=>setShowRules(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:400}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'#1a1a2e',borderRadius:14,border:'1px solid rgba(255,215,0,0.3)',padding:'20px 24px',maxWidth:480,width:'92%',maxHeight:'80vh',overflowY:'auto'}}>
            <div style={{fontSize:16,fontWeight:'bold',color:'#ffd700',marginBottom:14}}>📖 {T('게임 규칙','Game Rules')}</div>
            {[
              ['⚔️ ' + T('기본 흐름','Basic Flow'), T('Stand → Draw → Charge → Main → Attack → Final → End 순으로 진행','Stand → Draw → Charge → Main → Attack → Final → End')],
              ['🛡️ Counter', T('상대 턴 공격 시 [Counter] 스펠 발동 가능. 팝업에서 선택하거나 패스.','During opponent attack, Counter spells can be cast. Choose or pass.')],
              ['🔗 ' + T('링크어택','Link Attack'), T('링크어택 버튼 활성화 후 추가 공격자 선택. 합산 파워로 공격.','Enable Link Attack, select additional attackers. Combined power attacks.')],
              ['💎 Soulguard', T('공격받아 파괴 시 소울 1장 버리면 생존. 소울 없으면 파괴.','Discard 1 soul when destroyed to survive. Destroyed if no soul.')],
              ['🌟 Buddy Call', T('버디 카드를 덱에서 콜하면 라이프 +1. 라이프 10 초과 불가.','Calling buddy from deck gives +1 life. Max 10 life.')],
              ['👊 Penetrate', T('공격 성공 시 크리티컬만큼 추가 데미지.','Deal additional damage equal to critical after a successful attack.')],
              ['🎭 Act', T('필드 카드 더블클릭으로 Act 효과 발동.','Double-click field card to activate Act effect.')],
              ['📌 Set', T('스펠을 세트존에 내려 지속 효과 발동. 스펠 비용 필요.','Place spell in Set zone for continuous effect.')],
            ].map(([title, desc], i) => (
              <div key={i} style={{marginBottom:10,borderBottom:'1px solid rgba(255,255,255,0.06)',paddingBottom:8}}>
                <div style={{fontSize:12,fontWeight:'bold',color:'#a29bfe',marginBottom:3}}>{title}</div>
                <div style={{fontSize:11,color:'#ccc',lineHeight:1.5}}>{desc}</div>
              </div>
            ))}
            <button onClick={()=>setShowRules(false)} style={{width:'100%',background:'rgba(255,255,255,0.07)',color:'#aaa',border:'none',borderRadius:8,padding:'8px',cursor:'pointer',fontSize:12,marginTop:4}}>
              {T('닫기','Close')}
            </button>
          </div>
        </div>
      )}
      {/* 첫 판 튜토리얼 */}
      {showTutorial && gameState?.turn === 1 && gameState?.activePlayer === 'player' && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.88)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:400}}>
          <div style={{background:'#1a1a2e',borderRadius:16,border:'1px solid rgba(255,215,0,0.4)',padding:'24px 28px',maxWidth:480,width:'90%'}}>
            <div style={{fontSize:18,fontWeight:'bold',color:'#ffd700',marginBottom:16}}>⚔️ {T('게임 가이드','Game Guide')}</div>
            <div style={{display:'flex',flexDirection:'column',gap:10,fontSize:12,color:'#ddd',lineHeight:1.7,marginBottom:20}}>
              <div>🃏 <b>{T('손패','Hand')}</b>: {T('카드를 클릭해 선택, 존을 클릭해 배치','Click card to select, click zone to place')}</div>
              <div>✨ <b>{T('스펠','Spell')}</b>: {T('스펠 선택 후 SPELL 존 클릭으로 발동','Select spell, click SPELL zone to cast')}</div>
              <div>⚔️ <b>{T('공격','Attack')}</b>: {T('몬스터 클릭 → 공격선언 → 상대 존 클릭','Click monster → Declare → Click target')}</div>
              <div>🔗 <b>{T('링크어택','Link Attack')}</b>: {T('링크어택 버튼으로 합산 공격','Link Attack button for combined attack')}</div>
              <div>🛡️ <b>{T('카운터','Counter')}</b>: {T('AI 공격 시 팝업에서 Counter 스펠 발동 가능','Cast Counter spell when AI attacks')}</div>
              <div>🔵 <b>{T('Act','Act')}</b>: {T('필드 카드 더블클릭으로 Act 효과 발동','Double-click field card for Act effect')}</div>
            </div>
            <button onClick={()=>{
              setShowTutorial(false);
              try { localStorage.setItem('bf_tutorial_shown','1'); } catch {}
            }} style={{width:'100%',background:'linear-gradient(135deg,#6c5ce7,#a29bfe)',color:'#fff',border:'none',borderRadius:10,padding:'12px',fontSize:14,fontWeight:'bold',cursor:'pointer'}}>
              {T('게임 시작!','Start Game!')}
            </button>
          </div>
        </div>
      )}
      {winner && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.9)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',zIndex:100}}>
          <div style={{fontSize:60,marginBottom:16}}>{winner==='player'?'🏆':'💀'}</div>
          <div style={{fontSize:32,fontWeight:'bold',color:winner==='player'?'#ffd700':'#ff4444',marginBottom:24,letterSpacing:2}}>
            {winner==='player'?T('승리! 🏆','VICTORY!'):T('패배','DEFEAT')}
          </div>
          <div style={{display:'flex',gap:12,flexWrap:'wrap',justifyContent:'center'}}>
            <button onClick={() => {
              // 같은 설정으로 재대전
reMatch ? reMatch() : goToMenu();
            }} style={{background:'linear-gradient(135deg,#e17055,#d63031)',color:'#fff',
              border:'none',borderRadius:10,padding:'12px 28px',fontSize:15,fontWeight:'bold',cursor:'pointer'}}>
              {T('🔄 재대전','🔄 Rematch')}
            </button>
            <button onClick={goToMenu} style={{background:'linear-gradient(135deg,#b8860b,#ffd700)',color:'#000',fontWeight:'bold',border:'none',borderRadius:10,padding:'12px 28px',fontSize:15,cursor:'pointer'}}>
              {T('🏠 메뉴로','🏠 Menu')}
            </button>
          </div>
        </div>
      )}

      {/* ── TOP HUD ── */}
      <div style={{
        display:'flex', justifyContent:'space-between', alignItems:'center',
        padding:'4px 10px', background:'rgba(0,0,0,0.5)',
        borderBottom:'1px solid rgba(255,255,255,0.06)', flexShrink:0,
      }}>
        <div style={{display:'flex',gap:10,alignItems:'center'}}>
          <button onClick={goToMenu} style={{background:'rgba(255,255,255,0.07)',color:'#888',border:'1px solid rgba(255,255,255,0.1)',borderRadius:6,padding:'3px 10px',cursor:'pointer',fontSize:11}}>← 메뉴</button>
          <button onClick={bgmToggle} title={bgmState.title||'BGM'} style={{background:bgmState.playing?'rgba(255,215,0,0.1)':'rgba(255,255,255,0.05)',color:bgmState.playing?'#ffd700':'#555',border:`1px solid ${bgmState.playing?'rgba(255,215,0,0.3)':'rgba(255,255,255,0.08)'}`,borderRadius:6,padding:'3px 8px',cursor:'pointer',fontSize:13}}>{bgmState.playing?'🎵':'🔇'}</button>
          <button onClick={bgmNext} title="다음 곡" style={{background:'rgba(255,255,255,0.05)',color:'#888',border:'1px solid rgba(255,255,255,0.08)',borderRadius:6,padding:'3px 8px',cursor:'pointer',fontSize:13}}>⏭</button>
          <span style={{color:'#c8a96e',fontWeight:'bold',fontSize:13}}>Turn {turn}</span>
          <span style={{background:'rgba(255,255,255,0.08)',padding:'2px 10px',borderRadius:20,fontSize:11,color:'#81b4cf',border:'1px solid rgba(129,180,207,0.3)'}}>{TURN_PHASE_NAME[phase]}</span>
          {isAIThinking&&<span style={{color:'#fd79a8',fontSize:11,animation:'pulse 1s infinite'}}>● AI 진행 중...</span>}
          {isFirstTurn&&isMyTurn&&<span style={{color:'#fdcb6e',fontSize:11}}>⚠ 선공 첫 턴</span>}
          {linkMode&&<span style={{color:'#a29bfe',fontSize:11,fontWeight:'bold'}}>🔗 링크어택 {linkQueue.length}장</span>}
        </div>
        <div style={{display:'flex',gap:16,alignItems:'center'}}>
          <Stats p={ai} label="AI" isActive={!isMyTurn}/>
          <div style={{width:1,height:24,background:'rgba(255,255,255,0.1)'}}/>
          <Stats p={player} label="나" isActive={isMyTurn}/>
        </div>
      </div>

      {/* ── 메인 게임 영역 ── */}
      <div style={{flex:1, display:'flex', gap:0, overflow:'hidden', minHeight:0}}>

        {/* 왼쪽: AI 게이지 + 플레이어 게이지 */}
        <div style={{
          width:60, display:'flex', flexDirection:'column',
          background:'rgba(0,0,0,0.3)', borderRight:'1px solid rgba(255,255,255,0.05)',
        }}>
          {/* AI 게이지 */}
          <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:4,padding:'8px 4px',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
            <div style={{fontSize:8,color:'#c8a96e',letterSpacing:1,writingMode:'vertical-rl',textOrientation:'mixed',opacity:0.7}}>GAUGE</div>
            <div style={{
              width:36, flex:1, maxHeight:140,
              background:'rgba(255,215,0,0.06)', border:'1px solid rgba(255,215,0,0.2)',
              borderRadius:6, display:'flex', flexDirection:'column-reverse',
              overflow:'hidden', gap:1, padding:2,
            }}>
              {ai.gauge.slice(-8).map((_,i)=>(
                <div key={i} style={{width:'100%',height:14,background:'linear-gradient(90deg,#b8860b,#ffd700)',borderRadius:2,opacity:0.85}}/>
              ))}
            </div>
            <div style={{fontSize:11,fontWeight:'bold',color:'#ffd700'}}>{ai.gauge.length}</div>
          </div>
          {/* 구분 */}
          <div style={{height:40,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <div style={{width:1,height:30,background:'rgba(255,255,255,0.1)'}}/>
          </div>
          {/* 플레이어 게이지 */}
          <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:4,padding:'8px 4px',borderTop:'1px solid rgba(255,255,255,0.06)'}}>
            <div style={{fontSize:11,fontWeight:'bold',color:'#ffd700'}}>{player.gauge.length}</div>
            <div style={{
              width:36, flex:1, maxHeight:140,
              background:'rgba(255,215,0,0.06)', border:'1px solid rgba(255,215,0,0.2)',
              borderRadius:6, display:'flex', flexDirection:'column',
              overflow:'hidden', gap:1, padding:2,
            }}>
              {player.gauge.slice(-8).map((_,i)=>(
                <div key={i} style={{width:'100%',height:14,background:'linear-gradient(90deg,#b8860b,#ffd700)',borderRadius:2,opacity:0.85}}/>
              ))}
            </div>
            <div style={{fontSize:8,color:'#c8a96e',letterSpacing:1,writingMode:'vertical-rl',textOrientation:'mixed',opacity:0.7}}>GAUGE</div>
          </div>
        </div>

        {/* 중앙: 필드 */}
        <div style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0, minHeight:0}}>

          {/* ── AI 필드 ── */}
          <div style={{
            flex:'0 0 auto', minHeight:170, display:'flex', flexDirection:'column', justifyContent:'center',
            background:'linear-gradient(180deg,rgba(180,60,60,0.06) 0%,transparent 100%)',
            borderBottom:'2px solid rgba(255,255,255,0.07)', padding:'6px 12px', gap:4,
          }}>
            {/* AI 상태 표시 */}
            <div style={{display:'flex',justifyContent:'flex-end',alignItems:'center',gap:6}}>
              <span style={{fontSize:10,color:'#ff8888',opacity:0.7}}>🤖 AI</span>
              {!isMyTurn&&!winner&&<span style={{fontSize:10,color:'#fd79a8',background:'rgba(253,121,168,0.15)',padding:'1px 8px',borderRadius:10,border:'1px solid rgba(253,121,168,0.3)'}}>공격 중</span>}
            </div>

            {/* AI 필드 존들 - 거꾸로 배치 (상대 시점) */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
              {/* Flag/Buddy */}
              <div style={{display:'flex',flexDirection:'column',gap:4}}>
                <FlagBuddyArea p={ai}/>
              </div>

              {/* Item */}
              <div onClick={()=>attackingCard&&playResolveAttack('item')}
                style={{
                  width:72,height:100,borderRadius:6,overflow:'hidden',
                  border:`2px solid ${attackingCard?'rgba(255,68,68,0.8)':'rgba(255,255,255,0.12)'}`,
                  display:'flex',alignItems:'center',justifyContent:'center',
                  cursor:attackingCard?'pointer':'default',
                  background:'rgba(255,255,255,0.03)',
                  boxShadow:attackingCard?'0 0 10px rgba(255,68,68,0.4)':'none',
                  transition:'all 0.2s',
                }}>
                {ai.item?<Card card={ai.item} isRest={ai.item.state===CARD_STATE.REST} displayMode="field"/>
                  :<span style={{color:'rgba(255,255,255,0.15)',fontSize:9,textAlign:'center',lineHeight:1.4}}>ITEM</span>}
              </div>

              {/* 필드 존: Right(거꾸로) Center Left */}
              {['right','center','left'].map(zone=>(
                <FieldZone key={zone} card={ai.field[zone]} label={zone.toUpperCase()}
                  isTargetable={!!attackingCard}
                  onClick={attackingCard?()=>playResolveAttack(zone):undefined}/>
              ))}

              {/* 직접공격 버튼 */}
              {attackingCard&&(
                <button onClick={()=>playResolveAttack('player')}
                  style={{background:'linear-gradient(135deg,#c0392b,#e74c3c)',color:'#fff',border:'none',borderRadius:8,padding:'8px 10px',cursor:'pointer',fontSize:10,fontWeight:'bold',lineHeight:1.4,boxShadow:'0 4px 12px rgba(231,76,60,0.4)'}}>
                  직접<br/>공격
                </button>
              )}
            </div>
          </div>

          {/* ── 중앙 배틀라인 ── */}
          <div style={{
            height:28, display:'flex', alignItems:'center', justifyContent:'center',
            background:'rgba(0,0,0,0.4)', gap:16, flexShrink:0,
            borderTop:'1px solid rgba(255,255,255,0.05)', borderBottom:'1px solid rgba(255,255,255,0.05)',
          }}>
            <span style={{fontSize:10,color:'rgba(255,255,255,0.2)',letterSpacing:2}}>AI ──────────</span>
            {attackingCard
              ? <span style={{fontSize:11,color:'#ff6b6b',fontWeight:'bold',background:'rgba(255,107,107,0.1)',padding:'3px 12px',borderRadius:20,border:'1px solid rgba(255,107,107,0.3)'}}>⚔ {attackingCard.card?.name?.split(',')[0]}</span>
              : <span style={{fontSize:10,color:'rgba(255,255,255,0.15)',letterSpacing:3}}>BATTLE FIELD</span>
            }
            <span style={{fontSize:10,color:'rgba(255,255,255,0.2)',letterSpacing:2}}>────────── 나</span>
          </div>

          {/* ── 플레이어 필드 ── */}
          <div style={{
            flex:'0 0 auto', minHeight:170, display:'flex', flexDirection:'column', justifyContent:'center',
            background:'linear-gradient(0deg,rgba(60,130,180,0.06) 0%,transparent 100%)',
            borderTop:'2px solid rgba(255,255,255,0.07)', padding:'6px 12px', gap:4,
          }}>
            {/* 플레이어 필드 존들 */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
              {/* 내 존: Left Center Right */}
              {['left','center','right'].map(zone=>(
                <FieldZone key={zone} card={player.field[zone]} label={zone.toUpperCase()}
                  isAttackable={isAttack&&!attackingCard&&!linkMode&&player.field[zone]?.state===CARD_STATE.STAND}
                  isLinkSelected={linkMode&&linkQueue.some(q=>q.zone===zone)}
                  isSelected={isMain&&!player.field[zone]&&selIsMonster}
                  onClick={()=>onMyZoneClick(zone)}/>
              ))}

              {/* Item */}
              <div onClick={onMyItemClick}
                style={{
                  width:72,height:100,borderRadius:6,overflow:'hidden',
                  border:`2px solid ${selIsItem&&isMain?'rgba(255,215,0,0.8)':isAttack&&player.item?.state===CARD_STATE.STAND?'rgba(255,107,107,0.8)':'rgba(255,255,255,0.12)'}`,
                  display:'flex',alignItems:'center',justifyContent:'center',
                  cursor:'pointer', background:'rgba(255,255,255,0.03)',
                  boxShadow:selIsItem&&isMain?'0 0 10px rgba(255,215,0,0.3)':'none',
                  transition:'all 0.2s',
                }}>
                {player.item?<Card card={player.item} isRest={player.item.state===CARD_STATE.REST} displayMode="field"/>
                  :<span style={{color:'rgba(255,255,255,0.15)',fontSize:9,textAlign:'center',lineHeight:1.4}}>ITEM</span>}
              </div>

              {/* 스펠존 + 세트존 */}
              <div style={{display:'flex',flexDirection:'column',gap:4}}>
                <div onClick={onCastSpell}
                  style={{
                    width:58,height:48,borderRadius:6,
                    border:`2px dashed ${selIsSpell||selCanSet?'rgba(255,215,0,0.8)':'rgba(255,255,255,0.1)'}`,
                    background:selIsSpell||selCanSet?'rgba(255,215,0,0.08)':'rgba(255,255,255,0.02)',
                    display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
                    cursor:selIsSpell||selCanSet?'pointer':'default',transition:'all 0.2s',
                  }}>
                  <div style={{fontSize:8,color:selIsSpell||selCanSet?'#ffd700':'rgba(255,255,255,0.2)'}}>✨ SPELL</div>
                  {isFinal&&<div style={{fontSize:8,color:'#e17055'}}>IMPACT</div>}
                </div>
                <div style={{
                  width:58,height:48,borderRadius:6,
                  border:`1px solid ${gameState.setZone?.player?'rgba(162,155,254,0.6)':'rgba(255,255,255,0.08)'}`,
                  background:'rgba(108,92,231,0.05)',
                  display:'flex',alignItems:'center',justifyContent:'center',
                  overflow:'hidden',
                }}>
                  {gameState.setZone?.player && (Array.isArray(gameState.setZone.player) ? gameState.setZone.player.length > 0 : gameState.setZone.player) ? (
                    <div style={{display:'flex',flexDirection:'column',gap:1,alignItems:'center',width:'100%',cursor:'pointer'}}>
                      {(Array.isArray(gameState.setZone.player) ? gameState.setZone.player : [gameState.setZone.player]).map((sc,si) => (
                        <div key={si} onDoubleClick={() => sc && setCardDetailPopup(sc)}
                          title={`${sc?.name||'Set'} (더블클릭: 상세보기)`}
                          style={{width:'100%',textAlign:'center',padding:'1px 2px',cursor:'pointer'}}>
                          <img src={`/cards-mini/n${sc?.id}.png`} alt={sc?.name||'Set'}
                            style={{width:48,height:68,objectFit:'cover',borderRadius:4,
                              border:`1px solid ${sc?'rgba(162,155,254,0.8)':'rgba(162,155,254,0.3)'}`,
                              transition:'transform 0.15s'}}
                            onMouseEnter={ev=>ev.target.style.transform='scale(1.08)'}
                            onMouseLeave={ev=>ev.target.style.transform='scale(1)'}
                            onError={ev=>{ev.target.style.display='none';}} />
                          <div style={{fontSize:7,color:'#a29bfe',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:52}}>{sc?.name||'Set'}</div>
                        </div>
                      ))}
                    </div>
                  ) : <div style={{fontSize:8,color:'rgba(255,255,255,0.15)'}}>📌 SET</div>}
                </div>
              </div>

              {/* Flag/Buddy */}
              <div style={{display:'flex',flexDirection:'column',gap:4}}>
                <FlagBuddyArea p={player}/>
              </div>
            </div>

            {/* 플레이어 상태 표시 */}
            <div style={{display:'flex',justifyContent:'flex-start',alignItems:'center',gap:6}}>
              {isMyTurn&&!winner&&<span style={{fontSize:10,color:'#74b9ff',opacity:0.7}}>🎮 내 턴</span>}
              {isFirstTurn&&isMyTurn&&<span style={{fontSize:10,color:'#fdcb6e',background:'rgba(253,203,110,0.1)',padding:'1px 8px',borderRadius:10,border:'1px solid rgba(253,203,110,0.3)'}}>⚠ 첫 턴</span>}
            </div>
          </div>

          {/* ── 손패 영역 ── */}
          <div style={{
            background:'rgba(0,0,0,0.5)', borderTop:'1px solid rgba(255,255,255,0.06)',
            padding:'4px 10px', flexShrink:0,
          }}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4,flexWrap:'wrap'}}>
              <span style={{fontSize:10,color:'rgba(162,155,254,0.8)'}}>🃏 손패 {player.hand.length}장</span>
              {selectedCard&&<span style={{fontSize:10,color:'#ffd700'}}>{selIsMonster?'→ 필드 존':selIsItem?'→ 아이템':selIsSpell?'→ 스펠존':selCanSet?'→ 세트':''} 클릭</span>}
              {isAttack&&!attackingCard&&!linkMode&&<span style={{fontSize:10,color:'#ff6b6b'}}>공격할 카드/존 선택</span>}
              {attackingCard&&<span style={{fontSize:10,color:'#ff6b6b',fontWeight:'bold'}}>대상 선택</span>}
              <span style={{fontSize:9,color:'rgba(255,255,255,0.2)',marginLeft:'auto'}}>더블클릭: 상세</span>
            </div>
            <div style={{display:'flex',gap:4,flexWrap:'wrap',maxHeight:100,overflow:'hidden'}}>
              {player.hand.map(card=>(
                <Card key={card.instanceId} card={card} isSelected={selectedCard===card.instanceId}
                  displayMode="hand" onClick={()=>onHandClick(card)}/>
              ))}
            </div>
          </div>

          {/* ── 컨트롤 버튼 ── */}
          <div style={{
            background:'rgba(0,0,0,0.6)', borderTop:'1px solid rgba(255,255,255,0.05)',
            padding:'4px 8px', display:'flex', gap:5, flexWrap:'wrap', justifyContent:'center', flexShrink:0,
          }}>
            {isMyTurn&&!winner&&!attackingCard&&!chargeStep&&(
              <button onClick={() => { nextPhase(); setTimeout(() => saveGameState?.(), 300); }} disabled={isAIThinking} style={{
                background:isAIThinking?'rgba(255,255,255,0.05)':phase===TURN_PHASE.END
                  ?'linear-gradient(135deg,#e17055,#d63031)'
                  :'linear-gradient(135deg,#0984e3,#0652aa)',
                color:isAIThinking?'#555':'#fff', border:'none', borderRadius:8,
                padding:'10px 20px', fontSize:13, fontWeight:'bold', cursor:isAIThinking?'not-allowed':'pointer',
                boxShadow:isAIThinking?'none':'0 2px 8px rgba(9,132,227,0.4)',
              }}>
                {phase===TURN_PHASE.END?T('턴 종료 →','End Turn →'):T('다음 페이즈 →','Next Phase →')}
              </button>
            )}
            {isAttack&&!attackingCard&&!winner&&(
              <button onClick={toggleLinkMode} style={{
                background:linkMode?'rgba(162,155,254,0.2)':'rgba(255,255,255,0.07)',
                color:linkMode?'#a29bfe':'#aaa',
                border:`1px solid ${linkMode?'rgba(162,155,254,0.5)':'rgba(255,255,255,0.15)'}`,
                borderRadius:8,padding:'6px 12px',cursor:'pointer',fontSize:11,
              }}>🔗 {linkMode?'링크취소':'링크어택'}</button>
            )}
            {linkMode&&linkQueue.length>=2&&(
              <button onClick={()=>setShowLinkTarget(true)} style={{background:'linear-gradient(135deg,#6c5ce7,#a29bfe)',color:'#fff',border:'none',borderRadius:8,padding:'6px 12px',cursor:'pointer',fontSize:11,fontWeight:'bold'}}>
                ⚡ 링크공격({linkQueue.length})
              </button>
            )}
            {isMain&&!winner&&(
              <button onClick={toggleSetMode} style={{
                background:setMode?'rgba(162,155,254,0.2)':'rgba(255,255,255,0.07)',
                color:setMode?'#a29bfe':'#aaa',
                border:`1px solid ${setMode?'rgba(162,155,254,0.5)':'rgba(255,255,255,0.15)'}`,
                borderRadius:8,padding:'6px 12px',cursor:'pointer',fontSize:11,
              }}>📌 {setMode?'세트취소':'스펠세트'}</button>
            )}
            {/* Double/Triple Attack */}
            {isAttack&&!attackingCard&&['left','center','right','item'].filter(z=>{
              const c=z==='item'?player.item:player.field[z];
              if(!c||c.state!=='rest') return false;
              const hasD=(c.text||'').includes('Double Attack'),hasT=(c.text||'').includes('Triple Attack');
              if(!hasD&&!hasT) return false;
              return (c._extraAttacksUsed??0)<(hasT?2:1);
            }).map(z=>{
              const c=z==='item'?player.item:player.field[z];
              const isT=(c?.text||'').includes('Triple Attack');
              const used=c?._extraAttacksUsed??0,max=isT?2:1;
              return(
                <button key={z} onClick={()=>playDoubleAttack(z)} style={{background:'linear-gradient(135deg,#f9a825,#f57f17)',color:'#000',border:'none',borderRadius:8,padding:'5px 10px',cursor:'pointer',fontSize:11,fontWeight:'bold'}}>
                  ⚡{isT?'Triple':'Double'}({z}) [{used+1}/{max}]
                </button>
              );
            })}
            {/* [Act] 버튼 */}
            {isMain&&!winner&&['left','center','right','item'].filter(z=>{
              const c=z==='item'?player.item:player.field[z];
              return c&&(c.text||'').includes('[Act]')&&!(c.text||'').includes('from your hand');
            }).map(z=>{
              const c=z==='item'?player.item:player.field[z];
              return(
                <button key={z+'_act'} onClick={()=>playActEffect(z)} style={{background:'linear-gradient(135deg,#e84393,#c0392b)',color:'#fff',border:'none',borderRadius:8,padding:'5px 10px',cursor:'pointer',fontSize:11,fontWeight:'bold'}}>
                  ✨ Act: {c?.name?.split(',')[0]||z}
                </button>
              );
            })}
            {/* [Overturn] 버튼 */}
            {isMain&&!winner&&['left','center','right'].filter(z=>{
              const c=player.field[z];
              return c&&(c.text||'').includes('[Overturn]');
            }).map(z=>{
              const c=player.field[z];
              return(
                <button key={z+'_overturn'} onClick={()=>playActEffect(z)} style={{background:'linear-gradient(135deg,#f39c12,#e67e22)',color:'#fff',border:'none',borderRadius:8,padding:'5px 10px',cursor:'pointer',fontSize:11,fontWeight:'bold'}}>
                  🔄 Overturn: {c?.name?.split(',')[0]||z}
                </button>
              );
            })}
            {isMain&&!winner&&['left','center','right'].filter(z=>{const c=player.field[z];return c&&(c.text||'').includes('[Transform]');}).map(z=>{
              const c=player.field[z];
              return(<button key={z+'_tf'} onClick={()=>playActEffect(z)} style={{background:'linear-gradient(135deg,#00b894,#00cec9)',color:'#fff',border:'none',borderRadius:8,padding:'5px 10px',cursor:'pointer',fontSize:11,fontWeight:'bold'}}>🔀 Transform: {c?.name?.split(',')[0]||z}</button>);
            })}
            {isMain&&!winner&&player.hand.filter(c=>c&&(c.text||'').includes('[Act]')&&(c.text||'').includes('from your hand')).map(c=>(
              <button key={c.instanceId+'_hact'} onClick={()=>playHandActEffect(c.instanceId)} style={{background:'linear-gradient(135deg,#8e44ad,#6c3483)',color:'#fff',border:'none',borderRadius:8,padding:'5px 10px',cursor:'pointer',fontSize:11,fontWeight:'bold'}}>
                ✨ Act(손): {c.name?.split(',')[0]}
              </button>
            ))}
            {/* Move */}
            {isMain&&(()=>{
              const zones=['left','center','right'].filter(z=>{
                const c=player.field[z];if(!c)return false;
                const t=c.text||'';
                if(t.includes('[Move]'))return true;
                if(!t.includes('gets [Move]')&&!t.includes('get [Move]'))return false;
                const condM=t.match(/[Ii]f\s+(.*?)[,.]?\s*(?:this card|it)\s+gets?\s+\[Move\]/i);
                if(!condM)return false;
                const cond=condM[1].toLowerCase();
                const others=['left','center','right'].filter(z2=>z2!==z).map(z2=>player.field[z2]).filter(Boolean);
                const nameM=cond.match(/another card with ["'«]?([^"'»,]+)["'»]? in its card name/i);
                if(nameM)return others.some(c2=>(c2.name||'').toLowerCase().includes(nameM[1].trim().toLowerCase()));
                const haveM=cond.match(/you have (?:a|an)\s+[«"]?([^"'»]+)[»"]?/i);
                if(haveM)return[...others,player.item].filter(Boolean).some(c2=>(c2.name||'').toLowerCase().includes(haveM[1].trim().toLowerCase()));
                const flagM=cond.match(/your flag is ["'«]?([^"'»]+)["'»]?/i);
                if(flagM)return player.flag&&(player.flag.name||'').toLowerCase().includes(flagM[1].trim().toLowerCase());
                const lifeM=cond.match(/you have (\d+) life or less/i);
                if(lifeM)return player.life<=parseInt(lifeM[1]);
                return false;
              });
              if(!zones.length)return null;
              return(
                <button onClick={()=>{if(zones.length===1){setMoveSelectZone(zones[0]);setShowMoveUI(true);}else{setMoveSelectZone(null);setShowMoveUI(true);}}}
                  style={{background:'linear-gradient(135deg,#00b894,#00cec9)',color:'#fff',border:'none',borderRadius:8,padding:'8px 14px',cursor:'pointer',fontSize:12}}>
                  🔄 Move
                </button>
              );
            })()}
            {selectedCard&&<button onClick={clearSelection} style={{background:'rgba(255,255,255,0.07)',color:'#888',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,padding:'8px 14px',cursor:'pointer',fontSize:12}}>✕ 취소</button>}
            {attackingCard&&<button onClick={playCancelAttack} style={{background:'rgba(255,255,255,0.07)',color:'#888',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,padding:'8px 14px',cursor:'pointer',fontSize:12}}>공격 취소</button>}
          </div>

        </div>

        {/* 오른쪽: AI 드롭/덱 + 로그 + 플레이어 드롭/덱 */}
        <div style={{
          width:96, display:'flex', flexDirection:'column',
          background:'rgba(0,0,0,0.3)', borderLeft:'1px solid rgba(255,255,255,0.05)',
        }}>
          {/* AI Drop + Deck */}
          <div style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:6, padding:'8px 4px', borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
            <div style={{fontSize:8,color:'rgba(255,255,255,0.3)',letterSpacing:1}}>AI DROP</div>
            <div onClick={()=>setDropViewer('ai')} style={{
              width:60,height:84,borderRadius:5,
              border:'1px solid rgba(255,255,255,0.12)',
              background:'rgba(255,255,255,0.03)',
              display:'flex',alignItems:'center',justifyContent:'center',
              cursor:ai.drop.length>0?'pointer':'default',
              position:'relative',
            }}>
              {ai.drop.length>0?<>
                <img src={`/cards-mini/n${ai.drop[ai.drop.length-1].id}.png`} alt="" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:4}} onError={e=>{e.target.style.display='none';}}/>
                <div style={{position:'absolute',bottom:1,right:2,fontSize:9,color:'#fff',fontWeight:'bold',background:'rgba(0,0,0,0.6)',borderRadius:2,padding:'0 3px'}}>{ai.drop.length}</div>
                {ai.drop.length>0&&<div style={{position:'absolute',top:1,left:0,right:0,textAlign:'center',fontSize:8,color:'rgba(255,255,255,0.4)'}}>👁</div>}
              </>:<span style={{fontSize:8,color:'rgba(255,255,255,0.15)'}}>0</span>}
            </div>
            <div style={{fontSize:8,color:'rgba(255,255,255,0.3)',letterSpacing:1}}>AI DECK</div>
            <div style={{
              width:60,height:84,borderRadius:5,overflow:'hidden',
              border:'1px solid rgba(108,92,231,0.3)',
              position:'relative',
            }}>
              {ai.sleeve!=null
                ?<img src={`/sleeves-mini/s${ai.sleeve}.png`} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                :<div style={{width:'100%',height:'100%',background:'linear-gradient(135deg,#1a1a3e,#2d1b69)',display:'flex',alignItems:'center',justifyContent:'center'}}><span style={{fontSize:14,color:'#9d4edd'}}>★</span></div>}
              <div style={{position:'absolute',bottom:1,left:0,right:0,textAlign:'center',fontSize:10,fontWeight:'bold',color:'#fff',background:'rgba(0,0,0,0.6)',padding:'1px 0'}}>{ai.deck.length}</div>
            </div>
          </div>

          {/* 로그 */}
          <div style={{
            flex:1.2, display:'flex', flexDirection:'column',
            borderTop:'1px solid rgba(255,255,255,0.05)', borderBottom:'1px solid rgba(255,255,255,0.05)',
            overflow:'hidden',
          }}>
            <div onClick={()=>setLogOpen(v=>!v)} style={{
              fontSize:8,color:'rgba(255,255,255,0.25)',cursor:'pointer',
              padding:'3px 6px',textAlign:'center',letterSpacing:1,
              borderBottom:'1px solid rgba(255,255,255,0.04)',
            }}>LOG {logOpen?'▲':'▼'}</div>
            {logOpen&&(
              <div style={{flex:1,overflowY:'auto',padding:'4px 5px',display:'flex',flexDirection:'column',gap:2}}>
                {[...gameState.log].reverse().slice(0,20).map((l,i)=>(
                  <div key={i} style={{fontSize:8.5,color:i===0?'#e8e0d0':'rgba(255,255,255,0.35)',lineHeight:1.4,borderBottom:'1px solid rgba(255,255,255,0.03)',paddingBottom:1}}>
                    {l}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Player Drop + Deck */}
          <div style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:6, padding:'8px 4px', borderTop:'1px solid rgba(255,255,255,0.06)'}}>
            <div style={{
              width:60,height:84,borderRadius:5,overflow:'hidden',
              border:'1px solid rgba(108,92,231,0.3)', position:'relative',
            }}>
              {player.sleeve!=null
                ?<img src={`/sleeves-mini/s${player.sleeve}.png`} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                :<div style={{width:'100%',height:'100%',background:'linear-gradient(135deg,#1a1a3e,#2d1b69)',display:'flex',alignItems:'center',justifyContent:'center'}}><span style={{fontSize:14,color:'#9d4edd'}}>★</span></div>}
              <div style={{position:'absolute',bottom:1,left:0,right:0,textAlign:'center',fontSize:10,fontWeight:'bold',color:'#fff',background:'rgba(0,0,0,0.6)',padding:'1px 0'}}>{player.deck.length}</div>
            </div>
            <div style={{fontSize:8,color:'rgba(255,255,255,0.3)',letterSpacing:1}}>MY DECK</div>
            <div onClick={()=>setDropViewer('player')} style={{
              width:60,height:84,borderRadius:5,
              border:'1px solid rgba(255,255,255,0.12)',
              background:'rgba(255,255,255,0.03)',
              display:'flex',alignItems:'center',justifyContent:'center',
              cursor:player.drop.length>0?'pointer':'default',
              position:'relative',
            }}>
              {player.drop.length>0?<>
                <img src={`/cards-mini/n${player.drop[player.drop.length-1].id}.png`} alt="" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:4}} onError={e=>{e.target.style.display='none';}}/>
                <div style={{position:'absolute',bottom:1,right:2,fontSize:9,color:'#fff',fontWeight:'bold',background:'rgba(0,0,0,0.6)',borderRadius:2,padding:'0 3px'}}>{player.drop.length}</div>
                <div style={{position:'absolute',top:1,left:0,right:0,textAlign:'center',fontSize:8,color:'rgba(255,255,255,0.4)'}}>👁</div>
              </>:<span style={{fontSize:8,color:'rgba(255,255,255,0.15)'}}>0</span>}
            </div>
            <div style={{fontSize:8,color:'rgba(255,255,255,0.3)',letterSpacing:1}}>MY DROP</div>
          </div>
        </div>

      </div>{/* 메인 영역 끝 */}
    </div>
  );

}
