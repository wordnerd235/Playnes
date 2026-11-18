# tprep.sh <id> : make sure every photo in <id>/photos.txt (file cfg mode) has a 320 px mask
cd "$(dirname "$0")"
while read f cfg mode crop; do [ -z "$f" ] && continue
  grep -q '"m2"' ${f%.jpg}.seg.json 2>/dev/null || ${PY:-python3} seg.py $f $mode $crop > /dev/null
done < $1/photos.txt
