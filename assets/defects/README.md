# 결함 실사진 폴더 (assets/defects/)

이 폴더에 결함 유형별 실제 사진을 넣으면, 지식 탭 케이스 상세에서
**사례마다 다른 사진**이 자동으로 배정됩니다. (서버가 폴더를 스캔 → 사례 ID로 선택)

## 파일명 규칙
`{key}-{번호}.jpg` (또는 .png / .webp)

| 결함(한글) | key | 예시 파일명 |
| --- | --- | --- |
| 부식 | `corrosion` | corrosion-1.jpg, corrosion-2.jpg … |
| 균열 | `crack` | crack-1.jpg, crack-2.jpg … |
| 찍힘 | `dent` | dent-1.jpg … |
| 마모 | `wear` | wear-1.jpg … |
| 손상 | `damage` | damage-1.jpg … |
| 천공 | `puncture` | puncture-1.jpg … |
| 긁힘 | `scratch` | scratch-1.jpg … |

## 방법
1. 라이선스 확인된 결함 데이터셋에서 이미지를 받아
2. 위 규칙대로 이름을 바꿔 이 폴더에 넣습니다 (유형당 여러 장 = 사례별 다양)
3. 끝 — 서버 재시작 없이 다음 조회부터 반영됩니다

## 참고
- 이미지가 없는 유형은 자동으로 **유형별 스키매틱 이미지**로 대체됩니다
- 부식은 유형 이미지가 없으면 기존 `assets/corrosion_al.jpg` 로 대체
- 권장 비율: 가로가 조금 긴 사진 (상세 패널이 약 16:9 영역)
- 정리 스크립트: `bash 서비스/scripts/sync-defect-images.sh` (한글 폴더 → 규칙명 자동 복사)

## 출처 · 라이선스 (Attribution) — **CC BY 4.0, 출처 표기 필수**

| 파일 | 원본에 표기된 결함 | 검사 부위 |
| --- | --- | --- |
| `crack-1` | crack 0.40 / 0.87 | LPT 노즐 |
| `dent-1` | dent 0.25 / 0.86 | HPC 3단 |
| `dent-2` | dent 0.78 | 블레이드 리딩엣지 |
| `corrosion-1` | **erosion 0.93** | HPT 노즐 |
| `damage-1` | **TBC missing** | HPT 블레이드 |

**출처** — Li et al., *Deep learning-based defects detection of certain aero-engine
blades and vanes with DDSC-YOLOv5s*, **Scientific Reports 12, 13067 (2022)**, Figure 14.
https://doi.org/10.1038/s41598-022-17340-7 · **CC BY 4.0**

> 발표·제안 자료에 위 출처를 반드시 표기하세요.

## 표기 주의 (시연 중 질문 대비)

- **실제 보어스코프 검사 사진**입니다. 원본의 탐지 박스가 그대로 남아 있습니다
  (해당 논문 모델의 탐지 결과이며, 우리 시스템의 출력이 아닙니다).
- `corrosion-1` 은 원본 라벨이 **erosion(침식)**, `damage-1` 은 **TBC missing(코팅 손실)** 입니다.
  공개 문헌에 항공엔진 블레이드 **부식** 사진이 사실상 없어, 표면 재료 손실로 가장 가까운 것을
  배정했습니다. 물어보면 그대로 답하면 됩니다.
- 사진이 없는 결함(마모·긁힘 등)은 자동으로 **스키매틱 도형**으로 대체됩니다.

## 검토했으나 쓰지 않은 것

- **AeBAD** (github.com/zhangzilongc/MMR, CC BY 4.0) — 실물 블레이드 5,570장.
  ground_truth 마스크로 결함만 정확히 잘라내 봤으나, 결함이 도색된 시편 위의 미세한 형상이라
  **화면에서 균열·부식으로 읽히지 않았습니다.** 이상탐지 학습용이지 사람에게 보여주는 사진이 아닙니다.
- **BladeSynth** (figshare, CC BY) — 합성 렌더링 25.7GB. 실사진 아님.
- 풍력 발전 블레이드 데이터셋 다수 — 재질·크기가 달라 항공엔진 제안에 부적합.
