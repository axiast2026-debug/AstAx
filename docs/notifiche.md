# Notifiche

I testi di tutte le notifiche sono in [`../seed/notifiche.yaml`](../seed/notifiche.yaml): italiano per tutti, albanese in più per quelle che arrivano al back office. In fase 7 il seed li carica in `NotificationTemplate`, dove l'amministratore può modificarli; fino ad allora il codice li legge dal file.

## Canali

| Canale | Uso | Note |
| --- | --- | --- |
| In app (`in_app`) | Sempre | Centro notifiche con contatore delle non lette |
| Push (`push`) | Eventi con un'azione da fare | Web Push sulla PWA e sul browser dei professionisti |
| Email (`email`) | Riepiloghi e link | Mittente «AstAx», firma DKIM |
| SMS (`sms`) | Solo codici OTP e link al cliente del broker | Mittente «AstAx» |
| WhatsApp | Fase 2 | Canale previsto ma spento |

Ogni utente sceglie i canali per evento nel profilo. Restano sempre attivi: le notifiche con `mandatory: true` (codici, link indispensabili) e la push per gli avvisi con una scadenza (`forcePush: true`: asta in chiusura, termine di emissione, riconferma, seconda offerta, garanzia in scadenza).

## Regole sui contenuti

- Nessun dato personale di terzi nelle notifiche: niente nomi, codici fiscali, telefoni o email dei clienti verso le agenzie. Il dettaglio si apre nell'app, con il link.
- Verso le agenzie `{{veicolo}}` è solo marca e modello; la targa si vede nell'app.
- Nessun prezzo di altre agenzie, mai. Prima della pubblicazione della classifica, nessuna posizione.
- Gli importi arrivano già formattati («505,00 €»); le date nel fuso di Roma e nella lingua del destinatario («martedì 14 ottobre alle 10:30» / «e martë, 14 tetor, ora 10:30»).
- Le variabili con valori di elenco (stato dell'offerta, motivo, pacchetto) usano l'etichetta nella lingua del destinatario.
- Una variabile vuota non lascia spazi doppi o righe vuote: il motore dei modelli le pulisce.
- I link portano alla pagina giusta e richiedono l'accesso; i link al cliente del broker richiedono un codice OTP.
- Le email hanno anche la versione solo testo. Il piè di pagina con il link alle preferenze lo aggiunge il motore.

## Destinatari

| Destinatario nel file | Chi riceve in pratica |
| --- | --- |
| `requester` | Il privato; per il broker, l'utente che segue la richiesta e il titolare |
| `broker_client` | Il cliente del broker, con i contatti inseriti dal broker |
| `invited_agency_users` | Gli utenti dell'agenzia invitata che possono vedere la richiesta (tutti, oppure quelli con i filtri compatibili, secondo la distribuzione scelta dall'agenzia) |
| `participating_agency_users` | Chi ha preso in carico o offerto, più titolare e supervisore |
| `winning_agency_users` | Titolare, supervisore, chi ha offerto e gli operatori con `canIssue` |
| `agency_owner` | Titolare, più il supervisore con `canSeeAccounting` per gli eventi contabili |
| `invited_agency_users_without_offer` | Come `invited_agency_users`, solo per le agenzie che non hanno ancora offerto |
| `agencies_with_valid_offer` | `participating_agency_users` delle agenzie con un'offerta valida nell'ultimo giro |
| `organization_owner` | Titolare dell'organizzazione |
| `bo_verifiers`, `bo_supervisors`, `bo_accounting` | Utenti del back office con quel ruolo |
| `admins` | Amministratori |
| `user`, `payer`, `invoice_recipient`, `refund_recipient`, `complainant`, `invitee`, `affected_users` | La persona coinvolta nell'evento: chi accede, chi paga, chi riceve la fattura o il rimborso, chi presenta il reclamo, chi è invitato, chi deve accettare un nuovo documento |
| `private_or_broker_client` | Il privato, oppure il cliente del broker |

## Eventi

