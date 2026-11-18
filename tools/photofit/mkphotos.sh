# mkphotos.sh <id> [min IoU]: photos.txt from the auto fits that matched well
cd "$(dirname "$0")"
id=$1; min=${2:-0.78}
grep -a "IoU" $id/auto.log | awk -v m=$min '$3+0 >= m {print $1" down net"}' | sort -u > $id/photos.txt
wc -l < $id/photos.txt
