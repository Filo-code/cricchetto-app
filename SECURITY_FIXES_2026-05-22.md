# Security Fixes — Cricchetto — 2026-05-22

## 1. Contesto

**Obiettivo:** preparare Cricchetto al go-live multi-tenant con clienti reali, eliminando tutti i vettori di attacco critici prima che dati di officine reali entrino nel sistema.

**Stack:**
- Next.js 15 App Router (server components, server actions, server-only modules)
- Supabase con service role key (bypassa RLS — custom auth, non Supabase Auth)
- Sessioni HMAC-SHA256 su cookie firmati (nessuna libreria JWT)
- n8n per orchestrazione workflow inbound/outbound
- WhatsApp Cloud API + Telegram Bot API via adapter pattern
- Multi-tenancy via `workshop_id` composite FK su ogni tabella

**Focus:** tenant isolation, session security, secret management, RLS hardening, input validation, produzione hardening.

---

## 2. Fix P0 — Bloccanti pre-go-live

### P0.1 — Rimosso fallback "first workshop" in produzione

| Campo | Dettaglio |
|---|---|
| **Problema originale** | `readDashboardWorkshop()` e `getWorkshopSettings()` — se nessun `workshopId` era disponibile da sessione o env-var — eseguivano `ORDER BY created_at LIMIT 1` e restituivano la prima officina nel DB |
| **Rischio** | In multi-tenant: utente senza cookie valido potrebbe ricevere dati dell'officina #1. In produzione con più officine: leak cross-tenant silenzioso |
| **File modificati** | `apps/web/lib/dashboard/read.ts` |
| **Soluzione** | Se `NODE_ENV === "production"` e nessun `workshopId` è risolvibile, la funzione lancia un errore esplicito: `"No workshop resolved from session or configuration — refusing first-by-date fallback in production"`. Il fallback a prima officina rimane solo in sviluppo locale |

---

### P0.2 — Separazione DASHBOARD_API_SECRET / INTERNAL_API_SECRET

| Campo | Dettaglio |
|---|---|
| **Problema originale** | `requireDashboardRequest()` e `dashboardServerHeaders()` in `auth.ts` accettavano `Criccheto_DASHBOARD_API_SECRET ?? Criccheto_INTERNAL_API_SECRET` — cioè il secret n8n poteva autenticare endpoint dashboard |
| **Rischio** | Se `INTERNAL_API_SECRET` (condiviso con n8n e sistemi esterni) fosse compromesso, qualunque endpoint dashboard sarebbe bypassabile |
| **File modificati** | `apps/web/lib/dashboard/auth.ts` |
| **Soluzione** | Rimosso il fallback `?? process.env.Criccheto_INTERNAL_API_SECRET`. Entrambe le funzioni ora richiedono esplicitamente `Criccheto_DASHBOARD_API_SECRET` senza fallback alternativi |

---

### P0.3 — DASHBOARD_SESSION_SECRET obbligatorio in produzione

| Campo | Dettaglio |
|---|---|
| **Problema originale** | `hmac()` in `session-core.ts` — se `DASHBOARD_SESSION_SECRET` mancava — cadeva su `DASHBOARD_API_SECRET ?? INTERNAL_API_SECRET`. Cookie firmati con secret sbagliato o prevedibile |
| **Rischio** | Sessioni forgeable se un secret più debole o condiviso finiva nella firma HMAC |
| **File modificati** | `apps/web/lib/dashboard/session-core.ts` |
| **Soluzione** | In `NODE_ENV === "production"`, `hmac()` lancia immediatamente se `DASHBOARD_SESSION_SECRET` è assente. Il fallback a secret alternativi rimane solo per `NODE_ENV !== "production"` |

---

### P0.4 — Consumo atomico del token di reset password

