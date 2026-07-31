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

// ── .env 로컬 로더 (있으면 읽음) — 무설치, 의존성 없음 ──────
// 서비스/.env 에 KEY=VALUE 한 줄씩 넣어두면 자동으로 읽음.
// .env 는 .gitignore 로 깃에서 제외됨 → 키·비번이 코드/깃에 안 박힘.
// (이미 설정된 환경변수가 우선 — Render 등 클라우드에선 .env 없이 환경변수로)
try{
  const envPath = path.join(__dirname, '.env');
  if(fs.existsSync(envPath)){
    fs.readFileSync(envPath,'utf8').replace(/^﻿/,'').split(/\r?\n/).forEach(line=>{
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
      if(m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g,'');
    });
  }
}catch(e){}

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

// ── LLM 설정 ────────────────────────────────────────────────
// 키가 있으면 RAG+LLM, 없으면 자동으로 규칙 기반 fallback (데모 안전장치).
// provider 자동 감지: ANTHROPIC_API_KEY 있으면 Claude, 아니면 GEMINI_API_KEY로 제미나이.
//   → 팀에서 provider를 바꿔도 환경변수만 갈면 되고 코드는 그대로.
const GEMINI_KEY     = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL   = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_MODEL= process.env.ANTHROPIC_MODEL || 'claude-opus-5'; // 비용 아끼려면 claude-haiku-4-5
const LLM_PROVIDER   = process.env.LLM_PROVIDER || (ANTHROPIC_KEY ? 'anthropic' : (GEMINI_KEY ? 'gemini' : 'none'));
const LLM_ON         = LLM_PROVIDER==='anthropic' ? !!ANTHROPIC_KEY
                     : LLM_PROVIDER==='gemini'    ? !!GEMINI_KEY : false;
const LLM_MODEL      = LLM_PROVIDER==='anthropic' ? ANTHROPIC_MODEL : GEMINI_MODEL;

// ── 현장용어사전 로드 (음성/텍스트 현장어 → 표준어) ─────────
// 대한항공 정비사 VOC + 검색. RAG 근거와 부품 해석 양쪽에 사용.
let FIELD_TERMS = [];
try{
  const raw = fs.readFileSync(path.join(ROOT,'현장용어사전.csv'),'utf8').replace(/^﻿/,'');
  FIELD_TERMS = raw.split(/\r?\n/).slice(1).filter(Boolean).map(line=>{
    const c = line.split(',');
    return {term:c[0], std:c[1], cat:c[2], mean:c[3], src:c[4]};
  }).filter(r=>r.term);
}catch(e){ FIELD_TERMS = []; }

// 질문에 들어있는 현장용어 → 표준어 매핑 목록
function slangHits(q){
  const s = (q||'');
  const seen = new Set(); const out = [];
  for(const r of FIELD_TERMS){
    if(r.term && s.includes(r.term) && !seen.has(r.std)){ seen.add(r.std); out.push(r); }
  }
  return out;
}

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

