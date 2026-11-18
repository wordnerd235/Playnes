# recheck.sh <id> [src]: re-fit each photo in <id>/photos.txt near its pose with the current (or src) model; redo comparisons
cd "$(dirname "$0")"
id=$1; P=${PY:-python3}
while read f cfg mode rest; do [ -z "$f" ] && continue
  REFIT=1 SRC=$2 node fit.cjs $id $f $cfg > /dev/null 2>&1 && $P comp.py $f
done < $id/photos.txt
