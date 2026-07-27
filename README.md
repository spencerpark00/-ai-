# MRO Copilot — 항공정비 Physical AI 서비스

온톨로지(Neo4j 지식그래프) 기반 정비사 지원 서비스. KT AIVLE School 빅프로젝트.

## 서비스 3종
- `/` — 정비사 지원 단말 (지식·유사사례 검색)
- `/orchestration.html` — 사람·AI·로봇 오케스트레이션
- `/robot.html` — 이동형 검사 로봇 HUD

## 실행 (로컬)
```
node server.js <Neo4j비밀번호>
```

## 환경변수 (클라우드/Aura)
| 변수 | 예 |
| --- | --- |
| `NEO4J_URI` | `https://xxxx.databases.neo4j.io` |
| `NEO4J_USER` | `neo4j` 또는 인스턴스 ID |
| `NEO4J_PW` | (비밀번호) |
| `NEO4J_DATABASE` | `neo4j` 또는 인스턴스 ID |
| `PORT` | (Render가 자동 주입) |

데이터: FAA JASC Code Table + FAA SDR 2026 (공개 실데이터)
