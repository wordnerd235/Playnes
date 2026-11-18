# tdaemon.sh: runs tuning jobs from tq.txt one after another ("id photos params rounds log" per line)
cd "$(dirname "$0")"
while true; do
  while pgrep -f "tqueue.sh" > /dev/null; do sleep 20; done
  line=$(grep -v '^#' tq.txt | while read id ph pa r log; do grep -aq "TUNE DONE" $id/$log 2>/dev/null || { echo "$id $ph $pa $r $log"; break; }; done)
  [ -z "$line" ] && { sleep 30; continue; }
  read id ph pa r log <<< "$line"
  bash tprep.sh $id
  node tune.cjs $id $ph $pa $r > $id/$log 2>&1; echo TUNE DONE >> $id/$log
done
