# SMS Auto-Import

Card and bKash payments are recorded in NoSkip without typing anything. The iPhone
forwards each bank SMS to NoSkip. NoSkip reads it, files the expense, and asks me to
confirm the category. After 3 confirmations for the same shop, it stops asking and files
that shop automatically.

Cash spending is still entered by hand.

**Status:** live on Supabase since 2026-10-12, and tested with real SMS from my iPhone.
The app screens (confirm dialog, banner, Settings section) are not pushed to Vercel yet
(see [What's left](#whats-left)).

---

## What I did (2026-10-12)

1. **Planned it.** I adapted the "bank SMS → database" idea to NoSkip's existing
   Supabase setup. There's one secret key instead of a database user per phone.
2. **Built it.**
   - a database migration
   - an SMS parser
   - the `ingest-sms` edge function
   - the confirm dialog, the "payments to confirm" banner, and the Settings section
3. **Tested it locally** before going live (61 checks):
   - parser tests with sample and real SMS
   - the migration and the learning logic in an in-memory Postgres
   - the edge function run in Deno against a fake database
   - the confirm dialog with fake data
4. **Checked my real SMS formats.** The bKash payment and bKash received formats parsed
   correctly. City Bank's "CITYTOUCH TXN" format needed two parser fixes, and is now covered
   by tests.
5. **Deployed to Supabase** (project `no-skip`, ref `ruclkyjuvqmomwdfidet`):
   - `supabase db push`: applied migration `20261012120000_sms_auto_import.sql`
   - `supabase secrets set SMS_INGEST_SECRET=… SMS_INGEST_USER_ID=…`: the key, plus my user id
   - `supabase functions deploy ingest-sms --no-verify-jwt`
   - Smoke test: a wrong key got 401, and an OTP was skipped and not stored.
6. **Set up the iPhone Shortcut automations** (see below) and pressed ▶ once to allow
   network access.
7. **First real SMS:** a City Bank Tk 1 credit arrived from the phone, landed in the review
   list, and I logged it as income. ✅

---

## How it works

```
Bank SMS ─► iPhone Shortcut automation ─► POST /functions/v1/ingest-sms
                                                    │
                       read it ─► block duplicates (TrxID / text) ─► pick category
                                                    │
               ┌────────────────────────────────────┼─────────────────────────┐
         money out (BDT)                  money in / unclear / USD        OTP / promo
               │                                    │                         │
   expense saved as "pending"              review list in the app       thrown away
   (counts in totals right away)           (income / expense / ignore)  (never stored)
               │
   NoSkip: "N payments to confirm" ─► Confirm / change category / Not an expense
               │
   3 confirms of the same category ─► that shop is auto-filed from then on
```

**How the category is chosen:**
1. my learned rules
2. the built-in list of ~90 Bangladeshi merchants (Foodpanda, Pathao, Shwapno, Aarong, …)
3. a Gemini guess from the shop name
4. Other

**Rules of the learning:**
- Confirming the same category 3 times makes that shop automatic.
- Picking a different category resets the count, so one wrong tap can't lock in a mistake.
- Editing an SMS expense later in the normal edit dialog teaches it too.
- Payments to **people** (phone numbers) always ask.

---

## iPhone setup (as done)

There's one automation per keyword. iOS matches one exact phrase per automation.

| Keyword | Catches |
|---|---|
| `TrxID` | every bKash SMS (payments, received, cash out, recharge) |
| `A/C:` | every City Bank SMS: `CITYTOUCH TXN`, `E-COMM/POS TXN`, `ATM TXN`, deposits (`CITYTOUCH` alone misses all but the first) |
| `TxnID` | Nagad (only if I start using it) |

Each automation is built the same way:
1. Shortcuts → **Automation** → **+** → **Message** → *Message Contains* = the keyword.
2. **Run Immediately**, with *Notify When Run* off → **New Blank Automation**.
3. Add the action **Get Contents of URL**:
   - URL: `https://ruclkyjuvqmomwdfidet.supabase.co/functions/v1/ingest-sms`
   - Method: **POST**
   - Header: `x-noskip-key` = the secret key
   - Request Body **JSON**:
     - `text` = Shortcut Input → **Content**
     - `sender` = Shortcut Input → **Sender**
4. Optional: **Get Dictionary Value** `message` from *Contents of URL* → **Show Notification**.
5. Tap **▶** once and choose **Always Allow**. The result "NoSkip: empty SMS" is expected
   here and means the key works. Then tap **✓**.

**The secret key** is saved on my laptop at `C:\Users\miraz\noskip-sms-key.txt` and in the
Supabase secret `SMS_INGEST_SECRET`. Never put it in `.env`, the repo or a screenshot.

---

## Gmail import

The Shortcut only works if the phone is online when the SMS arrives; offline, that SMS is
never forwarded. Bank alert **emails** wait in Gmail instead, and City Bank's email names the
shop, the card and the exact time. So a small Google Apps Script in my own Gmail reads them
every 5 minutes, on Google's servers, and sends them to the same `ingest-sms` function.

**One-time setup (5 minutes, on a computer):**

1. Go to [script.google.com](https://script.google.com) signed in with the Gmail that gets
   the bank alerts → **New project** → name it `NoSkip Gmail import`.
2. Delete the sample code, paste all of [`docs/gmail-import.gs`](gmail-import.gs), and save.
3. ⚙ **Project Settings** → **Script properties** → add two:
   - `NOSKIP_URL` = `https://<project-ref>.supabase.co/functions/v1/ingest-sms`
     (the same URL as the Shortcut)
   - `NOSKIP_KEY` = the key from `noskip-sms-key.txt` (the same one as the Shortcut header)
4. Back in the editor, choose the `install` function in the toolbar → **Run**.
5. Google asks for permission → pick the account → **Advanced** → **Go to NoSkip Gmail import
   (unsafe)** → **Allow**. ("Unsafe" only means Google hasn't reviewed my own script.) It
   needs to read Gmail, add a label, and call NoSkip.
6. Check **Executions** (left sidebar): the first run lists each alert it sent. Imported
   threads get a **NoSkip** label in Gmail.

**What it does:**

- Every 5 minutes it looks at the last 3 days of alerts from the senders in `SENDERS`, and
  sends each message it hasn't sent before. It remembers the last 500 message IDs.
- If NoSkip is down or the key is wrong, it doesn't mark the message as sent, so the next run
  tries again. Re-sending is safe: NoSkip answers "duplicate".
- **SMS and email of the same payment don't make two expenses.** Same amount, same day
  (or within 30 minutes), same card when both name one, other channel → the second one is
  kept as `status = 'duplicate'` with `duplicate_of` pointing at the first, and files nothing.
- **If the SMS came first without the shop name** (every City Bank card SMS), the email fills
  it in: the SMS row gets the merchant, and if its expense is still waiting for me, its note
  becomes the shop name, and a still-"Uncategorized" category gets a proper guess. Expenses I
  already confirmed are never changed.
- Another bank: add its sender address to `SENDERS`, paste one of its alert emails as a test
  case in `smsParser.test.ts` (run through `cleanEmailText`), and fix the parser if needed.
- Stop it: run `uninstall` in the script editor.

---

## Daily use

- **Pay normally.** The phone forwards the SMS in the background. If the notification step
  is set up, I see e.g. *"Tk 1,250 · Aarong → Clothing / Apparel? Tap to confirm"*.
- **Open NoSkip.** The amber **"N payments to confirm"** banner is on every page, and the
  dialog opens by itself once per session.
  - Use **Confirm** or **Confirm all**, change the category, or tap **Not an expense**.
  - "Never track payments to X" and "Always ignore money from X" are for my own transfers.
- **Money received** is never counted as income automatically. I choose income or ignore.
- **Missed an SMS?** Use "Paste it" in the dialog, or **Settings → SMS Auto-Import**.
- **Rules:** Settings → Merchant rules shows every learned shop. From there I can change
  its category (which trusts it immediately), switch on **Always ask**, edit the match
  pattern, or delete it.

---

## Known limits

- **City Bank SMS don't name the shop** ("Tk. 800 Withdrawal"). With the Gmail import on,
  the card alert email fills in the shop for card payments. ATM cash and account transfers
  have no email, so those still ask for a category.
- **The SMS ↔ email match is by amount and day.** Two card payments of the exact same amount
  on the same day, one seen only by SMS and the other only by email, would be paired by
  mistake. Each message pairs with at most one other, so with both channels on this is rare.
- **USD card charges** (e.g. Netflix) go to the review list. I type the BDT amount.
- **Cash** never sends an SMS, so it still needs manual entry.

---

## Maintenance

| Task | How |
|---|---|
| Check whether SMS are arriving | Settings → SMS Auto-Import → "Last SMS …" |
| See what the server did | Supabase dashboard → Edge Functions → `ingest-sms` → Logs (the SMS text is never logged) |
| Inspect recent SMS | `npx supabase db query --linked "select created_at, provider, kind, amount, merchant, status from sms_messages order by created_at desc limit 10"` |
| A bank changed its SMS format | Paste the new SMS as a test case in `supabase/functions/_shared/smsParser.test.ts`, fix `smsParser.ts`, run `npx vitest run supabase/functions/_shared`, then redeploy the function |
| Add a merchant to the built-in list | `DEFAULT_MERCHANTS` in `supabase/functions/_shared/merchantCategories.ts`, then redeploy |
| Added or renamed expense categories | Update `EXPENSE_CATEGORY_LABELS` in `merchantCategories.ts` too; a test fails if they drift |
| Redeploy the function | `npx supabase functions deploy ingest-sms --no-verify-jwt` |
| Key leaked, so replace it | Generate a new key → `npx supabase secrets set SMS_INGEST_SECRET=<new>` → update the header in every iPhone automation and in `noskip-sms-key.txt` |
| Turn it off | Disable the iPhone automations, and run `uninstall` in the Gmail script |
| Is the Gmail import running? | script.google.com → the project → **Executions** (one every 5 min). Logs show NoSkip's reply per email |
| Key replaced | Also update `NOSKIP_KEY` in the Gmail script's Script properties |

### Troubleshooting

| Symptom | Cause / fix |
|---|---|
| "interrupted", or nothing happens | Network access isn't allowed. Open the automation → ▶ → Always Allow |
| "NoSkip: wrong key" | Typo or extra space in the header value |
| "NoSkip: empty SMS" on a real payment | `text` must be **Shortcut Input → Content**, not plain Shortcut Input |
| "not a transaction, skipped" | The parser didn't recognise the format. Add it as a test case (see Maintenance) |
| Payment never appears | Check "Last SMS …" in Settings. If it never updates, the automation isn't firing (keyword or Run Immediately) |

---

## Where things are

| Piece | File |
|---|---|
| Database (tables, RLS, learning RPC) | `supabase/migrations/20261012120000_sms_auto_import.sql` |
| SMS parser + tests | `supabase/functions/_shared/smsParser.ts`, `smsParser.test.ts` |
| Categories + built-in merchants + tests | `supabase/functions/_shared/merchantCategories.ts`, `merchantCategories.test.ts` |
| Edge function | `supabase/functions/ingest-sms/index.ts` (`verify_jwt = false` in `supabase/config.toml`) |
| Data hooks | `src/hooks/useSmsImport.ts` |
| Confirm dialog + paste box | `src/components/expenses/ReviewQueueDialog.tsx` (+ `.test.tsx`) |
| Banner / auto-open | `src/components/expenses/ReviewQueueLauncher.tsx` (mounted in `AppLayout`) |
| Settings section + rules | `src/components/expenses/SmsImportSettings.tsx` |
| Gmail import script | `docs/gmail-import.gs` (runs in my Google account, not in this repo's deploy) |
| Email columns + duplicate status | `supabase/migrations/20261116120000_email_import.sql` |

**Database tables:**
- `sms_messages`: raw + parsed SMS **and alert emails** (`source` = `sms` / `email`), with
  status `expense`, `review`, `income`, `ignored` or `duplicate` (+ `duplicate_of`, `card_last4`)
- `merchant_rules`: learned shop → category, with confirm count, auto and always-ask flags
- new columns on `expenses`: `origin`, `review_status`, `sms_message_id`
- new columns on `incomes`: `origin`, `sms_message_id`

## What's left

- [ ] Regenerate `src/integrations/supabase/types.ts`
      (`npx supabase gen types typescript --linked`) and remove the temporary untyped client
      in `useSmsImport.ts`.
- [ ] Commit and push to `main` so Vercel ships the confirm dialog to the live site.
- [ ] Change the `CITYTOUCH` automation's keyword to `A/C:`, and add `TxnID` if I start using Nagad.
- [ ] If City Bank sends a separate purchase SMS that names the shop, add that format so
      card payments can be learned too.
