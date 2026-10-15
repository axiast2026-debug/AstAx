# Glossario

Nel codice i nomi sono in inglese; nei documenti e nell'interfaccia in italiano. Questa tabella fissa la corrispondenza: usa sempre il nome della colonna «Nel codice», senza sinonimi.

## Attori e organizzazioni

| Termine | Nel codice | Significato |
| --- | --- | --- |
| AstAx | `AstAx`, organizzazione di tipo `ASTAX` | La società che gestisce la piattaforma; broker iscritto in sez. B, intermediario proponente |
| Organizzazione | `Organization` (`AGENCY`, `BROKER`, `ASTAX`) | Agenzia, broker richiedente o AstAx stessa |
| Agenzia | `Organization` di tipo `AGENCY` | Agente sez. A con mandati RCA; intermediario emittente |
| Broker richiedente | `Organization` di tipo `BROKER` | Broker sez. B che chiede preventivi per i propri clienti |
| Privato | utente di tipo `PRIVATE` | Consumatore che chiede un preventivo per sé |
| Cliente del broker | `Customer` con `ownerOrganizationId` | Cliente finale del broker; accede solo tramite link |
| Utente | `User` | Una persona che accede; può avere più appartenenze |
| Appartenenza / contesto | `Membership` | Legame utente-organizzazione con ruolo e abilitazioni; il contesto attivo è l'appartenenza scelta nel selettore |
| Titolare | ruolo `OWNER` | Responsabile dell'organizzazione sulla piattaforma |
| Supervisore | ruolo `SUPERVISOR` | Gestisce le offerte di tutti gli utenti dell'agenzia |
| Operatore, sub-agente | ruolo `OPERATOR` | Collaboratore (spesso sez. E) dell'agenzia o del broker |
| Operatore verifica | ruolo `BO_VERIFIER` | Back office: verifica richieste e apre aste |
| Assistenza | ruolo `BO_SUPPORT` | Back office: risponde a clienti, broker e agenzie |
| Contabilità | ruolo `BO_ACCOUNTING` | Back office: incassi, rimesse, fatture |
| Supervisore back office | ruolo `BO_SUPERVISOR` | Back office: eccezioni, rimborsi, penali, reclami |
| Amministratore | ruolo `ADMIN` | Configura regole, economia e accessi |
| Abilitazioni | `canIssue`, `canSeeColleagueOffers`, `canSeeAccounting`, `seesAllClients` | Permessi aggiuntivi che il titolare dà a un'appartenenza |
| Compagnia | `InsuranceCompany` | Impresa di assicurazione |
| Mandato | `AgencyMandate` | Compagnia per cui l'agenzia può emettere, verificata sul RUI |
| RUI | `RuiRecord` | Registro Unico degli Intermediari (IVASS), sezioni A, B, E |
| Filtri dell'agenzia / personali | `AgencyFilter`, `MemberFilter` | Criteri delle richieste che l'agenzia o l'utente vuole ricevere |
| Capacità | `AgencyCapacity` | Massimo di richieste al giorno, orari di ricezione, pausa |

## Richiesta e dati del preventivo

