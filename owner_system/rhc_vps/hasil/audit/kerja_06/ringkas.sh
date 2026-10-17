#!/bin/bash
# ringkas hasil arena beberapa varian: nama | equity | trade | win | PF | DD
for r in "$@"; do f=$r/arena.txt; [ -f $f ] || continue
 eq=$(grep -o 'akun \$100 -> \$[0-9.]*' $f | sed 's/.*\$//'); tr=$(grep -o 'tutup [0-9]*' $f | head -1 | cut -d' ' -f2)
 w=$(grep -o '^win [0-9.]*%' $f | cut -d' ' -f2); pf=$(grep -o 'PF [0-9.inf]*' $f | head -1 | cut -d' ' -f2); dd=$(grep -o 'DD maks [0-9.]*%' $f | cut -d' ' -f3)
 echo "$r | \$$eq | $tr | $w | $pf | $dd"; done
