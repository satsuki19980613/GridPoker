// What one seat is allowed to see (VS Player). The server sends only this; the full state never leaves it.
// Hidden: the deck, the opponent's hand and last draw, the opponent's face-down cards, the opponent's private log parts.
export function viewFor(g,seat){
  const o=1-seat,v=JSON.parse(JSON.stringify(g));
  delete v.deck;
  v.hands[o]=g.hands[o].map(()=>null);
  v.lastDraw[o]=null;
  v.board=g.board.map(b=>b&&!b.rev&&b.owner!==seat?{card:null,owner:b.owner,rev:false}:b&&{...b});
  v.log=g.log.map(e=>{const x={text:e.text,who:e.who};if(e.priv&&e.priv[seat]!=null)x.priv={[seat]:e.priv[seat]};return x});
  return v;
}

// {0}/{1} in log text are seats; priv[seat] is appended only for that seat
export function logText(e,me,opTag){
  return e.text.replace(/\{([01])\}/g,(_,s)=>+s===me?'YOU':opTag)+(e.priv&&e.priv[me]!=null?e.priv[me]:'');
}
