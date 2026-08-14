import { createSession, PHASE } from '../game/session.js';
import { AGENTS, bestQuery } from '../game/rules.js';
let ok=0, fail=0;
for (let i=0;i<200;i++){
  try{
    const S = createSession({});
    let guard=0;
    while (S.state.phase !== PHASE.OVER && guard++ < 60){
      if (S.state.phase === PHASE.ASK && S.state.turn === 0){
        const c = S.yourCandidates(0).length ? S.yourCandidates(0) : S.yourCandidates(1);
        if (c.length===1){ S.declare(c[0]); if(S.state.phase!==PHASE.OVER) S.runBots(); continue; }
        const q = bestQuery(c, S.yourAnswers());
        const r = S.ask(q.queryMask, q.modeAll);
        if(!r.ok) break;
        S.settleAnswer();       // what askBtn does
        S.runBots();            // what afterYourMove does
      } else if (S.state.phase === PHASE.RESPOND){
        const p = S.pendingForYou();
        if(!p) { S.runBots(); continue; }
        S.respond(Math.random()<0.3 ? !p.honest : p.honest, 2);
      } else { S.runBots(); }
    }
    if (S.state.winner === null) throw new Error('no winner after '+guard);
    ok++;
  }catch(e){ fail++; if(fail<3) console.log('FAIL:', e.message); }
}
console.log(`ui call-sequence: ${ok} clean, ${fail} broken`);
