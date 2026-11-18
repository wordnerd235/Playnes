# batch.sh <id> <model> "<b###:sky|grab:gear:elmin,elmax> ..."   (runs 4 at a time)
cd "$(dirname "$0")"
id=$1; model=$2; shift 2
P=${PY:-python3}
run() { IFS=: read f mode gear el <<< "$1"; [ -f $id/$f.seg.json ] || $P seg.py $id/$f.jpg $mode > /dev/null; node fit.cjs $model $id/$f.jpg $gear $el && $P comp.py $id/$f.jpg; }
n=0
for spec in $@; do run $spec & n=$((n+1)); if [ $n -ge ${PAR:-4} ]; then wait -n; n=$((n-1)); fi; done
wait