// ============================================================
// LLM + RAG — 자유 질문·추론·현장어 대응 (규칙 기반 위에 얹음)
//   [현장어 정규화] → [Neo4j·교범 근거 검색(RAG)] → [LLM 답변]
//   근거 밖은 답하지 않게 제약(환각 억제). 실패하면 규칙 기반으로 fallback.
// ============================================================
const SYS_PROMPT = `당신은 'MRO Copilot', 항공정비 현장에서 정비사를 돕는 음성·텍스트 도우미입니다. 옆에서 같이 일하는 선배 정비사처럼, 자연스럽고 편안한 한국어 대화체로 답하세요.

[대화 방식]
- 근거를 그대로 베껴 나열하지 말고, 이해한 내용을 자연스러운 문장으로 풀어 설명하세요. 절차처럼 단계가 중요할 땐 짧은 목록을 쓰되, 앞뒤를 말로 이어 붙이세요.
- 이건 하나로 이어지는 대화입니다. 앞선 대화를 기억하고 맥락을 이어받아 답하세요. "그건", "아까 그거", "그럼?" 같은 말도 이전 흐름으로 이해하세요. 같은 말을 반복하지 말고 이어서 대답하세요.
- 핵심부터 말하고 너무 길지 않게. 보통 2~4문장, 절차 설명은 조금 더 길어도 됩니다.

[지켜야 할 것]
- 아래 [근거]를 바탕으로 답하되, 근거에 없으면 지어내지 말고 "그건 제 자료엔 없어요"라고 솔직히 말한 뒤 아는 범위만 답하세요.
- 최종 결함 판정은 정비사가 합니다. 당신은 판정하지 않고 정보만 제공하세요.
- 현장용어(메가네·야마·복스 등)로 물어도 이해하고, 필요하면 표준용어를 함께 알려주세요.
- 이름을 물으면 'MRO Copilot'이라고 답하고, 무엇을 할 수 있냐고 물으면: 부품 결함 이력·검사 절차·필요 공구·주의사항·과거 사례 안내, 로봇 촬영 결과 정리, 작업기록 초안 도움 을 한다고 답하세요.`;

// Gemini generateContent 호출 (Node 내장 https만)
function geminiComplete(system, turns){
  return new Promise((resolve, reject)=>{
    const contents = turns.map(t=>({ role: t.role==='model'?'model':'user', parts:[{text:t.text}] }));
    const payload = JSON.stringify({
      system_instruction:{ parts:[{text:system}] },
      contents,
      // gemini-flash-latest는 thinking 모델 → 생각이 토큰을 먹어 답이 잘림.
      // 생각 끄기(thinkingBudget:0)는 이 모델에서 빈 응답 → 대신 여유를 넉넉히 준다.
      generationConfig:{ temperature:0.6, maxOutputTokens:2048 }  // 자연스러움 위해 온도↑
    });
    const req = https.request({
      method:'POST',
      hostname:'generativelanguage.googleapis.com',
      path:'/v1beta/models/'+GEMINI_MODEL+':generateContent?key='+GEMINI_KEY,
      headers:{ 'Content-Type':'application/json', 'Content-Length':Buffer.byteLength(payload) }
    }, r=>{
      let d=''; r.on('data',c=>d+=c);
      r.on('end',()=>{
        try{
          const j = JSON.parse(d);
          if(j.error) return reject(new Error(j.error.message||'gemini error'));
          const cand = (j.candidates||[])[0]||{};
          const parts = (cand.content||{}).parts || [];
          const text = (parts.find(p=>p && p.text)||{}).text || '';  // 생각 파트 건너뛰고 텍스트만
          if(!text) return reject(new Error('빈 응답'));
          resolve(text.trim());
        }catch(e){ reject(new Error('Gemini 파싱 실패: '+d.slice(0,150))); }
      });
    });
    req.on('error', reject);
    req.write(payload); req.end();
  });
}

// Claude (Anthropic Messages API) 호출 (Node 내장 https만)
function anthropicComplete(system, turns){
  return new Promise((resolve, reject)=>{
    const messages = turns.map(t=>({ role: t.role==='model'?'assistant':'user', content: t.text }));
    const payload = JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 2000,          // 짧은 답이지만 생각 토큰 여유 포함
      system,
      messages
    });
    const req = https.request({
      method:'POST',
      hostname:'api.anthropic.com',
      path:'/v1/messages',
      headers:{ 'x-api-key':ANTHROPIC_KEY, 'anthropic-version':'2023-06-01',
                'content-type':'application/json', 'content-length':Buffer.byteLength(payload) }
    }, r=>{
      let d=''; r.on('data',c=>d+=c);
      r.on('end',()=>{
        try{
          const j = JSON.parse(d);
          if(j.type==='error' || j.error) return reject(new Error((j.error&&j.error.message)||'anthropic error'));
          if(j.stop_reason==='refusal') return reject(new Error('안전상 거부됨'));
          const blk = (j.content||[]).find(b=>b.type==='text') || {};
          const text = blk.text || '';
          if(!text) return reject(new Error('빈 응답'));
          resolve(text.trim());
        }catch(e){ reject(new Error('Anthropic 파싱 실패: '+d.slice(0,150))); }
      });
    });
    req.on('error', reject);
    req.write(payload); req.end();
  });
}

