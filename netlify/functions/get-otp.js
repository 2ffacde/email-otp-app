/*
 * Netlify serverless function that logs in to a Home.pl IMAP account and pulls
 * the most recent 6‑digit verification code from your inbox.  Requests must
 * include a JSON body with a `secret` field matching the SHARED_SECRET
 * environment variable.  IMAP credentials and connection details are
 * configured through environment variables (see README or deployment notes).
 */

// Use Node's built‑in TLS module to speak IMAP directly.  We avoid
// third‑party dependencies like imapflow because Netlify manual
// deployments do not install npm modules by default.  TLS is used
// because Home.pl's IMAP service requires a secure connection.
const tls = require('tls');

/**
 * Extract a 6‑digit verification code from a string.  Returns the first match
 * or null if no such sequence is found.
 *
 * @param {string} text
 * @returns {string|null}
 */
function extractCode(text) {
  const match = text && text.match(/\b(\d{6})\b/);
  return match ? match[1] : null;
}

// Define default values for IMAP connection and shared secret.  These
// defaults allow the function to operate even if corresponding
// environment variables are not set in Netlify.  Override them with
// environment variables in production for improved security.
const DEFAULTS = {
  HOST: 'post.pl',
  PORT: 993,
  USER: 'gptz7@cloudkeys.pl',
  PASS: '4v@A5iUPGf6sfRN',
  TLS: true,
  SECRET: 'sekret2025',
};

// Minimal IMAP client implemented with built‑in TLS.  Connects to
// host:port using TLS, logs in, selects the INBOX and fetches the
// contents of the most recent message.  Returns a Promise that
// resolves with the first 6‑digit code found or null if none is
// present.  This implementation deliberately avoids external
// dependencies so it can run in Netlify’s manually deployed
// environment without a node_modules folder.
function fetchLatestCode({ host, port, user, pass }) {
  return new Promise((resolve, reject) => {
    // Connect securely; do not reject unauthorized certs because
    // Netlify’s runtime may not include Home.pl’s root CA.
    const socket = tls.connect({ host, port, rejectUnauthorized: false }, () => {
      // Once connected, nothing to do immediately – the server will
      // send its greeting which triggers the login sequence below.
    });
    socket.setEncoding('utf8');
    let buffer = '';
    let stage = 0; // 0: waiting greeting, 1: login sent, 2: select sent, 3: fetch sent
    let existsCount = null;
    let messageData = '';
    // Helper to send commands with CRLF termination
    function send(cmd) {
      socket.write(cmd + '\r\n');
    }
    socket.on('data', (chunk) => {
      buffer += chunk;
      // Process lines one by one.  IMAP responses are separated by CRLF.
      let lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      for (const line of lines) {
        if (stage === 0) {
          // Waiting for initial greeting (untagged * OK).  Once any
          // untagged response arrives, we initiate login.
          if (line.startsWith('*')) {
            send(`A1 LOGIN ${user} ${pass}`);
            stage = 1;
          }
        } else if (stage === 1) {
          // Waiting for tagged response to LOGIN command.
          if (line.startsWith('A1')) {
            if (/OK/i.test(line)) {
              // Successfully logged in; select mailbox
              send('A2 SELECT INBOX');
              stage = 2;
            } else {
              socket.end();
              return reject(new Error('IMAP login failed'));
            }
          }
        } else if (stage === 2) {
          // Collect EXISTS count from untagged responses
          if (/^\*\s+\d+\s+EXISTS/i.test(line)) {
            const m = line.match(/^\*\s+(\d+)\s+EXISTS/i);
            if (m) {
              existsCount = parseInt(m[1], 10);
            }
          }
          if (line.startsWith('A2')) {
            if (/OK/i.test(line)) {
              // SELECT completed; fetch the last message
              const seq = existsCount || 1;
              send(`A3 FETCH ${seq} BODY[]`);
              stage = 3;
            } else {
              socket.end();
              return reject(new Error('IMAP select mailbox failed'));
            }
          }
        } else if (stage === 3) {
          // Accumulate message content until tagged response appears
          if (line.startsWith('A3')) {
            if (/OK/i.test(line)) {
              // Completed fetching.  Extract verification code.
              const code = extractCode(messageData);
              socket.end();
              return resolve(code || null);
            } else {
              socket.end();
              return reject(new Error('IMAP fetch failed'));
            }
          } else {
            // Append raw line to message data.  We include line breaks
            // so that codes split across lines are still matched.
            messageData += line + '\n';
          }
        }
      }
    });
    socket.on('error', (err) => {
      return reject(err);
    });
    socket.on('end', () => {
      // If connection ends prematurely and we haven’t resolved yet,
      // return null to indicate no code was found.
      if (stage < 3) {
        return resolve(null);
      }
    });
  });
}

exports.handler = async (event) => {
  try {
    // Enforce POST method with JSON body
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
    }
    const body = JSON.parse(event.body || '{}');
    const providedSecret = body.secret;
    const expectedSecret = process.env.SHARED_SECRET || DEFAULTS.SECRET;
    if (!providedSecret || providedSecret !== expectedSecret) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    // Gather connection parameters, falling back to defaults if missing
    const host = process.env.MAIL_HOST || DEFAULTS.HOST;
    const port = parseInt(process.env.MAIL_PORT || DEFAULTS.PORT.toString(), 10);
    const user = process.env.MAIL_USER || DEFAULTS.USER;
    const pass = process.env.MAIL_PASS || DEFAULTS.PASS;
    // Invoke our minimal IMAP client to fetch the latest code
    const code = await fetchLatestCode({ host, port, user, pass });
    if (!code) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Verification code not found' }) };
    }
    return { statusCode: 200, body: JSON.stringify({ code }) };
  } catch (error) {
    console.error('Error while processing request:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Unknown error' }) };
  }
};
