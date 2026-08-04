#!/usr/bin/env bash
# 결함 이미지 정리 스크립트
#   프로토타입/결함 이미지/{균열,마모,부식,찍힘}/*  →  서비스/assets/defects/{key}-N.ext
#   한글 폴더에 사진을 넣고 이 스크립트를 돌리면 규칙대로 복사됩니다.
#   사용:  bash 서비스/scripts/sync-defect-images.sh
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"           # 서비스/scripts
SRC="${1:-$HERE/../../프로토타입/결함 이미지}"   # 기본: 프로토타입/결함 이미지
DST="$HERE/../assets/defects"                    # 서비스/assets/defects
mkdir -p "$DST"

declare -A MAP=( ["균열"]="crack" ["마모"]="wear" ["부식"]="corrosion" ["찍힘"]="dent" ["긁힘"]="scratch" ["손상"]="damage" ["천공"]="puncture" )

for kor in "${!MAP[@]}"; do
  key="${MAP[$kor]}"
  rm -f "$DST/$key-"*.jpg "$DST/$key-"*.jpeg "$DST/$key-"*.png "$DST/$key-"*.webp 2>/dev/null || true
  [ -d "$SRC/$kor" ] || continue
  n=1
  find "$SRC/$kor" -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.webp" \) 2>/dev/null | sort | while read -r f; do
    ext=$(echo "${f##*.}" | tr '[:upper:]' '[:lower:]')
    cp "$f" "$DST/$key-$n.$ext"
    echo "  $kor → $key-$n.$ext"
    n=$((n+1))
  done
done
echo "완료 → $DST"
