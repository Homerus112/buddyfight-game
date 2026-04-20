import { useState, useRef } from 'react';
import { CARD_TYPE_NAME, CARD_TYPE } from '../../utils/constants.js';
import CardModal from '../UI/CardModal.jsx';

const TYPE_COLOR = { 1:'#0a2a4a', 2:'#3a0a0a', 3:'#0a3a0a', 4:'#3a2a0a', 5:'#2a0a3a' };

export default function Card({ card, isSelected, isRest, onClick, displayMode='hand', showBack=false }) {
  const [imgFailed, setImgFailed] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showSoul, setShowSoul] = useState(false);
  const clickTimer = useRef(null);

  if (!card) return null;

  const isHand = displayMode === 'hand';
  const w = isHand ? 62 : 90;
  const h = isHand ? 88 : 126;
  const imgSrc = isHand ? `/cards-mini/n${card.id}.png` : `/cards/n${card.id}.png`;

  const handleClick = (e) => {
    // 더블클릭: 모달
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      setShowModal(true);
      return;
    }
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      onClick?.(e);
    }, 220);
  };

  if (showBack) return (
    <div onClick={handleClick} style={{
      width:w, height:h, borderRadius:6, cursor:'pointer',
      background:'linear-gradient(135deg,#1a1a3e,#2d1b69)',
      display:'flex', alignItems:'center', justifyContent:'center',
      border:'1px solid #444', flexShrink:0,
    }}>★</div>
  );

  return (
    <>
      {showModal && <CardModal card={card} onClose={() => setShowModal(false)} />}
      <div onClick={handleClick} title={`${card.name} (더블클릭: 상세보기)`}
        style={{
          width:w, height:h, borderRadius:6, flexShrink:0,
          border: isSelected ? '2px solid #ffd700' : '1px solid #555',
          boxShadow: isSelected ? '0 0 12px #ffd700' : '0 2px 6px rgba(0,0,0,0.5)',
          transform: isRest ? 'rotate(90deg)' : 'none',
          transition: 'transform 0.3s',
          cursor: 'pointer',
          background: TYPE_COLOR[card.type] || '#111',
          overflow:'visible', position:'relative', display:'flex', flexDirection:'column',
        }}>
        {/* 소울 배지 - 클릭 시 뷰어 */}
        {card.soul?.length > 0 && (
          <div onClick={(e)=>{e.stopPropagation();setShowSoul(true);}}
            style={{
              position:'absolute', top:-4, left:-4, zIndex:10,
              background:'#6c5ce7', color:'#fff',
              fontSize:8, fontWeight:'bold', borderRadius:4,
              padding:'2px 5px', boxShadow:'0 1px 4px rgba(0,0,0,0.6)',
              border:'1px solid #a29bfe', cursor:'pointer',
            }}>S{card.soul.length}</div>
        )}
        {/* 소울 뷰어 팝업 */}
        {showSoul && card.soul?.length > 0 && (
          <div onClick={(e)=>{e.stopPropagation();setShowSoul(false);}}
            style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:300}}>
            <div style={{background:'#1a1a2e',borderRadius:12,border:'1px solid #a29bfe',padding:'16px 20px',maxWidth:360,width:'90%'}} onClick={e=>e.stopPropagation()}>
              <div style={{fontSize:13,fontWeight:'bold',color:'#a29bfe',marginBottom:10}}>💫 {card.name} 소울 ({card.soul.length}장)</div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
                {card.soul.map((s,i)=>(
                  <div key={i} style={{textAlign:'center',cursor:'pointer'}}
                    onDoubleClick={() => { setShowSoul(false); setTimeout(()=>setShowModal(true),50); }}
                    title={`${s.name} (더블클릭: 상세보기)`}>
                    <img src={`/cards-mini/n${s.id}.png`} alt={s.name}
                      style={{width:52,height:74,objectFit:'cover',borderRadius:5,border:'1px solid #555',transition:'transform 0.15s'}}
                      onMouseEnter={e=>e.target.style.transform='scale(1.1)'}
                      onMouseLeave={e=>e.target.style.transform='scale(1)'}
                      onError={e=>{e.target.style.display='none';}}/>
                    <div style={{fontSize:8,color:'#aaa',maxWidth:52,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.name}</div>
                  </div>
                ))}
              </div>
              <button onClick={()=>setShowSoul(false)} style={{width:'100%',background:'#2d3748',color:'#aaa',border:'none',borderRadius:8,padding:'8px',cursor:'pointer',fontSize:12}}>닫기</button>
            </div>
          </div>
        )}
        <div style={{ flex:'0 0 68%', overflow:'hidden', background:'#111', position:'relative', clipPath:'none' }}>
          {!imgFailed
            ? <img src={imgSrc} alt={card.name}
                style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}
                onError={() => setImgFailed(true)} />
            : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', padding:4 }}>
                <span style={{ fontSize:9, color:'#aaa', textAlign:'center', wordBreak:'break-word' }}>{card.name}</span>
              </div>
          }
          {/* 버프 배지 */}
          {card._buffed && (
            <div style={{position:'absolute',top:2,right:2,background:'#ffd700',color:'#000',fontSize:7,fontWeight:'bold',borderRadius:3,padding:'1px 4px'}}>BUFF</div>
          )}
          {/* 소울 배지는 카드 루트로 이동 */}
        </div>
        <div style={{ flex:1, padding:'2px 4px', background:'rgba(0,0,0,0.9)', overflow:'hidden' }}>
          <div style={{ fontSize:isHand?8:9, fontWeight:'bold', color:'#eee', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{card.name}</div>
          <div style={{ fontSize:8, color:'#aaa' }}>{CARD_TYPE_NAME[card.type]}{card.type===CARD_TYPE.MONSTER?` S${card.size??'?'}`:''}</div>
          {(card.type===CARD_TYPE.MONSTER||card.type===CARD_TYPE.ITEM) && (
            <div style={{ fontSize:8, color: card._buffed ? '#ffd700' : '#f9a' }}>
              ⚔{(card.power??0).toLocaleString()}{card.type===CARD_TYPE.MONSTER?` 🛡${(card.defense??0).toLocaleString()}`:''} ★{card.critical??1}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