// provider 디스패처 — answerLLM은 이것만 부른다 (교체 지점 일원화)
function llmComplete(system, turns){
  return LLM_PROVIDER==='anthropic' ? anthropicComplete(system, turns)
                                    : geminiComplete(system, turns);
}

// RAG: 질문에서 부품·현장어를 뽑아 Neo4j·교범 근거를 텍스트로 조립
async function buildContext(q){
  const hits = slangHits(q);
  // Neo4j 죽어있어도 LLM은 호출되게 — 각 조회를 개별 try/catch로 감쌈
  let part='SKIN', data=null, procs=[];
  try{ part = await resolvePart(q) || 'SKIN'; }catch(e){}
  try{ data = (await cypher(Q_PART, {part}))[0] || null; }catch(e){}
  try{ procs = await cypher(Q_PROCEDURE, {part}); }catch(e){}
  const L=[];
  if(data){
    L.push(`[부품] ${data.part} — 결함 보고 총 ${data.total||0}건`);
    const defs=(data.defects||[]).filter(x=>x.name).slice(0,5).map(d=>`${KORD[d.name]||d.name} ${d.weight}건`).join(', ');
    if(defs) L.push(`[결함 통계] ${defs}`);
    const cs=(data.cases||[]).filter(c=>c.sum)[0];
    if(cs) L.push(`[과거 사례] "${(cs.sum||'').slice(0,120)}" (${cs.ac||''}${cs.fs?' · FR'+cs.fs:''})`);
  }
  const p=procs[0];
  if(p && (p.steps||[]).length) L.push(`[검사 절차] ${p.procedure}: `+p.steps.map((s,i)=>`${i+1})${s}`).join(' '));
  const tools=[...new Set([].concat(...procs.map(x=>x.tools||[])))];
  if(tools.length) L.push(`[필요 공구] ${tools.join(', ')}`);
  const warns=[...new Map([].concat(...procs.map(x=>x.warnings||[])).filter(w=>w&&w.text).map(w=>[w.text,w])).values()].slice(0,4);
  if(warns.length) L.push(`[주의사항] `+warns.map((w,i)=>`${i+1})${w.text}`).join(' '));
  if(hits.length) L.push(`[현장용어] `+hits.map(h=>`'${h.term}'=${h.std}`).join(', '));
  return { part, context:L.join('\n') };
}

// LLM 경로: 근거 조립 → Gemini → 답변 + 이어가기 칩
async function answerLLM(q, history){
  const ctx = await buildContext(q);
  const userMsg = `[근거]\n${ctx.context || '(관련 근거 없음)'}\n\n[질문]\n${q}`;
  // 최근 대화(최대 6턴)를 앞에 붙여 맥락 유지
  const turns = [];
  (Array.isArray(history)?history:[]).slice(-6).forEach(h=>{
    const t = (h && h.text || '').trim(); if(!t) return;
    turns.push({ role: h.role==='bot' ? 'model' : 'user', text: t });
  });
  turns.push({ role:'user', text: userMsg });
  while(turns.length && turns[0].role!=='user') turns.shift();  // 첫 턴은 user로 시작
  const text = await llmComplete(SYS_PROMPT, turns);
  return { part:ctx.part, answer:{ text, chips:['검사 절차','필요 공구','주의사항','과거 사례'],
    data:{ source:'FAA-H-8083-31B · Neo4j (RAG)' } } };
}

