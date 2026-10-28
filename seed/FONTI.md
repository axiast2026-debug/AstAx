# Fonti dei dati di riferimento

| File | Contenuto | Fonte | Licenza |
| --- | --- | --- | --- |
| `comuni.csv` | Comuni italiani: codice ISTAT, codice catastale, sigla della provincia, nome | ISTAT, «Elenco dei codici e delle denominazioni delle unità territoriali» (`pnpm reference:municipalities`) | CC BY 4.0 |
| `cap.csv` | CAP di ogni comune (più CAP separati da `\|`) | GeoNames, elenco dei codici postali dell'Italia, https://download.geonames.org/export/zip/ (`pnpm reference:postal-codes <IT.txt>`) | CC BY 4.0, «GeoNames» |

I CAP di GeoNames non sono l'elenco ufficiale di Poste Italiane: coprono circa il 97,5% dei comuni (mancano soprattutto i comuni nati da fusioni recenti) e il cliente può sempre scrivere o correggere il CAP (domanda 34 di `docs/domande-aperte.md`).