| Evento | Destinatari | Canali |
| --- | --- | --- |
| `auth.otp` | Chi accede o conferma | SMS o email |
| `request.submitted.bo` | `bo_verifiers` | In app |
| `request.integration_requested` | `requester` | In app, push, email |
| `request.excluded` | `requester` | In app, email |
| `consent.signature_request` | `broker_client` | Email, SMS |
| `auction.opened.requester` | `requester` | In app, push, email |
| `auction.invited` | `invited_agency_users` | In app, push, email |
| `auction.closing_soon` | Invitati senza offerta | In app, push |
| `auction.closed.requester` | `requester` | In app, push, email |
| `auction.closed.agency` | `participating_agency_users` | In app, email |
| `auction.reopened.requester` | `requester` | In app, push |
| `auction.deserted.requester` | `requester` | In app, push, email |
| `auction.deserted.bo` | `bo_verifiers`, `bo_supervisors` | In app, email |
| `offer.excluded_after_review` | `participating_agency_users` | In app, email |
| `guarantee.expiring` | `requester` | In app, push, email |
| `request.expired` | `requester` | In app, push, email |
| `reconfirmation.requested` | Agenzie con offerta valida | In app, push, email |
| `reconfirmation.completed.requester` | `requester` | In app, push, email |
| `offer.link_to_client` | `broker_client` | Email, SMS |
| `payment.confirmed` | Chi ha pagato | In app, email |
| `payment.failed` | Chi ha pagato | In app, push, email |
| `offer.won` | `winning_agency_users` | In app, push, email |
| `offer.won.bo` | `bo_verifiers` | In app |
| `ranking.available` | `participating_agency_users` | In app, email |
| `ranking.available.excluded` | `participating_agency_users` con offerta esclusa | In app |
| `issuance.deadline_near` | `winning_agency_users` | In app, push, email |
| `issuance.deadline_near.bo` | `bo_verifiers` | In app |
| `issuance.deadline_passed` | `winning_agency_users` | In app, push, email |
| `issuance.deadline_passed.bo` | `bo_verifiers`, `bo_supervisors` | In app, email |
| `issuance.problem_reported.bo` | `bo_verifiers`, `bo_supervisors` | In app, email |
| `issuance.second_offer_proposed` | `requester` o `broker_client` | In app, push, email, SMS al cliente del broker |
| `policy.issued` | Privato | In app, push, email |
| `policy.issued.broker` | Utenti del broker | In app, email |
| `policy.issued.broker_client` | `broker_client` | Email |
| `policy.issued.bo` | `bo_verifiers` | In app |
| `remittance.executed` | `agency_owner` | In app, email |
| `penalty.applied` | `agency_owner` | In app, email |
| `penalty.contested` | `admins` | In app, email |
| `penalty.contest_decided` | `agency_owner` | In app, email |
| `agency.suspended` | `agency_owner` | In app, email |
| `agency.suspended.admin` | `admins` | In app, email |
| `invoice.available` | Destinatario della fattura | In app, email |
| `refund.approval_needed.bo` | `bo_supervisors` | In app, email |
| `refund.executed` | Chi riceve il rimborso | In app, email |
| `renewal.upcoming` | Privato | In app, push, email |
| `renewal.upcoming.broker` | Utenti del broker | In app, email |
| `survey.post_sale` | Privato o `broker_client` | Email |
| `team.invitation` | La persona invitata | Email |
| `onboarding.submitted.bo` | `bo_supervisors` | In app, email |
| `onboarding.approved` | Titolare | In app, email |
| `onboarding.rejected` | Titolare | In app, email |
| `profinsurance.expiring` | Titolare | In app, email |
| `legal.new_version` | Utenti interessati | Email (l'accettazione avviene al primo accesso) |
| `complaint.received` | Chi presenta il reclamo | In app, email |
| `complaint.answered` | Chi presenta il reclamo | In app, email |
| `complaint.new.bo` | `bo_supervisors` | In app, email |
| `complaint.due_soon.bo` | `bo_supervisors` | In app, email |
| `flag.new.bo` | `bo_supervisors` | In app, email |

## Tempi

- `auction.closing_soon`: ASTA-07.
- `guarantee.expiring`: GAR-05.
- `issuance.deadline_near`: 60 minuti prima del termine (parametro `issuance.reminderMinutesBefore`).
- `renewal.upcoming`: 30 giorni prima della scadenza.
- `survey.post_sale`: 7 giorni dopo l'emissione.
- `profinsurance.expiring`: 30 giorni prima della scadenza della RC professionale.
- `complaint.due_soon.bo`: 5 giorni prima della scadenza della risposta.

Ogni notifica nasce da un evento di dominio nell'outbox: se l'invio fallisce si riprova, e non si manda mai due volte la stessa notifica per lo stesso evento.
