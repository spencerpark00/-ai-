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

## 출처 · 라이선스 (Attribution)
| 유형 | 데이터셋 | 라이선스 |
| --- | --- | --- |
| 균열(crack)·찍힘(dent)·긁힘(scratch) | Roboflow **aircraft-skin-defects-new-dataset** (by Dibya Dillip) | **CC BY 4.0** |
| 부식(corrosion) | (예정) Roboflow **aircraft_skin_defects** (IISc) 등 | CC BY 4.0 / CC0 |

> CC BY 4.0 데이터는 **출처 표기 필수**. 발표·제안 자료에 위 출처를 함께 명시하세요.
> (데이터정의서 부록 3의 비전 데이터셋 목록과 동일)
