#!/usr/bin/env bash
# Audit armada CCTV Pemko Batam dari laptop (BUKAN dari klien): 28 GET playlist ~250 B.
# Jalankan sebelum/sesudah rilis atau tiap ada keluhan "kamera nggak bisa dibuka".
#   ENDLIST=1                → stream ditutup (kamera mati)
#   lastmod tua tanpa ENDLIST → beku (playlist nggak di-update, mis. delta2 sejak Jun 2026)
cd "$(dirname "$0")/.." || exit 1
for s in $(grep -o 'slug: "[^"]*"' lib/cctv.ts | cut -d'"' -f2); do
  r=$(curl -s -m 10 -D - "https://matanya.batam.go.id/cctv/$s/stream.m3u8")
  code=$(echo "$r" | head -1 | awk '{print $2}')
  end=$(echo "$r" | grep -c ENDLIST)
  lm=$(echo "$r" | grep -i '^last-modified' | sed 's/last-modified: //I' | tr -d '\r')
  printf "%-16s http=%s ENDLIST=%s lastmod=%s\n" "$s" "$code" "$end" "$lm"
done
