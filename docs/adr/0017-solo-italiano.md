# 0017 — AstAx solo in italiano, anche nel back office

- **Data:** 2026-10-22
- **Stato:** accettata (Dan, 2026-10-22: «non voglio che ci sia nessuna traduzione in albanese nemmeno nel back office, deve essere tutto esclusivamente in italiano»)
- **Riferimenti:** CLAUDE.md, «Lingue»; specifiche 01 e 09

## Contesto

Dalla fase 1 il back office era in italiano e in albanese: un selettore nella barra in alto, un file di traduzioni `sq.json`, la lingua salvata su ogni utente, i testi delle notifiche al back office anche in albanese, le etichette albanesi di elenchi, casi esclusi, pacchetti e festività, la lingua della risposta di ticket e reclami.

## Decisione

1. **Una sola lingua, l'italiano**, per il sito, il back office, le notifiche, le email e i documenti.
2. **Via dal codice:** il selettore e il file `apps/admin/messages/sq.json`; la scelta della lingua nel profilo (`PATCH /me`, che serviva solo a quello); la lingua nei formattatori (`@astax/shared/format`) e nel motore dei testi delle notifiche; i campi albanesi nei moduli di elenchi, festività, pacchetti, casi esclusi, comunicazioni, ticket e reclami.
3. **Via dai dati:** la migrazione `20261029090000_solo_italiano` toglie le colonne `User.locale`, `SupportTicket.locale`, `Complaint.complainantLocale`, `ListValue.labelSq`, `ExclusionRule.messageSq`, `ExclusionRuleVersion.messageSq`, `CoveragePackageVersion.customerTextSq`, `Holiday.nameSq`, il tipo `Locale` e le versioni albanesi dentro i testi delle notifiche salvati. I file di partenza (`seed/notifiche.yaml`, `seed/elenchi.json`) non hanno più l'albanese.
4. **I testi restano solo nei file di traduzione**, in italiano: la regola che vieta testi scritti nei componenti non cambia.

## Alternative considerate

| Alternativa | Perché no |
| --- | --- |
| Togliere l'albanese dall'interfaccia e lasciare le colonne vuote | Dan ha chiesto di togliere anche colonne e lingua nel database |

## Conseguenze

- Le etichette albanesi già salvate nel database si perdono con la migrazione: non servono più e non si recuperano.
- Il punto per il legale sui dati trattati dall'Albania (`docs/punti-aperti.md`) resta: riguarda dove lavorano le persone del back office, non la lingua.
- Le fasi chiuse (`fasi/`) e le sessioni passate in `docs/stato.md` raccontano ancora il back office in albanese: sono la storia del progetto e non si riscrivono.
