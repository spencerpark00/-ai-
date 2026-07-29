// ============================================================
// MRO Copilot — 로컬 서비스 서버 (Node 내장 기능만, 무설치)
// 브라우저 → 이 서버 → Neo4j HTTP Query API → 실데이터
// 실행:  node server.js <neo4j비밀번호>
//   예)  node server.js my-password
// 접속:  http://localhost:5173
// ============================================================
const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const PORT   = process.env.PORT || 5173;
// Neo4j 접속 — 환경변수 있으면 클라우드(Aura), 없으면 로컬
//   로컬:  node server.js <비밀번호>
//   Aura:  NEO4J_URI, NEO4J_USER, NEO4J_PW 환경변수로 지정
const NEO4J_BASE = process.env.NEO4J_URI || 'http://localhost:7474';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_DB   = process.env.NEO4J_DATABASE || 'neo4j';
const PW     = process.argv[2] || process.env.NEO4J_PW || 'neo4j';
const NEO4J  = NEO4J_BASE.replace(/\/$/,'') + '/db/' + NEO4J_DB + '/query/v2';
const AUTH   = 'Basic ' + Buffer.from(NEO4J_USER + ':' + PW).toString('base64');
const ROOT   = __dirname;

// ── 한국어/구어 → 부품명 사전 (자연어 매칭) ────────────────
const SYNONYM = {
  '외판':'SKIN','스킨':'SKIN','skin':'SKIN','표피':'SKIN','판':'SKIN',
  '스트링거':'STRINGER','stringer':'STRINGER','세로재':'STRINGER',
  '프레임':'FRAME','frame':'FRAME','골조':'FRAME',
  '트랙':'TRACK','track':'TRACK','좌석레일':'TRACK','시트트랙':'TRACK','레일':'TRACK',
  '빔':'BEAM','beam':'BEAM','플로어빔':'BEAM','바닥보':'BEAM',
  '패널':'PANEL','panel':'PANEL','플로어패널':'PANEL',
  '앵글':'ANGLE','angle':'ANGLE','ㄱ형강':'ANGLE',
  '웹':'WEB','web':'WEB',
  '서포트':'SUPPORT','support':'SUPPORT','지지대':'SUPPORT','받침':'SUPPORT',
  '브래킷':'BRACKET','bracket':'BRACKET','브라켓':'BRACKET',
  '피팅':'FITTING','fitting':'FITTING','연결구':'FITTING',
  '힌지':'HINGE','hinge':'HINGE','경첩':'HINGE',
  '실':'SILL','sill':'SILL','도어실':'SILL',
  '더블러':'DOUBLER','doubler':'DOUBLER','보강판':'DOUBLER',
  '채널':'CHANNEL','channel':'CHANNEL',
  '거싯':'GUSSET','gusset':'GUSSET',
  '인터코스탈':'INTERCOSTAL','intercostal':'INTERCOSTAL',
  '스티프너':'STIFFENER','stiffener':'STIFFENER','보강재':'STIFFENER',
  '벌크헤드':'BARRIER','격벽':'BARRIER',
  '데크':'DECK','deck':'DECK','프레셔데크':'DECK',
};

