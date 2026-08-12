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

| 유형 | 파일 | 출처 |
| --- | --- | --- |
| 부식·마모 | `corrosion-1~3`, `wear-1~3` | **AeBAD** `ablation` |
| 균열 | `crack-1~3` | **AeBAD** `fracture` |
| 손상 | `damage-1~3` | **AeBAD** `breakdown` |
| 긁힘 | `scratch-1~3` | **AeBAD** `groove` |
| 찍힘 | `dent-1~2` | Zhang et al., *Sci Rep* 12:13067 (2022) Fig.14 보어스코프 |

**AeBAD** (Aero-engine Blade Anomaly Detection) — Zhang et al.,
*Industrial anomaly detection with domain shift: A real-world dataset and masked
multi-scale reconstruction*. https://github.com/zhangzilongc/MMR · **CC BY 4.0**

**보어스코프 이미지** — Li et al., *Deep learning-based defects detection of certain
aero-engine blades and vanes with DDSC-YOLOv5s*, Scientific Reports 12, 13067 (2022).
https://doi.org/10.1038/s41598-022-17340-7 · **CC BY 4.0**

> 발표·제안 자료에 위 두 출처를 반드시 표기하세요.

## 표기 주의
- 사진은 **세로로 긴 원본을 눕혀** 16:9(996×560)로 맞췄습니다.
  PoC 시나리오(분해한 블레이드를 스탠드에 눕히고 로봇이 위에서 촬영)와 그림을 맞추기 위함입니다.
- `corrosion-*` 은 AeBAD 의 **ablation(소착·삭마)** 이미지입니다. 엄밀히는 부식과 다른 결함이지만,
  표면 재료 손실이라는 점에서 가장 가까워 부식 항목에 배정했습니다.
  시연에서 정비사가 물으면 "공개 데이터셋 제약으로 표면 손상 이미지를 대체 사용했다"고 답하면 됩니다.
