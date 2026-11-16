/**
 * NoSkip — import bank alert emails from Gmail.
 *
 * Runs inside YOUR Google account (script.google.com), every 5 minutes, on
 * Google's servers: it works while your phone and laptop are off. It finds new
 * bank alert emails and sends each one to NoSkip's ingest-sms function, the
 * same endpoint the iPhone Shortcut uses. Setup: docs/sms-auto-import.md →
 * "Gmail import".
 *
 * Nothing is lost when NoSkip is unreachable: a message is only remembered as
 * sent after NoSkip answers, so the next run retries it. Sending one twice is
 * harmless too — NoSkip recognises it and answers "duplicate".
 *
 * Script properties (Project Settings → Script properties):
 *   NOSKIP_URL  https://<project-ref>.supabase.co/functions/v1/ingest-sms
 *   NOSKIP_KEY  the same secret as the Shortcut's x-noskip-key (SMS_INGEST_SECRET)
 */

// Banks whose alert emails NoSkip should read: a full address or a whole domain.
// City Bank sends card alerts from citybankplc.com and CITYTOUCH alerts from thecitybank.com.
const SENDERS = [
  'citybankplc.com',
  'thecitybank.com',
];

// How far back each run looks. Messages already sent are skipped (see SENT_KEY),
// so this only needs to cover the longest gap between runs, plus slack.
const LOOK_BACK = '3d';

const SENT_KEY = 'sentMessageIds';
const MAX_REMEMBERED = 500;
const LABEL = 'NoSkip';

/** The 5-minute job. */
function importBankEmails() {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('NOSKIP_URL');
  const key = props.getProperty('NOSKIP_KEY');
  if (!url || !key) throw new Error('Set NOSKIP_URL and NOSKIP_KEY in Project Settings → Script properties.');

  // Two runs must not send at the same time
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10 * 1000)) return;
  try {
    const sent = JSON.parse(props.getProperty(SENT_KEY) || '[]');
    const seen = new Set(sent);
    const label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
    const query = '(' + SENDERS.map(function (s) { return 'from:' + s; }).join(' OR ') + ') newer_than:' + LOOK_BACK;

    // Per message, not per thread: Gmail groups alerts with the same subject into one thread
    GmailApp.search(query, 0, 100).forEach(function (thread) {
      thread.getMessages().forEach(function (msg) {
        const id = msg.getId();
        if (seen.has(id)) return;
        if (!SENDERS.some(function (s) { return msg.getFrom().toLowerCase().indexOf(s) !== -1; })) return;

        const text = (msg.getSubject() + '\n\n' + msg.getPlainBody()).slice(0, 8000);
        const res = UrlFetchApp.fetch(url, {
          method: 'post',
          contentType: 'application/json',
          headers: { 'x-noskip-key': key },
          payload: JSON.stringify({ text: text, sender: msg.getFrom(), source: 'email' }),
          muteHttpExceptions: true,
        });
        const code = res.getResponseCode();
        let reply = {};
        try { reply = JSON.parse(res.getContentText()); } catch (e) { /* not JSON */ }

        // 200 = handled (filed, duplicate or skipped). 4xx other than 401 = this email
        // will never work, don't retry forever. 401 and 5xx = try again next run.
        if (code === 200 || (code >= 400 && code < 500 && code !== 401)) {
          seen.add(id);
          sent.push(id);
          thread.addLabel(label);
          console.log(code + ' ' + (reply.message || reply.error || '') + ' — ' + msg.getSubject());
        } else {
          console.warn('Will retry (' + code + '): ' + (reply.message || reply.error || '') + ' — ' + msg.getSubject());
        }
      });
    });

    props.setProperty(SENT_KEY, JSON.stringify(sent.slice(-MAX_REMEMBERED)));
  } finally {
    lock.releaseLock();
  }
}

/** Run once: starts the 5-minute timer (and removes any older copy of it). */
function install() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'importBankEmails'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('importBankEmails').timeBased().everyMinutes(5).create();
  importBankEmails();
}

/** Run to stop importing. */
function uninstall() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'importBankEmails'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
}