// ── Neo4j HTTP Query API 호출 ──────────────────────────────
function cypher(statement, parameters){
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ statement, parameters: parameters || {} });
    const lib = NEO4J.startsWith('https') ? https : http;
    const req = lib.request(NEO4J, {
      method:'POST',
      headers:{ 'Authorization':AUTH, 'Content-Type':'application/json',
                'Accept':'application/json', 'Content-Length':Buffer.byteLength(body) }
    }, res => {
      let d=''; res.on('data',c=>d+=c);
      res.on('end',()=>{
        try{
          const j = JSON.parse(d);
          if(j.errors && j.errors.length) return reject(new Error(j.errors[0].message));
          const fields = (j.data && j.data.fields) || [];
          const rows = ((j.data && j.data.values) || []).map(v=>{
            const o={}; fields.forEach((f,i)=>o[f]=v[i]); return o;
          });
          resolve(rows);
        }catch(e){ reject(new Error('Neo4j 응답 파싱 실패: '+d.slice(0,200))); }
      });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

// ── ① 의도 파악 (규칙 기반) ────────────────────────────────
// ★ 나중에 LLM으로 교체할 함수. 지금은 키워드로 6종 분류.
function classifyIntent(q){
  const s=(q||'').toLowerCase().replace(/\s/g,'');
  if(/조심|주의|알아야|유의|위험|경고|안전/.test(s)) return 'warning';
  if(/어떻게|절차|방법|순서|어떤식|하는법/.test(s))   return 'procedure';
  if(/공구|장비|챙겨|준비물|뭐가지고|도구/.test(s))   return 'tool';
  if(/전에|과거|사례|예전|이력|비슷한/.test(s))       return 'case';
  if(/원래|무슨결함|어떤결함|많이|자주|반복|통계/.test(s)) return 'stat';
  return 'summary';  // 애매하면 짧은 요약 + 되물음
}

// ── ③ 답변 생성 (의도별 대화체) ────────────────────────────
// ★ 나중에 LLM으로 교체할 함수. 지금은 조회된 데이터로 템플릿 문장.
const KORD={DAMAGED:'손상',CORRODED:'부식',CRACKED:'균열',DENTED:'찍힘',GOUGED:'긁힘',PUNCTURED:'천공',WORN:'마모'};
function composeAnswer(intent, part, data, procs){
  const total=data?data.total:0;
  const defs=(data&&data.defects||[]).filter(x=>x.name);
  const cases=(data&&data.cases||[]).filter(c=>c.sum);
  const pr=(procs||[]);
  // 절차들에서 공구·주의사항·단계 모으기
  const warns=[], tools=[], steps=[];
  pr.forEach(p=>{ (p.warnings||[]).forEach(w=>w.text&&warns.push(w));
    (p.tools||[]).forEach(t=>tools.push(t)); (p.steps||[]).forEach(s=>steps.push(s)); });
  const uWarns=[...new Map(warns.map(w=>[w.text,w])).values()];
  const uTools=[...new Set(tools)];
  const partKo = part;

  if(intent==='warning'){
    if(!uWarns.length) return {text:`${partKo} 작업 관련 특별 주의사항은 조회되지 않았어요. 검사 절차를 볼까요?`, chips:['검사 절차','필요 공구'], data:{}};
    const list=uWarns.slice(0,3).map((w,i)=>`${i+1}. ${w.text}`).join('\n');
    return {text:`네, ${partKo} 작업 전 ${uWarns.length}가지 주의하세요.\n\n${list}`,
      chips:['검사 절차','필요 공구','과거 사례'], data:{warnings:uWarns.slice(0,3)}};
  }
  if(intent==='procedure'){
    const p=pr[0];
    if(!p) return {text:`${partKo} 검사 절차가 조회되지 않았어요.`, chips:['주의사항'], data:{}};
    const st=(p.steps||[]).map((s,i)=>`${i+1}. ${s}`).join('\n');
    return {text:`${p.procedure} 절차예요.\n\n${st}`,
      chips:['필요 공구','주의사항','과거 사례'], data:{procedure:p.procedure, steps:p.steps, page:p.page, source:p.source}};
  }
  if(intent==='tool'){
    if(!uTools.length) return {text:`${partKo} 관련 공구가 조회되지 않았어요.`, chips:['검사 절차'], data:{}};
    return {text:`${partKo} 검사엔 이 공구를 챙기세요.\n\n${uTools.map(t=>'· '+t).join('\n')}`,
      chips:['검사 절차','주의사항'], data:{tools:uTools}};
  }
  if(intent==='case'){
    if(!cases.length) return {text:`${partKo}의 좌표 있는 과거 사례가 없어요. 결함 통계를 볼까요?`, chips:['결함 통계'], data:{}};
    const c=cases[0];
    return {text:`네, ${partKo}에서 비슷한 사례가 있었어요.\n\n"${(c.sum||'').slice(0,120)}…"\n(${c.ac||''} · ${c.fs?'FR'+c.fs:''}${c.str?' / STR'+c.str:''})`,
      chips:['검사 절차','주의사항'], data:{cases:cases.slice(0,2)}};
  }
  if(intent==='stat'){
    if(!defs.length) return {text:`${partKo} 결함 통계가 없어요.`, chips:[], data:{}};
    const top=defs.slice(0,3).map(d=>`${KORD[d.name]||d.name} ${d.weight}건`).join(', ');
    return {text:`${partKo}은(는) 총 ${total}건 보고됐고, 많은 순으로 ${top}이에요.`,
      chips:['과거 사례','검사 절차','주의사항'], data:{defects:defs.slice(0,5), total}};
  }
  // summary: 짧게 + 되물음
  const top=defs[0]?(KORD[defs[0].name]||defs[0].name):'결함';
  return {text:`${partKo}에 대해 결함 이력·과거 사례·검사 절차·주의사항을 알려드릴 수 있어요. 무엇이 궁금하세요?`,
    chips:['주의사항','검사 절차','필요 공구','과거 사례','결함 통계'], data:{}};
}

// ── 검색어 → 부품명 해석 ───────────────────────────────────
async function resolvePart(term){
  const raw = (term||'').trim();
  const low = raw.toLowerCase();
  // 1) 사전 정확/부분 매칭
  for(const k of Object.keys(SYNONYM)){
    if(low.includes(k.toLowerCase())) return SYNONYM[k];
  }
  // 2) 영문 토큰이 부품명과 부분일치
  const parts = await cypher('MATCH (p:Part) RETURN p.name AS name, p.caseCount AS c ORDER BY c DESC', {});
  const upper = raw.toUpperCase();
  const hit = parts.find(p => upper.includes(p.name) || p.name.includes(upper));
  if(hit) return hit.name;
  return null;
}

// ── 부품 지식 조회 (서비스① 핵심 질의) ────────────────────
const Q_PART = `
MATCH (p:Part) WHERE toUpper(p.name) = toUpper($part)
OPTIONAL MATCH (p)-[ps:PART_OF]->(s:System)
WITH p, s ORDER BY ps.weight DESC
WITH p, head(collect(s)) AS sys
OPTIONAL MATCH (d:Defect)-[r:OCCURS_ON]->(p)
WITH p, sys, d, r ORDER BY r.weight DESC
WITH p, sys, collect({name:d.name, weight:r.weight}) AS defects
OPTIONAL MATCH (c:ExternalCase {partName:p.name}) WHERE c.summary IS NOT NULL
WITH p, sys, defects, collect({ac:c.aircraft, cond:c.condition, fs:c.fsFrom, str:c.stringer, sum:c.summary}) AS cs
RETURN p.name AS part, p.caseCount AS total, p.confidence AS conf, p.isGeneric AS generic,
       sys.code AS sysCode, sys.name AS sysName, defects, cs[..3] AS cases`;

// ── 부품의 정비절차·공구·주의사항 (FAA 핸드북 지식) ──
// 절차 기준으로 묶어 중복 제거. 어떤 결함에 적용되는지는 defects 로 유지.
const Q_PROCEDURE = `
MATCH (p:Part) WHERE toUpper(p.name)=toUpper($part)
MATCH (d:Defect)-[:OCCURS_ON]->(p)
MATCH (d)-[:REQUIRES_PROCEDURE]->(pr:Procedure)
WITH pr, collect(DISTINCT d.name) AS defects
OPTIONAL MATCH (pr)-[:HAS_STEP]->(st:Step)
WITH pr, defects, st ORDER BY st.seq
WITH pr, defects, collect(DISTINCT st.name) AS steps
OPTIONAL MATCH (pr)-[:REQUIRES_TOOL]->(t:Tool)
WITH pr, defects, steps, collect(DISTINCT t.name) AS tools
OPTIONAL MATCH (pr)-[:HAS_WARNING]->(w:SafetyWarning)
OPTIONAL MATCH (pr)-[:SOURCED_FROM]->(doc:Document)
WITH pr, defects, steps, tools,
     collect(DISTINCT {text:w.text, type:w.type, src:w.sourcePage}) AS warnings,
     head(collect(doc.title)) AS source
RETURN pr.name AS procedure, pr.nameEn AS procedureEn, pr.description AS desc,
       pr.sourcePage AS page, defects, steps, tools, warnings, source
ORDER BY pr.id`;

// 환류 사례 포함 여부(검증사례)
const Q_VERIFIED = `
MATCH (v:VerifiedCase)-[:ON_PART]->(p:Part) WHERE toUpper(p.name)=toUpper($part)
RETURN v.aircraft AS ac, v.condition AS cond, v.fsFrom AS fs, v.stringer AS str,
       v.action AS action, v.approvedBy AS by, v.approvedAt AS at`;

// ── 서비스② 오케스트레이션 — 작업지시 흐름 ─────────────────
const Q_WORKORDER = `
MATCH (w:WorkOrder {id:$wo})
OPTIONAL MATCH (w)-[:TARGETS]->(p:Part)
OPTIONAL MATCH (w)-[:TARGETS]->(s:System)
WITH w, head(collect(DISTINCT p.name)) AS partName, head(collect(DISTINCT s.code)) AS sysCode
MATCH (w)-[:CONSISTS_OF]->(st:Step)
WITH w, partName, sysCode, st ORDER BY st.seq
RETURN w.id AS wo, w.purpose AS purpose, w.aircraft AS aircraft, w.locationText AS loc,
       w.status AS status, partName, sysCode,
       collect({seq:st.seq, name:st.name, risk:st.riskLevel, approval:st.approvalRequired, status:st.status}) AS steps`;

const Q_JUDGMENT = `
MATCH (c:DefectCandidate)-[:JUDGED_BY]->(j:Judgment)-[:CONFIRMS]->(d:Defect)
OPTIONAL MATCH (j)-[:RESULTED_IN]->(a:Action)
RETURN c.id AS cand, c.confidence AS conf, j.verdict AS verdict, j.judgedBy AS by,
       j.at AS at, d.name AS defect, a.type AS action`;

// ── 서비스③ 로봇 HUD — 검사 시나리오 ──────────────────────
const Q_ROBOT = `
MATCH (l:InspectionLocation {id:'LOC-01'})
OPTIONAL MATCH (ev:EvidenceItem {id:'EV-01'})
OPTIONAL MATCH (c:DefectCandidate {id:'CAND-01'})
RETURN l.fsFrom AS fs, l.stringer AS str, l.areaName AS area, l.blindSpot AS blind,
       l.accessDifficulty AS access, ev.qualityScore AS quality, ev.retake AS retake,
       c.confidence AS candConf, c.bbox AS bbox`;

// ── 라우팅 ─────────────────────────────────────────────────
const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css',
  '.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml'};

const server = http.createServer(async (req,res)=>{
  const u = new URL(req.url, 'http://localhost');

  // API: 부품 목록
  if(u.pathname === '/api/parts'){
    try{ const rows = await cypher('MATCH (p:Part) RETURN p.name AS name, p.caseCount AS c ORDER BY c DESC LIMIT 40',{});
      return json(res, rows);
    }catch(e){ return json(res,{error:e.message},500); }
  }

  // API: 부품 지식 조회
  if(u.pathname === '/api/query'){
    const term = u.searchParams.get('q') || '';
    try{
      const part = await resolvePart(term);
      if(!part) return json(res, {found:false, term});
      const rows = await cypher(Q_PART, {part});
      const vrows = await cypher(Q_VERIFIED, {part});
      let procs = [];
      try { procs = await cypher(Q_PROCEDURE, {part}); } catch(e){ procs = []; }
      return json(res, {found:true, term, part, data:rows[0]||null, verified:vrows, procedures:procs});
    }catch(e){ return json(res, {error:e.message}, 500); }
  }

  // ============================================================
  // API: 챗봇 — 질문 의도에 맞는 대화형 답변
  // 구조: [① 의도 파악] → [② 지식 조회(Neo4j)] → [③ 답변 생성]
  // ★ 나중에 LLM+RAG로 갈 때: ①과 ③만 LLM으로 교체. ②(지식 조회)는 그대로.
  //   → classifyIntent()·composeAnswer()만 바꾸면 되고 화면은 손 안 댐.
  // ============================================================
  if(u.pathname === '/api/ask'){
    const q = u.searchParams.get('q') || '';
    try{
      const intent = classifyIntent(q);        // ① 의도 (지금: 규칙 / 나중: LLM)
      const part = await resolvePart(q) || 'SKIN';
      const data = (await cypher(Q_PART, {part}))[0] || null;   // ② 지식 조회
      let procs = [];
      try{ procs = await cypher(Q_PROCEDURE, {part}); }catch(e){}
      const answer = composeAnswer(intent, part, data, procs);  // ③ 답변 생성
      return json(res, {q, intent, part, answer});
    }catch(e){ return json(res, {error:e.message}, 500); }
  }

  // API: 서비스② 오케스트레이션 (작업지시 흐름 + 판정)
  if(u.pathname === '/api/workflow'){
    const wo = u.searchParams.get('wo') || 'WO-2026-0724-01';
    try{
      const w = await cypher(Q_WORKORDER, {wo});
      const j = await cypher(Q_JUDGMENT, {});
      return json(res, {wo:w[0]||null, judgment:j[0]||null});
    }catch(e){ return json(res, {error:e.message}, 500); }
  }

  // API: 서비스③ 로봇 검사 HUD
  if(u.pathname === '/api/robot'){
    try{
      const r = await cypher(Q_ROBOT, {});
      // 검사 대상 부품(SKIN)의 결함 분포도 함께
      const d = await cypher(Q_PART, {part:'SKIN'});
      return json(res, {scene:r[0]||null, part:d[0]||null});
    }catch(e){ return json(res, {error:e.message}, 500); }
  }

  // 정적 파일
  let f = u.pathname === '/' ? '/index.html' : u.pathname;
  const fp = path.join(ROOT, decodeURIComponent(f));
  if(!fp.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(fp, (err,data)=>{
    if(err){ res.writeHead(404); return res.end('not found: '+f); }
    res.writeHead(200, {'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream'});
    res.end(data);
  });
});

function json(res, obj, code){
  res.writeHead(code||200, {'Content-Type':'application/json; charset=utf-8'});
  res.end(JSON.stringify(obj));
}

// ── 시작 시 연결 점검 ──────────────────────────────────────
server.listen(PORT, async ()=>{
  console.log('\n  MRO Copilot 서비스 서버');
  console.log('  ─────────────────────────────');
  try{
    const r = await cypher('MATCH (p:Part) RETURN count(p) AS n',{});
    console.log('  ✓ Neo4j 연결 성공 — 부품 노드 '+r[0].n+'개');
    console.log('  ✓ 브라우저에서 열기:  http://localhost:'+PORT+'\n');
  }catch(e){
    console.log('  ✗ Neo4j 연결 실패: '+e.message);
    console.log('    → 비밀번호 확인:  node server.js <비밀번호>\n');
  }
});