// ============================================================
// 관리자 대시보드 — 시연 시드 데이터 + 실데이터 집계
//   숫자는 "실측 / 시연 / 검증목표" 3층으로 라벨.
//   PoC 대시보드 = 달성 성과가 아니라 [측정설계 + 목표 + 시연 실측].
//   아래 DEMO_WORK 를 대시보드가 실제로 집계 → "살아있는" 시연.
// ============================================================
function ago(min){ return new Date(Date.now()-min*60000).toISOString(); }

// 오늘의 작업 (라이브 공유 상태)
//   정비사 앱에서 판정 → completeWork() → WORKS·ACTIVITY 갱신 → 관리자 대시보드 실시간 반영
let WORKS = [
  // 이미 완료 (대시보드 baseline + 이력 시드)
  {id:'W-231',ac:'B777',      part:'SKIN',    area:'FR52/STR14R',defect:'부식',    risk:'긴급',status:'완료',robot:true, verdict:'수리',base:175,lead:132,tech:'숙련',quality:true, retake:false,at:ago(96)},
  {id:'W-232',ac:'A321',      part:'STRINGER',area:'FR61/STR22L',defect:'균열',    risk:'주의',status:'완료',robot:true, verdict:'수리',base:140,lead:104,tech:'숙련',quality:true, retake:false,at:ago(63)},
  {id:'W-233',ac:'B737',      part:'PANEL',   area:'FR40/STR08R',defect:'이상없음',risk:'정상',status:'완료',robot:false,verdict:'정상',base:90, lead:72, tech:'숙련',quality:true, retake:false,at:ago(31)},
  // 정비사 대기 (라이브 처리 대상)
  {id:'W-234',ac:'EMB ERJ190',part:'SKIN',    area:'FR73/STR29L',defect:'부식',    risk:'주의',status:'대기',robot:null,verdict:null,base:160,lead:null,tech:'신입',quality:null,retake:false,at:null},
  {id:'W-235',ac:'A320',      part:'TRACK',   area:'FR33/STR11L',defect:'마모',    risk:'주의',status:'대기',robot:null,verdict:null,base:120,lead:null,tech:'신입',quality:null,retake:false,at:null},
  {id:'W-236',ac:'B777',      part:'SKIN',    area:'FR58/STR19R',defect:'균열',    risk:'긴급',status:'대기',robot:null,verdict:null,base:150,lead:null,tech:'숙련',quality:null,retake:false,at:null},
  {id:'W-237',ac:'A321',      part:'PANEL',   area:'FR45/STR16L',defect:'찍힘',    risk:'주의',status:'대기',robot:null,verdict:null,base:95, lead:null,tech:'신입',quality:null,retake:false,at:null},
  {id:'W-238',ac:'B737',      part:'STRINGER',area:'FR67/STR24R',defect:'부식',    risk:'주의',status:'대기',robot:null,verdict:null,base:130,lead:null,tech:'숙련',quality:null,retake:false,at:null},
];
// 가동 보드 — 정비사·로봇 5쌍 (가명) · 현재 작업/단계/상태 (이벤트 파생 시연 데이터)
const PAIRS = [
  {tech:'박재현',grade:'숙련',robot:'MR-01',rst:'대기',  wo:'WO-2607-114',task:'A321-200 HL8290 동체 외판 L2 구역 점검 — 리벳라인 부식·도장 상태 확인',step:'7/12 판독 검토',prog:58,status:'작업중',elapsed:'42분',parallel:null},
  {tech:'이수민',grade:'중급',robot:'MR-02',rst:'촬영중',wo:'WO-2607-115',task:'동체 외판 R2 구역 점검 — 패널 P05~P09 자동 촬영 스캔',step:'5/12 로봇 촬영',prog:42,status:'작업중',elapsed:'27분',parallel:'로봇 촬영 중 — 정비사 R2 하단 육안점검 병행'},
  {tech:'최동욱',grade:'중급',robot:'MR-03',rst:'대기',  wo:'WO-2607-117',task:'후방동체 스킨 패널 점검 — 낙뢰 흔적 확인 구간',step:'9/12 판정 상신',prog:75,status:'승인 대기',elapsed:'18분',parallel:null},
  {tech:'김하늘',grade:'신입',robot:'MR-04',rst:'이동중',wo:'WO-2607-118',task:'동체 하부 외판 점검 — 이상 후보 2건 현장 확인 중',step:'3/12 이상 후보 확인',prog:25,status:'작업중',elapsed:'12분',parallel:null},
  {tech:'한지원',grade:'신입',robot:'MR-05',rst:'충전중',wo:'—',task:'배정 대기 · 로봇 충전 중 (15:20 완료 예정)',step:'—',prog:0,status:'충전/점검',elapsed:'—',parallel:null},
];
function fleetOf(pairs){
  const m={촬영:0,이동:0,대기:0,충전:0,오류:0};
  pairs.forEach(p=>{ if(p.rst==='촬영중')m.촬영++; else if(p.rst==='이동중')m.이동++; else if(p.rst==='충전중')m.충전++; else if(p.rst==='오류')m.오류++; else m.대기++; });
  const dot={촬영:'#2b5fa8',이동:'#2e7d4f',대기:'#9aa3b2',충전:'#d9a514',오류:'#e05243'};
  return Object.entries(m).filter(([k,v])=>v>0||k!=='오류').map(([label,n])=>({label,n,dot:dot[label]}));
}
function actText(w){ return w.part+' '+w.defect+' 검사 완료 → '+w.verdict+' ('+(w.robot?'로봇':'직접')+' 촬영)'; }
let ACTIVITY = WORKS.filter(w=>w.status==='완료')
  .map(w=>({at:w.at, id:w.id, part:w.part, area:w.area, verdict:w.verdict, by:w.robot?'로봇':'직접', text:actText(w)}))
  .sort((a,b)=> a.at<b.at?1:-1);

