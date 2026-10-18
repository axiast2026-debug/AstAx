# Lista di controllo per il lancio (fase 8)

Il lancio in produzione richiede ogni punto spuntato. Il primo blocco dipende da Dan e dai consulenti; il secondo dalle prove in collaudo; il terzo dal giorno del lancio.

## Requisiti legali e contratti

- [ ] Iscrizione di AstAx al RUI, sezione B, con responsabile della distribuzione e RC professionale (art. 112 CAP)
- [ ] Conto separato per i premi o fideiussione (art. 117 CAP)
- [ ] Testi legali validati dal legale e pubblicati nel pannello (il rilascio si blocca altrimenti, `pnpm release:check`, LEG-03)
- [ ] Punti aperti di `docs/punti-aperti.md` chiusi con legale, DPO e commercialista
- [ ] Valutazione d'impatto (DPIA) del DPO, sulla base di `docs/privacy/mappa-dati.md`
- [ ] Contratti e accordi sul trattamento dei dati con ogni fornitore di `docs/privacy/fornitori.md`
- [ ] Contratti con le prime agenzie (incarichi e mandati caricati)

## Prove in collaudo

- [ ] Scenari S01-S10 superati in collaudo con le sandbox vere; rapporto in `docs/collaudo/`
- [ ] Test di contratto di ogni adattatore vero sulle sandbox (`packages/adapters/src/contracts`)
- [ ] Prova IAM dal vivo: il ruolo dell'API non decifra la chiave delle buste; il controllo notturno su CloudTrail gira e un'anomalia simulata produce l'allarme
- [ ] Test di sicurezza esterno senza problemi alti o critici aperti; scansione ZAP pulita o motivata
- [ ] Prova di carico (`tests/load`): chiusure entro 5 secondi, p95 sotto 300 ms, nessun errore
- [ ] Prova di ripristino dai backup con tempi scritti in `docs/ripristino.md`
- [ ] Misura della lettura AI sugli 80 documenti: almeno il 95% di campi corretti sopra soglia
- [ ] Testi in albanese del back office riletti (proposta K della fase 7)
- [ ] Demo di Dan sul telefono vero (S01 completo)

## Il giorno del lancio

- [ ] DNS di `astax.it` verso il bilanciatore, DKIM e MAIL FROM di SES verificati, SES fuori dalla sandbox
- [ ] Mittente SMS «AstAx» registrato per l'Italia
- [ ] Segreti di produzione in Secrets Manager; nessun fornitore finto (`pnpm release:check`)
- [ ] Allarmi verso il reperibile e turni di reperibilità (`docs/incidenti.md`)
- [ ] Sentry e Grafana collegati alla produzione
- [ ] Rilascio con l'approvazione di Dan (ambiente GitHub «produzione»)
- [ ] Primo controllo dopo il rilascio: accesso, preventivo di prova, notifiche, registro (`pnpm audit:verify`)
