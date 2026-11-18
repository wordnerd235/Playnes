# auto.sh <id> <model> [max]: fetch, cut out, check and fit up to <max> photos for one playne
cd "$(dirname "$0")"
id=$1; model=$2; max=${3:-14}; P=${PY:-python3}
idx=$($P -c "
import json,re; d=json.load(open('$id/index.json'))
bad=re.compile(r'cockpit|interior|cabin|panel|seat|engine|wheel|detail|logo|model|toy|display case|close', re.I)
print(' '.join(str(e['i']) for e in d if not bad.search(e['title'])))")
[ -f $id/pick.txt ] && idx=$(cat $id/pick.txt)
$P getbig.py $id $idx > /dev/null 2>&1
fs=""; for i in $idx; do f=$(printf "b%03d" $i); [ -f $id/$f.mask.png ] || $P seg.py $id/$f.jpg net > /dev/null 2>&1; fs="$fs $f"; done
good=$($P qual.py $id $fs 2> $id/qual.log | tr ' ' '\n' | head -$max | tr '\n' ' ')
echo "$id good: $good"
specs=""; for f in $good; do specs="$specs $f:net:down:-85,60"; done
PAR=${PAR:-3} bash batch.sh $id $model $specs
echo "AUTO DONE $id"