| Termine | Nel codice | Significato |
| --- | --- | --- |
| Richiesta (di preventivo) | `QuoteRequest` | Domanda di preventivo RCA per un veicolo |
| Richiedente | `requester` | Il privato o il broker che ha creato la richiesta |
| Canale | `channel` (`PRIVATE`, `BROKER`) | Chi ha creato la richiesta |
| Dati del preventivo | `QuoteData` | Fotografia versionata di persone, veicolo, storia e scelte, congelata all'invio |
| Persona | `Person` | Persona fisica o giuridica: contraente, proprietario o conducente |
| Contraente | `policyHolder` | Chi stipula la polizza |
| Proprietario | `vehicleOwner` | Intestatario del veicolo |
| Conducente abituale | `mainDriver` | Chi guida di solito il veicolo |
| Veicolo | `Vehicle` | Il veicolo da assicurare |
| Targa | `plate` | Targa italiana |
| Libretto di circolazione | documento `REGISTRATION_CERTIFICATE` | Carta di circolazione |
| Patente | documento `DRIVING_LICENCE` | Patente di guida |
| Attestato di rischio | documento `RISK_CERTIFICATE` | Storia assicurativa: classe CU, sinistri, scadenza |
| Classe CU | `cuClass` | Classe di conversione universale, da 1 a 18 |
| Sinistri | `claimsHistory` | Sinistri degli ultimi 5 anni per anno e responsabilità |
| IUR | `riskUniqueId` | Identificativo univoco del rischio |
| Provenienza | `provenance` | Prima immatricolazione, usato senza attestato, altra compagnia, RC familiare |
| Formula di guida | `drivingFormula` (`FREE`, `EXPERT`, `EXCLUSIVE`) | Libera, esperta, esclusiva |
| Scatola nera | `blackBox` | Accettazione del dispositivo telematico |
| Decorrenza | `startDate` | Data da cui vale la polizza |
| Frazionamento | `paymentFrequency` (`ANNUAL`) | Solo annuale nell'MVP |
| Premio attuale | `currentPremiumCents` | Facoltativo; serve a mostrare il risparmio |
| Pacchetto | `CoveragePackage` (`BASE`, `PLUS`, `COMPLETE`) | Coperture minime che ogni offerta deve rispettare |
| Massimale | `...LimitEur` | Limite di copertura, in euro interi |
| Franchigia | `deductibleEur` | Importo fisso a carico dell'assicurato |
| Scoperto | `coinsurancePct`, `coinsuranceMinEur` | Percentuale a carico dell'assicurato, con minimo |
| Rinuncia alla rivalsa | `recourseWaiver` | La compagnia rinuncia a rivalersi in certi casi |
| Caso escluso | `ExclusionRule` | Profilo che non va all'asta |
| Consenso | `Consent` | Consenso privacy, in particolare alla condivisione con le agenzie |
| Verifica | `Verification` | Controllo del back office prima dell'asta, con checklist |
| Integrazione richiesta | stato `INTEGRATION_REQUESTED` | Il richiedente deve completare dati o documenti |

## Asta e offerte

| Termine | Nel codice | Significato |
| --- | --- | --- |
| Asta | `Auction` | Un giro d'asta di una richiesta |
| Giro | `Auction.kind` (`MAIN`, `REOPEN`, `RECONFIRMATION`) | Asta principale, riapertura della deserta, riconferma |
| Ore lavorative | `WorkingCalendar` | Calendario che conta solo orari lavorativi e giorni non festivi |
| Invito | `Invitation` | Un'agenzia invitata a un giro d'asta |
| Rabbocco | `TOP_UP` | Inviti aggiunti a metà asta se ci sono poche offerte |
| Presa in carico | `Claim` | Blocco della richiesta da parte di un utente dell'agenzia |
| Rinuncia | `Decline` | «Non interessato», con motivo facoltativo |
| Offerta | `Offer` | Proposta vincolante di un'agenzia |
| Busta chiusa | sealed bid | Offerta cifrata fino alla chiusura |
| Copia per l'agenzia | owner copy | Copia cifrata che l'agenzia può rileggere durante l'asta |
| Prezzo garantito | `guaranteeUntil` | Data fino a cui l'agenzia garantisce il prezzo |
| Validità minima | `minValidityDays`, `minGuaranteeDate` | Garanzia minima richiesta dal richiedente |
| Riconferma | `Auction` di tipo `RECONFIRMATION` | Nuovo giro chiuso, con le stesse agenzie, dopo la scadenza delle garanzie |
| Premio lordo annuo | `annualGrossPremiumCents` | Premio con imposte e contributo SSN |
| Prodotto | `InsuranceProduct` | Prodotto della compagnia, con il set informativo |
| Set informativo | documenti `PRODUCT_INFO` | DIP, DIP aggiuntivo, condizioni di assicurazione |
| Classifica | `Ranking` | Ordine delle offerte valide, pubblicato alle agenzie |
| Migliore offerta per compagnia | `bestOfferPerCompany()` | Ciò che vede il richiedente |
| Confronto con AI | `AiSuggestion` | Suggerimento qualità/prezzo per i privati |

