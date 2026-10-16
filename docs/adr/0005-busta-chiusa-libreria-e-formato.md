# 0005 — Busta chiusa: libreria, formato e KMS finto

- **Data:** 2026-10-16
- **Stato:** proposta
- **Fase:** 3

## Contesto

La busta chiusa (BC-01 … BC-07, `docs/busta-chiusa.md`) chiede che nessuno, nemmeno chi gestisce la piattaforma, possa leggere un'offerta prima della chiusura. Questo deve valere nel codice e deve lasciare prove. In sviluppo e nei test non ci sono AWS né KMS veri (regola 9). Servono una libreria già esistente, un formato dei valori cifrati che si possa cambiare in futuro e un KMS finto che si comporti come quello vero.

## Decisione

1. **Libreria:** `libsodium-wrappers` 0.8.4, cioè libsodium compilato in WebAssembly, senza moduli nativi da compilare su Windows. Per la busta si usa `crypto_box_seal` con una coppia X25519 per ogni giro d'asta. Il PDF si cifra con una chiave casuale (`crypto_secretbox`, XSalsa20-Poly1305), e quella chiave si sigilla con la chiave pubblica dell'asta. Nessuna crittografia scritta a mano.
2. **Formato:** ogni valore cifrato è testo con un prefisso di versione, per esempio `v1:sb:<base64>` (busta) e `v1:kms:<chiave>:<base64>` (KMS). Se in futuro cambia il formato, cambia il prefisso e le righe vecchie restano leggibili.
3. **Porta KMS** (`packages/adapters/src/kms`): `encrypt(keyId, dati, contesto)` e `decrypt(keyId, valore, contesto)`. Il contesto (`{purpose, auctionId}` oppure `{purpose, organizationId, offerId}`) entra come dato autenticato: se si decifra con un contesto diverso, l'operazione fallisce.
4. **KMS finto** (`LocalKms`): AES-256-GCM con chiavi master locali.
   - Ogni processo riceve solo le chiavi sue: il worker solo `SEALED_BIDS_MASTER_KEY` (`astax-sealed-bids`), l'API solo `OFFER_OWNER_MASTER_KEY` (`astax-offer-owner`). Una chiave che il processo non ha dà errore, come un permesso IAM mancante.
   - La configurazione dell'API non legge mai `SEALED_BIDS_MASTER_KEY`, e un test lo dimostra.
5. **Registro del KMS:** ogni cifratura e decifratura di `astax-sealed-bids` finisce nella tabella `KmsEvent`, solo in aggiunta, con chiave, operazione, contesto (solo identificativi) e processo. Fa le veci di CloudTrail: con questa tabella lo scenario S07 controlla che non ci siano decifrature prima della chiusura, e il back office può esportarla per un'asta.

## Alternative considerate

| Alternativa | Perché no |
| --- | --- |
| `sodium-native` (modulo nativo) | Va compilato; su Windows e nella CI aggiunge una catena di build senza vantaggi per offerte piccole |
| `node:crypto` con ECDH e AES-GCM scritti a mano | È crittografia composta a mano: le specifiche chiedono una libreria (`docs/busta-chiusa.md`) |
| Una sola chiave master per tutto il KMS finto | Non dimostrerebbe che l'API non può aprire una busta |
| Registro del KMS solo nei log | I log non si interrogano nei test e possono essere ruotati: la prova va conservata |

## Conseguenze

- Con il KMS vero (fase 8) cambia solo l'adattatore: le firme e il controllo del contesto restano uguali, e `KmsEvent` diventa un import da CloudTrail.
- In locale il file `.env` contiene entrambe le chiavi, perché API e worker girano sulla stessa macchina. La separazione la garantisce la configurazione di ogni processo e la verificano i test; in cloud saranno due ruoli IAM diversi.
- Le dimensioni restano piccole: una busta pesa circa 48 byte più il contenuto.
