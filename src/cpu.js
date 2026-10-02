// CPU opponent (VS CPU only). It reads only what its own seat can see.
import{rankOf,suitOf,lineCells,linesOfCell,bestHole,visibleTo,doPlace,bettingLegal,doBet}from'./engine.js';

function seatEquity(g,p,L,n){
  const known=new Set(g.hands[p]);
  for(let c=0;c<25;c++)if(visibleTo(g,c,p))known.add(g.board[c].card);
  const pool=[];for(let c=0;c<52;c++)if(!known.has(c))pool.push(c);
  const fixed=[];let nUnk=0;
  for(const c of lineCells(L)){if(visibleTo(g,c,p))fixed.push(g.board[c].card);else nUnk++}
  const own=g.hands[p],miss=Math.max(0,4-own.length),need=nUnk+4+miss,b5=new Array(5),oh=[0,0,0,0],hand=[...own,...Array(miss).fill(0)];let win=0;
  for(let it=0;it<n;it++){
    for(let k=0;k<need;k++){const j=k+Math.floor(Math.random()*(pool.length-k));const t=pool[k];pool[k]=pool[j];pool[j]=t}
    let m=0;for(const x of fixed)b5[m++]=x;for(let k=0;k<nUnk;k++)b5[m++]=pool[k];
    oh[0]=pool[nUnk];oh[1]=pool[nUnk+1];oh[2]=pool[nUnk+2];oh[3]=pool[nUnk+3];for(let k=0;k<miss;k++)hand[own.length+k]=pool[nUnk+4+k];
    const a=bestHole(b5,hand).v,b=bestHole(b5,oh).v;win+=a>b?1:a===b?.5:0;
  }
  return win/n;
}
function cpuPlace(g,p){
  const hand=g.hands[p];let best=null;
  for(const card of hand){
    const rest=hand.filter(x=>x!==card);
    for(let cell=0;cell<25;cell++){
      if(g.board[cell])continue;let s=Math.random()*.3;
      for(const L of linesOfCell(cell)){
        let syn=0;for(const k of rest){if(rankOf(k)===rankOf(card))syn+=2.5;if(suitOf(k)===suitOf(card))syn+=.4;if(Math.abs(rankOf(k)-rankOf(card))<=2)syn+=.2}
        syn+=rankOf(card)/14;
        const pot=g.contrib[L][0]+g.contrib[L][1];const filled=lineCells(L).filter(c=>g.board[c]).length;
        if(filled===4){
          // try the placement: keep the other 3 cards; the 4th is an unknown draw
          const hh=g.hands[p];g.board[cell]={card,owner:p,rev:false};g.hands[p]=rest;
          const e=seatEquity(g,p,L,30);g.board[cell]=null;g.hands[p]=hh;
          s+=(e-.5)*(10+pot*.6);
        }else s+=syn*(1+pot/12)*.5;
      }
      if(!best||s>best[0])best=[s,card,cell];
    }
  }
  doPlace(g,p,best[1],best[2]);
}
function cpuBet(g,p){
  const b=g.betting,L=b.line,lg=bettingLegal(g),e=seatEquity(g,p,L,90);
  const pot=g.contrib[L][0]+g.contrib[L][1];
  if(lg.mode==='open'){
    if(lg.raise&&e>.64){const[lo,hi]=lg.raise;return doBet(g,p,'raise',e>.85?hi:Math.round(lo+(hi-lo)*.6))}
    if(lg.raise&&Math.random()<.1)return doBet(g,p,'raise',lg.raise[0]);
    return doBet(g,p,'check');
  }
  const call=lg.toCall,po=call/(pot+call);
  if(lg.raise&&e>.8&&b.raises<4){const[lo,hi]=lg.raise;return doBet(g,p,'raise',e>.9?hi:Math.round(lo+(hi-lo)*.5))}
  if(e>=po-.03||Math.random()<.04)return doBet(g,p,'call');
  return doBet(g,p,'fold');
}
function cpuMove(g,p){if(g.phase==='place')return cpuPlace(g,p);if(g.phase==='betting')return cpuBet(g,p)}

export{seatEquity,cpuPlace,cpuBet,cpuMove};
