# MRO Copilot — 항공정비 Physical AI 서비스

온톨로지(Neo4j 지식그래프) 기반 정비사 지원 서비스.
KT AIVLE School 빅프로젝트 · 수도권 01반 01조 · "항공정비 Physical AI 도입 오케스트레이션"

---

## 🔗 배포 주소 (팀원 공유용)

**https://mro-copilot.onrender.com**

- 링크만 누르면 접속됩니다. (내 PC·Neo4j 안 켜도 됨 — 서버·DB 모두 클라우드)
- ⚠️ 15분간 아무도 안 쓰면 서버가 잠듭니다. **첫 접속 시 최대 50초** 걸릴 수 있어요(무료 서버). 흰 화면이어도 기다리면 뜹니다.
- 발표 직전엔 미리 한 번 열어서 깨워두세요.

### 서비스 3종 (상단 탭 이동)
| 탭 | 화면 | 핵심 |
| --- | --- | --- |
| ① 정비사 단말 | 지식·유사사례 검색 | "동체 외판 부식" 검색 → 실제 결함 통계 + SDR 원문 근거 |
| ② 오케스트레이션 | 사람·AI·로봇 워크플로우 | 작업 6단계 + 승인 게이트(AI는 판정 못 함) |
| ③ 로봇 검사 | 이동형 검사 HUD | 카메라 + AI 이상후보 + Work Card 자동 기록 |

데이터: FAA JASC Code Table(547코드) + FAA SDR 2026(31,582건) — 전부 공개 실데이터.

---

## 🏗️ 배포 구조

```
브라우저  →  Render (앱·클라우드)  →  Neo4j Aura (지식그래프·클라우드)
              무료 웹서비스              무료 그래프 DB
```

| 구성 | 서비스 | 비고 |
| --- | --- | --- |
| 앱(서버+화면) | Render Free | 이 GitHub 저장소를 자동 배포 |
| 지식그래프 DB | Neo4j Aura Free | 노드 1,334 · 관계 2,520 |

**코드 수정 → `git push` → Render 자동 재배포** (URL 유지)

---

## 📁 폴더 구조

```
/  (루트) — 라이브 서비스 파일 (Render가 실행)
├── server.js              서비스 서버 (Node, 무설치)
├── index.html             ① 정비사 단말
├── orchestration.html     ② 오케스트레이션
├── robot.html             ③ 로봇 검사 HUD
├── package.json           서버 설정
├── assets/                이미지
├── docs/                  문서·옛 프로토타입 (배포 무관)
│   ├── 데이터정의서_v3.5.md
│   ├── ontology_demo.html         (정적 프로토타입 — 캡처용)
│   ├── 2_계층구조.html            (정적 프로토타입)
│   └── 3_오케스트레이션.html      (정적 프로토타입)
└── data/                  원천 데이터
    ├── JASC_Code.pdf              FAA 계통 코드표
    ├── SDR-2026.csv               FAA 결함 보고 31,582건
    └── 대표시나리오_확정검토.pdf
```

> **루트의 `orchestration.html`(라이브)** 와 **`docs/3_오케스트레이션.html`(옛 정적본)** 은 다릅니다.
> 실제 서비스는 루트 파일, docs는 캡처·설명용 정적 버전입니다.

---

## 💻 로컬 실행 (개발용)

```
node server.js <Neo4j비밀번호>
```
→ http://localhost:5173

### 환경변수 (클라우드/Aura 연결 시)
| 변수 | 예 |
| --- | --- |
| `NEO4J_URI` | `https://xxxx.databases.neo4j.io` |
| `NEO4J_USER` | 인스턴스 ID 또는 `neo4j` |
| `NEO4J_PW` | (비밀번호 — 코드에 넣지 말 것, Render 환경변수로만) |
| `NEO4J_DATABASE` | 인스턴스 ID 또는 `neo4j` |
| `PORT` | Render가 자동 주입 |

---

## 👥 팀원 참여 (코드 수정 시)

1. 저장소 소유자가 **Settings → Collaborators → Add people**로 초대
2. 초대 수락 후:
   ```
   git clone https://github.com/spencerpark00/-ai-.git
   ```
3. 수정 → `git push` → Render 자동 재배포