## Accettazione, pagamento, emissione

| Termine | Nel codice | Significato |
| --- | --- | --- |
| Accettazione | `Acceptance` | Scelta di un'offerta da parte del cliente |
| Firma FEA | `SignatureEnvelope` | Firma elettronica avanzata con OTP |
| Informativa precontrattuale (MUP) | documento `PRECONTRACTUAL_DISCLOSURE` | Informativa su intermediari, compagnia, compensi |
| Lettera di incarico | documento `ENGAGEMENT_LETTER` | Incarico del privato ad AstAx come broker |
| Pagamento | `Payment` | Incasso di premio ed eventuale fee |
| Conto separato | `segregatedAccount` | Conto dei premi (art. 117 CAP) |
| Fee | `customerFee`, `brokerFee`, `agencyFee` | Compensi fissi di AstAx |
| Emissione | `Issuance` | Emissione della polizza da parte dell'agenzia |
| Termine di emissione | `issuanceDeadlineAt` | Ora entro cui emettere |
| Mancata emissione | `MISSED_ISSUANCE` | Polizza non emessa in tempo o non emettibile |
| Polizza | `Policy` | Contratto emesso |
| Quietanza | documento `PREMIUM_RECEIPT` | Ricevuta del premio |
| Certificato | documento `INSURANCE_CERTIFICATE` | Certificato di assicurazione |
| Rimessa | `Remittance` | Trasferimento settimanale del premio netto all'agenzia |
| Fattura, nota di credito | `Invoice`, `CreditNote` | Documenti fiscali dei fee |
| Imposta di bollo | `stampDutyCents` | Bollo sulle fatture esenti sopra soglia |
| Rimborso | `Refund` | Restituzione di premio o fee |
| Recesso | `ConsumerWithdrawal` | Diritto di ripensamento del consumatore (diverso dall'offerta «ritirata», `WITHDRAWN`) |
| Annullamento | `Cancellation` | Chiusura della richiesta da parte del richiedente o del back office |
| Penale | `Penalty` | Addebito all'agenzia per violazioni |
| Sospensione, esclusione | `SUSPENDED`, `EXCLUDED` | Stati dell'organizzazione |
| Rinnovo | `Renewal` | Nuova asta 30 giorni prima della scadenza |
| Questionario post-vendita | `PostSaleSurvey` | Domande al cliente dopo l'emissione |

## Controllo e sicurezza

| Termine | Nel codice | Significato |
| --- | --- | --- |
| Registro attività | `AuditLog` | Registro immutabile di accessi e azioni sensibili |
| Cronologia | `DomainEvent` | Eventi di una richiesta mostrati agli utenti |
| Segnalazione | `Flag` (`CIRCUMVENTION`, `FRAUD`) | Sospetto di aggiramento o frode |
| Aggiramento | circumvention | Contatto del cliente fuori piattaforma senza aver vinto |
| Reclamo | `Complaint` | Reclamo formale, risposta entro 45 giorni |
| Parametro | `Setting` | Valore configurabile con storico delle versioni |
| Elenco di valori | `ListValue` | Voci modificabili dall'amministratore (tipi di veicolo, motivi…) |
| Documento legale | `LegalDocument`, `LegalDocumentVersion` | Testi legali con versioni |
| Accettazione di un documento legale | `LegalAcceptance` | Chi ha accettato quale versione, e quando |
| Filigrana | watermark | Agenzia, utente, data e ora impressi sui documenti |
| Indice cieco | blind index | HMAC per cercare un dato cifrato |
| Orologio | `Clock` | Unica fonte dell'ora nel codice, sostituibile nei test |
