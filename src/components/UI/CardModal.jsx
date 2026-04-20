import useGameStore from '../../store/gameStore.js';
import { getCardText } from '../../i18n/useI18n.js';

export default function CardModal({ card, onClose }) {
  if (!card) return null;
  const lang = useGameStore(s => s.lang) || 'ko';
  const typeNames = lang === 'ko'
    ? {1:'몬스터',2:'아이템',3:'스펠',4:'임팩트/세트',5:'플래그'}
    : {1:'Monster',2:'Item',3:'Spell',4:'Impact Armor',5:'Flag'};
  const displayText = getCardText(card, lang);
  return (
    <div onClick={onClose} style={{
      position:'fixed',inset:0,background:'rgba(0,0,0,0.88)',
      display:'flex',alignItems:'center',justifyContent:'center',
      zIndex:9999,padding:16,  // z-index 최대로
    }}>
      <div onClick={e=>e.stopPropagation()} style={{
        display:'flex',gap:16,background:'#1a1a2e',
        borderRadius:12,border:'1px solid #444',padding:16,
        maxWidth:560,width:'100%',maxHeight:'88vh',overflow:'auto',
      }}>
        <div style={{flexShrink:0}}>
          <img src={`/cards/n${card.id}.png`} alt={card.name}
            style={{width:160,height:224,objectFit:'cover',borderRadius:8,border:'1px solid #555',display:'block'}}
            onError={e=>{e.target.style.display='none';}}/>
        </div>
        <div style={{flex:1,display:'flex',flexDirection:'column',gap:8,minWidth:0}}>
          <div style={{fontSize:18,fontWeight:'bold',color:'#ffd700',wordBreak:'break-word'}}>{card.name}</div>
          <div style={{fontSize:12,color:'#81ecec'}}>
            {typeNames[card.type]||'Unknown'}{card.size!=null?` · Size ${card.size}`:''}
            {card.tribe && <span style={{color:'#a29bfe',marginLeft:6}}>{card.tribe}</span>}
            {card.world && <span style={{color:'#55efc4',marginLeft:6}}>{({1:'Katana',2:'Danger',3:'Magic',4:'Dungeon',5:'Legend',6:'Dragon',7:'Ancient',8:'Generic',9:'Darkness Dragon',10:'Hero',11:'Star Dragon'})[card.world]||`W${card.world}`} World</span>}
          </div>
          {(card.power||card.defense||card.critical)&&(
            <div style={{fontSize:12,color:'#f9a',display:'flex',gap:12}}>
              {card.power!=null&&<span>⚔️ {card.power.toLocaleString()}</span>}
              {card.defense!=null&&<span>🛡️ {card.defense.toLocaleString()}</span>}
              {card.critical!=null&&<span>★ {card.critical}</span>}
            </div>
          )}
          {displayText&&(
            <div style={{
              fontSize:12,color:'#dfe6e9',lineHeight:1.6,
              background:'rgba(255,255,255,0.05)',borderRadius:6,padding:'8px 10px',
              borderLeft:'3px solid #0984e3',whiteSpace:'pre-wrap',
              wordBreak:'break-word', overflowWrap:'break-word',
            }}>{displayText}</div>
          )}
          {card.flavor&&(
            <div style={{fontSize:11,color:'#636e72',fontStyle:'italic',wordBreak:'break-word'}}>"{card.flavor}"</div>
          )}
          <button onClick={onClose} style={{marginTop:'auto',background:'#444',color:'#eee',border:'none',borderRadius:6,padding:'8px',cursor:'pointer',fontSize:13}}>닫기</button>
        </div>
      </div>
    </div>
  );
}