// 환류(write-back) — 승인된 작업을 Neo4j 지식그래프에 검증사례로 축적
//   source:'PoC시연' 태그 → 나중에 시연 데이터만 정리 가능
//   (정리 쿼리:  MATCH (v:VerifiedCase {source:'PoC시연'}) DETACH DELETE v)
const Q_VERIFY_WRITE = `
MERGE (p:Part {name:$part})
CREATE (v:VerifiedCase {id:$id, aircraft:$ac, condition:$cond, action:$verdict,
        approvedBy:$by, approvedAt:$at, source:'PoC시연'})
MERGE (v)-[:ON_PART]->(p)
RETURN v.id AS id`;

// 정비사 판정 → 작업 완료 처리 + 이력 기록 + (승인 시) Neo4j 환류 축적
async function completeWork(id, capturedBy, verdict){
  const w = WORKS.find(x=>x.id===id);
  if(!w || w.status==='완료') return null;
  w.status='완료';
  w.robot   = capturedBy!=='direct';
  w.verdict = verdict || '정상';
  w.retake  = (w.verdict==='재검사');
  w.quality = (w.verdict!=='재검사');
  w.lead    = Math.round(w.base * (w.verdict==='재검사'?0.9:0.8));
  w.at      = new Date().toISOString();
  ACTIVITY.unshift({at:w.at, id:w.id, part:w.part, area:w.area, verdict:w.verdict, by:w.robot?'로봇':'직접', text:actText(w)});
  // 환류: 승인(수리/정상)된 작업만 지식그래프에 축적 (HITL). 재검사는 제외.
  w.hwanryu = false;
  if(w.verdict!=='재검사'){
    try{
      await cypher(Q_VERIFY_WRITE, {id:'V-'+w.id+'-'+Date.now(), part:w.part, ac:w.ac,
        cond:w.defect, verdict:w.verdict, by:'정비사', at:w.at});
      w.hwanryu = true;
      console.log('  ↻ 환류 축적: '+w.id+' ('+w.part+' '+w.defect+') → Neo4j VerifiedCase');
    }catch(e){ console.log('  ! 환류 실패: '+e.message); }
  }
  return w;
}

