# Busta chiusa: progetto tecnico

La busta chiusa è la promessa principale di AstAx verso le agenzie: nessuno, nemmeno chi gestisce la piattaforma, conosce un'offerta prima della chiusura. Deve essere vera nel codice e dimostrabile con i registri del KMS. Regole: BC-01 … BC-07 in [`regole-di-dominio.md`](regole-di-dominio.md).

## Da chi ci proteggiamo

| Chi | Cosa non deve poter fare prima della chiusura |
| --- | --- |
| Altre agenzie | Conoscere prezzo, compagnia o esistenza di un'offerta concorrente |
| Richiedente | Vedere prezzi (vede solo quante offerte sono arrivate) |
| Back office e amministratore | Vedere prezzi o contenuti, da interfaccia, API o esportazioni |
| Chi ha accesso al database o ai backup | Leggere i contenuti dalle tabelle o dai file |
| Uno sviluppatore con accesso all'API in produzione | Decifrare le offerte senza lasciare traccia |

Limite dichiarato: l'API vede il contenuto in memoria per un istante, mentre lo valida all'arrivo. Non lo scrive da nessuna parte (BC-07) e la revisione del codice lo controlla.

## Chiavi

| Chiave | Dove sta | Chi la usa | A cosa serve |
| --- | --- | --- | --- |
| `astax-sealed-bids` (KMS, simmetrica) | KMS | Solo il ruolo del worker può cifrare e decifrare, con contesto `{purpose: "sealed-bid", auctionId}` | Avvolge la chiave privata di ogni asta |
| Coppia X25519 per asta | Pubblica in chiaro su `Auction.publicKey`; privata solo avvolta (`Auction.wrappedPrivateKey`) | L'API cifra con la pubblica; il worker decifra con la privata alla chiusura | Busta di ogni offerta |
| `astax-offer-owner` (KMS, simmetrica) | KMS | Ruolo dell'API, con contesto `{purpose: "offer-owner", organizationId, offerId}` | Copia per l'agenzia (BC-04) |
| Chiave dei documenti (SSE-KMS) | S3 | API e worker | Documenti ordinari, dopo la chiusura |

Libreria: `libsodium` (`crypto_box_seal` per la busta, `crypto_secretstream_xchacha20poly1305` o AES-256-GCM per i file grandi). Niente crittografia scritta a mano.

## Flusso

1. **Apertura.** Un'attività del worker genera la coppia X25519, avvolge la chiave privata con `kms:Encrypt` (contesto con `auctionId`), salva chiave pubblica e chiave avvolta sull'asta e azzera la privata in memoria.
2. **Invio.** L'API riceve l'offerta in HTTPS e la valida in memoria (OFF-04, OFF-05, VIS-11, mandato della compagnia). Poi:
   - serializza il contenuto (premio, compagnia, prodotto, coperture, data di garanzia, note) e lo sigilla con la chiave pubblica dell'asta → `Offer.sealedPayload`;
   - cifra il PDF con una chiave casuale, sigilla quella chiave con la chiave pubblica → `sealedPdfDataKey`; il file cifrato va su S3 con un nome che non dice nulla → `sealedPdfKey`;
   - crea la copia per l'agenzia con `astax-offer-owner` → `ownerCopy`;
   - salva tutto nella stessa transazione che controlla che l'asta sia `OPEN` e che l'ora del server sia prima di `scheduledCloseAt` (BC-05).
3. **Modifica o ritiro.** Stesso controllo. La versione precedente resta cifrata in `OfferVersion`; alla chiusura conta solo l'ultima.
4. **Lettura da parte dell'agenzia.** L'API decifra `ownerCopy` solo per un utente autorizzato di quell'agenzia (permessi in [`permessi.md`](permessi.md)), scrive `OFFER_OWNER_COPY_READ` nel registro e restituisce il contenuto.
5. **Chiusura.** Al timer di Temporal, l'attività di chiusura:
   - porta l'asta a `CLOSING` con un blocco sulla riga (da qui ogni invio è rifiutato);
   - chiama `kms:Decrypt` sulla chiave avvolta, con il contesto dell'asta;
   - apre le buste, valida le offerte (OFF-06), scrive i campi in chiaro e calcola stati, classifica e migliori offerte per compagnia;
   - decifra i PDF e li salva come documenti ordinari (SSE-KMS);
   - azzera la chiave privata in memoria e porta l'asta a `CLOSED`.
   L'attività restituisce a Temporal solo identificativi e conteggi (BC-07).
6. **Riconferma.** Nuova asta di tipo `RECONFIRMATION` con nuova coppia di chiavi (BC-06).

## Controlli e prove

- **Permessi IAM.** Solo il ruolo del worker ha `kms:Decrypt` su `astax-sealed-bids`, con condizione sul contesto `purpose = sealed-bid`. Il ruolo dell'API non ha alcun permesso su quella chiave.
- **CloudTrail.** Ogni `Decrypt` è registrato con il contesto (`auctionId`). Un controllo notturno confronta gli eventi con `scheduledCloseAt` di ogni asta e lancia un allarme se trova una decifratura anticipata (BC-03).
- **Endpoint.** Ogni endpoint che restituisce dati di offerte controlla lo stato dell'asta. Prima della chiusura risponde 403 a chiunque non sia l'agenzia proprietaria e registra `SEALED_BID_ACCESS_DENIED` (BC-01).
- **Prova verso le agenzie.** Su richiesta, il back office esporta per un'asta l'elenco degli eventi KMS e del registro: apertura, invii, chiusura, decifrature.

## Ambiente di sviluppo e test

- In sviluppo un adattatore finto sostituisce KMS: due chiavi master locali, una caricata solo dal processo worker (`SEALED_BIDS_MASTER_KEY`) e una dall'API (`OFFER_OWNER_MASTER_KEY`). Stesse firme e stesso controllo del contesto del KMS vero.
- Test obbligatori:
  - un'offerta inviata non compare in chiaro in nessuna tabella: il test cerca le cifre del premio e il nome della compagnia nel dump del database;
  - ogni ruolo (privato, broker, altra agenzia, i quattro ruoli di back office, amministratore) riceve 403 su ogni endpoint che espone offerte, e il registro contiene l'evento;
  - un invio che arriva un istante dopo la chiusura è rifiutato, anche in concorrenza con l'attività di chiusura;
  - la decifratura con un contesto diverso (altra asta) fallisce;
  - il processo API non può aprire una busta: non ha la chiave e il test lo dimostra.