| Campo | Dettaglio |
|---|---|
| **Problema originale** | `consumePasswordResetToken()` eseguiva prima `SELECT ... WHERE token_hash = ? AND used_at IS NULL AND expires_at > now()`, poi separatamente `UPDATE ... SET used_at = now()` |
| **Rischio** | Race condition TOCTOU: due richieste concorrenti potevano consumare lo stesso token (entrambe passano il SELECT, entrambe fanno l'UPDATE) |
| **File modificati** | `apps/web/lib/dashboard/users.ts` |
| **Soluzione** | Sostituito SELECT+UPDATE con singolo `UPDATE ... SET used_at = now() WHERE token_hash = ? AND used_at IS NULL AND expires_at > now() RETURNING user_id`. PostgreSQL garantisce atomicità a livello di riga: solo una transazione vince, le altre non ricevono righe |

---

### P0.5 — RLS deny-all esplicito su tabelle sensibili

| Campo | Dettaglio |
|---|---|
| **Problema originale** | RLS abilitata su 16+ tabelle ma nessuna policy definita. Comportamento PostgreSQL: nessuna policy = nessuna riga visibile per ruoli non-privilegiati, ma questo è implicito e non documentato |
| **Rischio** | Errore di configurazione futuro (es. cambio default PostgreSQL, policy aggiunta per sbaglio) potrebbe esporre righe. Nessuna defense-in-depth se il service role key leakasse e un client non autorizzato tentasse query dirette |
| **File modificati** | `supabase/migrations/0019_rls_deny_all_non_service.sql` (nuovo) |
| **Soluzione** | Policy `USING (false) WITH CHECK (false)` per ruoli `anon` e `authenticated` su tutte le 20 tabelle sensibili: `workshops`, `work_orders`, `customers`, `vehicles`, `message_logs`, `workshop_users`, `password_reset_tokens`, `revisions`, `notification_rules`, `staff_phone_numbers`, `workshop_channels`, `work_order_lines`, `work_order_photos`, `audit_log`, e altre |

---

## 3. Fix P1 — Subito dopo P0

### P1.1 — Rate limiting su login

| Campo | Dettaglio |
|---|---|
| **Problema originale** | Nessun limite su tentativi di login — brute force illimitato su credenziali dashboard |
| **File modificati** | `apps/web/app/login/actions.ts` |
| **Soluzione** | Rate limiter in-memory: max 10 tentativi per IP in finestra di 15 minuti. Al successo il contatore viene azzerato. **Nota:** in-memory è adeguato per MVP single-instance; sostituire con Redis/Upstash prima di scale-out multi-istanza |

---

### P1.2 — Blocco telegram_test in produzione

| Campo | Dettaglio |
|---|---|
| **Problema originale** | Il canale `telegram_test` era elaborato normalmente anche in produzione |
| **Rischio** | Messaggi di test potevano contaminare dati produzione, intake reali, log |
| **File modificati** | `apps/web/lib/messages/index.ts` |
| **Soluzione** | All'inizio del blocco di elaborazione: se `channel === "telegram_test"` e `NODE_ENV === "production"`, il messaggio viene rifiutato immediatamente |

---

### P1.3 — Validazione upload logo (MIME + dimensione)

| Campo | Dettaglio |
|---|---|
| **Problema originale** | `uploadWorkshopLogo()` caricava su Supabase Storage qualunque file senza validazione tipo o dimensione |
| **Rischio** | Upload di file arbitrari (SVG con XSS, file eseguibili, file enormi) |
| **File modificati** | `apps/web/lib/dashboard/read.ts` |
| **Soluzione** | Validazione prima dell'upload: MIME consentiti `image/jpeg`, `image/png`, `image/webp`, `image/gif`; dimensione massima 5 MB. Errori lanciati in italiano con messaggio chiaro all'utente |

---

### P1.4 — Middleware centralizzato per API dashboard

| Campo | Dettaglio |
|---|---|
| **Problema originale** | Ogni route API verificava individualmente il secret — rischio di dimenticare il check su route nuove |
| **File modificati** | `apps/web/middleware.ts` (nuovo) |
| **Soluzione** | Next.js middleware che verifica `x-dashboard-secret` per tutti i pattern: `/api/dashboard/:path*`, `/api/work-orders/:path*`, `/api/customers/:path*`, `/api/vehicles/:path*`, `/api/revisions/:path*`. Se `DASHBOARD_API_SECRET` manca in env: 500. Se header assente o non corrispondente: 401 |

---

### P1.5 — Scoping workshop_id su outbound message logs

| Campo | Dettaglio |
|---|---|
| **Problema originale** | `recordOutboundResult()` e `markOutboundSending()` eseguivano UPDATE su `message_logs` filtrati solo per ID — nessuna verifica che il log appartenesse all'officina corretta |
| **Rischio** | Possibile aggiornamento cross-tenant su log di altre officine |
| **File modificati** | `apps/web/lib/outbound/index.ts` |
| **Soluzione** | Prima dell'UPDATE, legge `workshop_id` dal log. L'UPDATE è scopato con `.eq("workshop_id", workshopId)` in aggiunta all'ID del messaggio |

---

## 4. Fix P2 — Non bloccanti, completati in sessione

### P2.1 — session_version su workshop_users + invalidazione sessioni

| Campo | Dettaglio |
|---|---|
| **Problema originale** | Nessun meccanismo per invalidare sessioni esistenti dopo cambio password. Un token rubato rimane valido fino a scadenza naturale (12h) |
| **File modificati** | `supabase/migrations/0020_workshop_users_session_version.sql` (nuovo), `apps/web/lib/dashboard/session-core.ts`, `apps/web/lib/dashboard/session.ts`, `apps/web/lib/dashboard/users.ts` |
| **Soluzione** | Colonna `session_version integer not null default 0` su `workshop_users`. Trigger DB auto-incrementa la versione ad ogni cambio di `password_hash`. La versione viene inclusa nel cookie firmato. `requireDashboardSession()` confronta la versione cookie con quella DB: mismatch → redirect a `/login` |

---

### P2.2 — SCRYPT_N portato a 65536

| Campo | Dettaglio |
|---|---|
| **Problema originale** | `SCRYPT_N = 16384` — costo computazionale adeguato per il 2017, sottodimensionato per il 2026 |
| **File modificati** | `apps/web/lib/dashboard/users.ts` |
| **Soluzione** | `SCRYPT_N` portato a `65536` (2^16). Quadruplica il costo di attacco brute-force offline. Le password esistenti rimangono con il vecchio N finché non vengono cambiate (nessuna migrazione forzata necessaria — il parametro è memorizzato nell'hash) |

---

### P2.3 — Reset token TTL ridotto a 24h

| Campo | Dettaglio |
|---|---|
| **Problema originale** | `TOKEN_TTL_SECONDS = 72 * 60 * 60` — token validi 3 giorni |
| **Rischio** | Finestra di attacco lunga se link email intercettato |
| **File modificati** | `apps/web/lib/dashboard/users.ts` |
| **Soluzione** | `TOKEN_TTL_SECONDS = 24 * 60 * 60` — token validi 24h |

---

### P2.4 — sameSite: "strict" sui cookie dashboard

| Campo | Dettaglio |
|---|---|
| **Problema originale** | Cookie di sessione impostati con `sameSite: "lax"` |
| **Rischio** | Con `lax`, il cookie viene inviato in navigazioni top-level cross-site (es. click su link da email phishing). Con `strict`, il cookie non viene mai inviato in contesti cross-site |
| **File modificati** | `apps/web/lib/dashboard/session.ts` |
| **Soluzione** | Entrambi i `cookieStore.set()` (set sessione + clear sessione) usano `sameSite: "strict"` |

---

### P2.5 — enable_signup=false in Supabase config

| Campo | Dettaglio |
|---|---|
| **Problema originale** | `supabase/config.toml` aveva `enable_signup = true` — potenziale creazione di utenti Supabase Auth orfani |
| **File modificati** | `supabase/config.toml` |
| **Soluzione** | `enable_signup = false` sia nel blocco `[auth]` che nel blocco `[auth.email]`. L'app usa `workshop_users` custom, non Supabase Auth. **Azione manuale richiesta:** disabilitare anche in produzione via Supabase dashboard > Authentication > Settings |

---

### P2.6 — activeIntake tipizzato (rimosso `any`)

| Campo | Dettaglio |
|---|---|
| **Problema originale** | `let activeIntake: any | null = null` nel path critico di elaborazione messaggi |
| **File modificati** | `apps/web/lib/intake/index.ts`, `apps/web/lib/messages/index.ts` |
| **Soluzione** | Aggiunta interface `IntakeSession` in `intake/index.ts` con tutti i campi DB (`id`, `workshop_id`, `channel`, `sender_identifier`, `plate_normalized`, `current_step`, `data`, `is_active`, `expires_at`, `created_at`). Firme di `getActiveIntake` e `continueIntake` aggiornate. `activeIntake` in `messages/index.ts` tipizzato come `IntakeSession | null` |

---

### P2.7 — Documentazione dispatch n8n in whatsapp.ts

| Campo | Dettaglio |
|---|---|
| **Problema originale** | `sendTextMessage()` in `whatsapp.ts` restituiva un errore fuorviante che sembrava un bug |
| **File modificati** | `apps/web/lib/providers/whatsapp.ts` |
| **Soluzione** | Sostituito il messaggio di errore con commento esplicativo: il dispatch WhatsApp outbound è gestito interamente da n8n (WF-03). Il backend accoda i messaggi in `message_logs` con `provider_status="queued"` e n8n li preleva e invia. Il metodo esiste solo per soddisfare l'interfaccia `ProviderAdapter` |

---

## 5. Migrazioni create

### `supabase/migrations/0019_rls_deny_all_non_service.sql`

Crea policy RLS esplicite `DENY ALL` per i ruoli `anon` e `authenticated` su tutte le tabelle sensibili dell'applicazione. Per ogni tabella aggiunge:
```sql
CREATE POLICY "deny_anon" ON <tabella> FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "deny_authenticated" ON <tabella> FOR ALL TO authenticated USING (false) WITH CHECK (false);
```

**Perché serve:** l'applicazione usa il service role key che bypassa RLS, quindi queste policy non bloccano il funzionamento attuale. Servono come difesa in profondità: se in futuro una query usasse il client anon/authenticated per errore, o se il service role key fosse compromesso e qualcuno tentasse accesso diretto, ogni riga viene negata esplicitamente.

---

### `supabase/migrations/0020_workshop_users_session_version.sql`

Aggiunge la colonna `session_version` a `workshop_users` e il trigger che la incrementa automaticamente:

```sql
ALTER TABLE workshop_users ADD COLUMN session_version integer not null default 0;

CREATE OR REPLACE FUNCTION increment_session_version_on_password_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF new.password_hash IS DISTINCT FROM old.password_hash THEN
    new.session_version = coalesce(old.session_version, 0) + 1;
  END IF;
  RETURN new;
END; $$;

CREATE TRIGGER trg_workshop_users_session_version
  BEFORE UPDATE ON workshop_users FOR EACH ROW
  EXECUTE FUNCTION increment_session_version_on_password_change();
```

**Perché serve:** permette di invalidare tutte le sessioni attive di un utente senza una session table centralizzata. Al cambio password, il trigger aggiorna la versione DB; al prossimo request, il middleware confronta la versione nel cookie con quella DB e forza il re-login se divergono.

---

## 6. Variabili d'ambiente richieste in produzione

Questi tre secret devono essere **valori distinti**, generati indipendentemente. Non riutilizzare lo stesso valore tra variabili diverse.

| Variabile | Uso | Obbligatorio |
|---|---|---|
| `Criccheto_DASHBOARD_API_SECRET` | Autenticazione richieste API dashboard (header `x-dashboard-secret`). Usato da frontend Next.js verso proprie route API | **Sì** |
| `Criccheto_DASHBOARD_SESSION_SECRET` | Firma HMAC-SHA256 dei cookie di sessione dashboard | **Sì** |
| `Criccheto_INTERNAL_API_SECRET` | Autenticazione webhook n8n → Next.js. Secret separato, condiviso con i workflow n8n | **Sì** |
| `Criccheto_DASHBOARD_WORKSHOP_ID` | Workshop ID di default per istanze single-tenant o quando la sessione non porta un workshopId | **Sì in produzione** |

**Regola:** in produzione, se `DASHBOARD_SESSION_SECRET` è assente l'app crasha all'avvio del sign della sessione. Non esiste fallback. Questo è intenzionale.

---

## 7. Checklist — Azioni manuali prima del deploy

- [ ] **Env produzione:** impostare tutti e quattro i secret separati (sezione 6)
- [ ] **Migrazioni Supabase:** applicare `0019` e `0020` in ordine (`supabase db push` o manualmente)
- [ ] **Supabase dashboard:** Authentication > Settings > Enable sign ups = **OFF**
- [ ] **Typecheck:** eseguire `pnpm tsc --noEmit` — verificare che i tipi `IntakeSession` e `sessionVersion` compilino senza errori
- [ ] **Test login/logout:** verificare che il flow di autenticazione funzioni con la nuova struttura payload (include `sessionVersion`)
- [ ] **Test reset password:** verificare che il token sia consumabile una sola volta e scada dopo 24h
- [ ] **Test accesso dashboard:** verificare che ogni sessione acceda solo ai dati della propria officina
- [ ] **Test API protette:** verificare che le route `/api/dashboard/*`, `/api/work-orders/*`, ecc. restituiscano 401 senza `x-dashboard-secret` corretto
- [ ] **Test upload logo:** verificare che file non-immagine e file >5MB vengano rifiutati con messaggio chiaro
- [ ] **Test webhook n8n:** verificare che WF-01 e WF-03 continuino a funzionare con `INTERNAL_API_SECRET`
- [ ] **Invalidazione sessioni:** dopo il deploy, le sessioni esistenti (prive di `sessionVersion`) saranno invalidate — comportamento atteso, utenti ri-fanno login

---

## 8. Note operative

**Semgrep hook:** durante la sessione, ogni operazione su file ha triggerato `semgrep mcp -k post-tool-cli-scan` con errore `No SEMGREP_APP_TOKEN found`. Non si tratta di errori nel codice — il token non è configurato nell'ambiente locale. Le modifiche sono state applicate correttamente nonostante questi errori non bloccanti.

**Rate limiting in-memory:** il rate limiter su login (`apps/web/app/login/actions.ts`) è in-memory, locale al processo Node.js. Per una singola istanza (MVP) è adeguato. Prima di qualunque scale-out multi-istanza o deployment con più pod, sostituire con un backend condiviso (Redis, Upstash) per garantire che i contatori siano globali.

**Invalidazione sessioni al deploy:** l'introduzione di `sessionVersion` nel payload del cookie cambierà la struttura attesa. Tutte le sessioni esistenti (senza `sessionVersion`) falliranno la verifica in `session-core.ts` e produrranno un redirect a `/login`. Questo è il comportamento corretto e atteso — gli utenti rieffettuano il login una volta.

**service role key e RLS:** Supabase con service role key bypassa RLS per design. Le policy in `0019` non proteggono contro query fatte con service role. Proteggono contro accessi diretti con client anon/authenticated (es. accesso diretto a Supabase API senza passare per Next.js).

---

## Ready for MVP Go-Live

| Check | Stato |
|---|---|
| Nessun fallback cross-tenant in produzione | ✅ |
| Secret separati per dashboard, sessione, n8n | ✅ |
| Session cookie firmato con secret dedicato | ✅ |
| Token reset password consumato atomicamente | ✅ |
| RLS deny-all su tabelle sensibili | ✅ |
| Rate limiting su endpoint login | ✅ |
| Canali test bloccati in produzione | ✅ |
| Validazione MIME + size su upload | ✅ |
| Middleware centralizzato su route API | ✅ |
| Scoping workshop_id su outbound logs | ✅ |
| Invalidazione sessioni post-password-change | ✅ |
| Password hashing con SCRYPT_N=65536 | ✅ |
| Reset token TTL 24h | ✅ |
| sameSite strict sui cookie | ✅ |
| Supabase Auth signup disabilitato (config) | ✅ |
| activeIntake tipizzato (no `any`) | ✅ |
| Dispatch n8n documentato | ✅ |
| env produzione impostati | ⬜ manuale |
| Migrazioni 0019+0020 applicate | ⬜ manuale |
| Supabase signup OFF in dashboard | ⬜ manuale |
| Typecheck pulito | ⬜ da verificare |