async function buildDashboard(){
  const W = WORKS, cnt = f => W.filter(f).length, done = W.filter(w=>w.status==='완료');
  const waiting = W.filter(w=>w.status!=='완료');
  // ── 오늘 현황
  const today = { total:W.length, done:done.length, ongoing:waiting.length,
                  urgent:cnt(w=>w.risk==='긴급'), delayed:cnt(w=>w.status!=='완료'&&w.risk==='긴급') };
  // ── 품질·활용
  const ops = { defects:cnt(w=>w.status==='완료'&&w.defect!=='이상없음'), retake:cnt(w=>w.retake),
                robotRate: done.length?Math.round(done.filter(w=>w.robot).length/done.length*100):0,
                approvalWait:cnt(w=>w.status==='완료'&&w.verdict==='수리') };
  // ── 병목 (라이브 파생)
  const bottleneck = { '검사 대기':waiting.length,
                       '승인 대기':cnt(w=>w.status==='완료'&&w.verdict==='수리'),
                       '재검사':cnt(w=>w.retake) };
  // ── 결함 Top3 (완료 기준)
  const dm={}; W.forEach(w=>{ if(w.status==='완료'&&w.defect!=='이상없음') dm[w.defect]=(dm[w.defect]||0)+1; });
  const defectTop = Object.entries(dm).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([name,n])=>({name,n}));
  // ── HERO ① 작업효율(실측)
  const redu = done.filter(w=>w.base&&w.lead).map(w=>(w.base-w.lead)/w.base);
  const efficiency = redu.length?Math.round(redu.reduce((a,b)=>a+b,0)/redu.length*100):0;
  const savedMin = done.reduce((a,w)=>a+((w.base&&w.lead)?(w.base-w.lead):0),0);
  // ── HERO ② 정비품질(실측)
  const quality = done.length?Math.round(done.filter(w=>w.quality).length/done.length*100):0;
  // ── 지식그래프 기반 KPI (Neo4j 연결) — 관리자는 그래프에서 KPI를 도출
  let gCases=null, gVerified=null, gParts=null, gDefTypes=null, gProc=null, gTool=null, gTop=[];
  try{ gCases   =(await cypher('MATCH (c:ExternalCase) RETURN count(c) AS n',{}))[0].n; }catch(e){}
  try{ gVerified=(await cypher('MATCH (v:VerifiedCase) RETURN count(v) AS n',{}))[0].n; }catch(e){}
  try{ gParts   =(await cypher('MATCH (p:Part) RETURN count(p) AS n',{}))[0].n; }catch(e){}
  try{ gDefTypes=(await cypher('MATCH (d:Defect) RETURN count(DISTINCT d.name) AS n',{}))[0].n; }catch(e){}
  try{ gProc    =(await cypher('MATCH (p:Procedure) RETURN count(p) AS n',{}))[0].n; }catch(e){}
  try{ gTool    =(await cypher('MATCH (t:Tool) RETURN count(DISTINCT t.name) AS n',{}))[0].n; }catch(e){}
  try{ gTop     = await cypher('MATCH (d:Defect)-[r:OCCURS_ON]->(:Part) RETURN d.name AS name, sum(r.weight) AS n ORDER BY n DESC LIMIT 4',{}); }catch(e){ gTop=[]; }
  // ── 지연·위험 알림 (미완료 긴급)
  const alerts = W.filter(w=>w.status!=='완료'&&w.risk==='긴급')
    .map(w=>({id:w.id, part:w.part, defect:w.defect, risk:w.risk, why:'긴급'}));
  // 상단 알림 스트립 — 문제만 (정상이면 빈 배열)
  const strip = [];
  if(today.delayed>0) strip.push({label:'🔴 긴급 '+today.delayed});
  const roboErr = PAIRS.filter(p=>p.rst==='오류').length;
  if(roboErr>0) strip.push({label:'🤖 로봇 오류 '+roboErr});
  return {
    generatedAt:new Date().toISOString(),
    today, ops, bottleneck, defectTop, alerts, strip,
    pairs: PAIRS, fleet: fleetOf(PAIRS),
    activity: ACTIVITY.slice(0,8),
    hero:{
      efficiency:{title:'작업 효율', metric:'평균 리드타임 단축률', now:efficiency, unit:'%', target:20,
                  note:`오늘 절감 ${savedMin}분 ≈ ${(savedMin/60).toFixed(1)}시간`, kind:'실측', up:true},
      quality:   {title:'정비 품질', metric:'증빙·기록 완결률', now:quality, unit:'%', target:95, kind:'실측', up:true},
      economy:   {title:'경제 효과', metric:'로봇 1대 회수 (0.5 FTE)', now:'1,040h', unit:'/년',
                  target:'3,100~4,000만원', note:'투자회수 2~4년', kind:'검증 목표', up:true},
      capability:{title:'역량 향상', metric:'신입–숙련 작업시간 격차', before:45, now:18, unit:'%',
                  note:'신입도 숙련자 수준으로', kind:'검증 목표', up:false},
    },
    trend:{labels:['6주전','5주전','4주전','3주전','2주전','지난주'],
           efficiency:[8,11,14,17,20,efficiency], quality:[78,82,86,88,90,quality], kind:'시뮬'},
    graph:{ connected: gParts!=null, cases:gCases, verified:gVerified, parts:gParts,
            defectTypes:gDefTypes, procedures:gProc, tools:gTool,
            defectTop:(gTop||[]).map(x=>({name:x.name, n:x.n})) },
  };
}

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
    // GET(?q=) 또는 POST({q, history:[{role,text}]}) 둘 다 지원
    let q='', history=[];
    if(req.method === 'POST'){
      try{ const p = JSON.parse(await readBody(req) || '{}'); q = p.q || ''; history = p.history || []; }catch(e){}
    } else {
      q = u.searchParams.get('q') || '';
    }
    try{
      // LLM 켜져 있으면 RAG+LLM 우선. 실패하면 아래 규칙 기반으로 자동 fallback.
      if(LLM_ON){
        try{
          const out = await answerLLM(q, history);
          return json(res, {q, part:out.part, mode:'llm', answer:out.answer});
        }catch(e){ console.log('  ! LLM fallback('+e.message+') → 규칙 기반'); }
      }
      const intent = classifyIntent(q);        // ① 의도 (규칙)
      // ② 지식 조회 — Neo4j 죽어있어도 500 대신 빈 데이터로 우아하게 처리
      let part='SKIN', data=null, procs=[];
      try{ part = await resolvePart(q) || 'SKIN'; }catch(e){}
      try{ data = (await cypher(Q_PART, {part}))[0] || null; }catch(e){}
      try{ procs = await cypher(Q_PROCEDURE, {part}); }catch(e){}
      const answer = composeAnswer(intent, part, data, procs);  // ③ 답변 생성
      return json(res, {q, intent, part, mode:'rule', answer});
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

  // API: 오늘의 작업 목록 (정비사 앱 첫 화면)
  if(u.pathname === '/api/works'){
    return json(res, WORKS.map(w=>({id:w.id, ac:w.ac, part:w.part, area:w.area, defect:w.defect,
      risk:w.risk, status:w.status, tech:w.tech, verdict:w.verdict})));
  }
  // API: 정비사 판정 → 작업 완료 (관리자 대시보드에 실시간 반영 + 이력 기록)
  if(u.pathname === '/api/works/complete' && req.method==='POST'){
    try{
      const p = JSON.parse(await readBody(req) || '{}');
      const w = await completeWork(p.id, p.capturedBy, p.verdict);
      return json(res, {ok:!!w, work:w});
    }catch(e){ return json(res, {error:e.message}, 500); }
  }

  // API: 케이스 브라우저 (지식 탭) — Neo4j 검증사례(환류) + 외부사례(FAA SDR) 읽기 전용
  if(u.pathname === '/api/cases'){
    try{
      const kor = n => KORD[n] || n || '-';
      let V=[], E=[];
      try{ V = await cypher(`
        MATCH (v:VerifiedCase)
        OPTIONAL MATCH (v)-[:ON_PART]->(p:Part)
        RETURN v.id AS id, v.aircraft AS aircraft, v.condition AS defect, v.action AS action,
               v.approvedBy AS by, v.approvedAt AS at, v.source AS source, coalesce(p.name, v.partName) AS part
        ORDER BY v.approvedAt DESC LIMIT 40`, {}); }catch(e){}
      try{ E = await cypher(`
        MATCH (c:ExternalCase) WHERE c.summary IS NOT NULL
        RETURN c.aircraft AS aircraft, c.condition AS defect, c.summary AS summary,
               c.partName AS part, c.fsFrom AS fs, c.stringer AS str LIMIT 12`, {}); }catch(e){}
      const verified = V.map((v,i)=>{
        const checks = {photo:1, verdict:1, action:(v.action?1:0), wo:1}; // 환류 승인건 = 완결
        return { id: v.id || ('VC-'+String(i+1).padStart(4,'0')), src:'검증사례',
          at: v.at || '', aircraft: v.aircraft || '-', part: v.part || '-',
          defect: kor(v.defect), verdict: v.action || '정상 판정', by: v.by || '정비사',
          capture:'로봇/직접', poc: v.source==='PoC시연',
          checks, complete: Object.values(checks).every(x=>x) };
      });
      const external = E.map((c,i)=>{
        const checks = {photo:0, verdict:1, action:0, wo:0}; // 외부 참조 — 내부 증빙 미연결(완결성 미달)
        return { id:'SDR-'+String(i+1).padStart(4,'0'), src:'외부사례', at:'',
          aircraft: c.aircraft || '타사', part: c.part || '-', defect: kor(c.defect),
          verdict:'참조', by:'FAA SDR', capture:'외부 보고', summary:(c.summary||'').slice(0,140),
          checks, complete:false };
      });
      return json(res, { count:verified.length+external.length,
        verifiedN:verified.length, externalN:external.length, cases:[...verified, ...external] });
    }catch(e){ return json(res, {error:e.message}, 500); }
  }

  // API: 관리자 대시보드 (라이브 집계 + 실데이터 + 활동 이력)
  if(u.pathname === '/api/dashboard'){
    try{ return json(res, await buildDashboard()); }
    catch(e){ return json(res, {error:e.message}, 500); }
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

// POST 요청 본문 읽기 (대화기록 수신용)
function readBody(req){
  return new Promise((resolve)=>{
    let d=''; req.on('data',c=>{ d+=c; if(d.length>1e6) d=d.slice(0,1e6); });
    req.on('end',()=>resolve(d)); req.on('error',()=>resolve(''));
  });
}

// ── 시작 시 연결 점검 ──────────────────────────────────────
server.listen(PORT, async ()=>{
  console.log('\n  MRO Copilot 서비스 서버');
  console.log('  ─────────────────────────────');
  try{
    const r = await cypher('MATCH (p:Part) RETURN count(p) AS n',{});
    console.log('  ✓ Neo4j 연결 성공 — 부품 노드 '+r[0].n+'개');
  }catch(e){
    console.log('  ✗ Neo4j 연결 실패: '+e.message+' (근거 조회 제한 — 비번 확인)');
  }
  // LLM·현장용어 상태는 Neo4j 성패와 무관하게 항상 표시
  console.log('  ✓ 현장용어사전 '+FIELD_TERMS.length+'개 로드');
  console.log('  '+(LLM_ON?'✓ LLM 켜짐 — '+LLM_PROVIDER+' ('+LLM_MODEL+')':'· LLM 꺼짐 — 규칙 기반 (API 키 없음)'));
  console.log('  ✓ 브라우저에서 열기:  http://localhost:'+PORT+'\n');
});
