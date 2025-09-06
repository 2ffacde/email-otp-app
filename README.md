# Home.pl OTP Fetcher

This project contains a simple web interface and Netlify function that reads
your Home.pl email inbox via IMAP and extracts the latest 6‑digit verification
code.  It is handy for quickly grabbing time‑sensitive login codes from
services like ChatGPT without opening your mail client.

## How It Works

* The serverless function (`netlify/functions/get-otp.js`) uses the
  [imapflow](https://github.com/postalsys/imapflow) library to connect to your
  Home.pl mailbox over IMAP (`post.pl` on port `993` using SSL/TLS by default).
* It searches the last few messages in your INBOX for a 6‑digit number in the
  subject line or message body and returns the first match.
* A simple HTML frontend (`public/index.html`) prompts for a shared secret and
  makes a POST request to the function.  The secret protects the endpoint
  against unauthorised use.

## Deployment

1. **Clone or upload** the contents of this folder to a new Git repository.
2. **Create a new site on Netlify** and select your repository.
3. **Set environment variables** in your Netlify dashboard under **Site ▸ Settings ▸ Environment variables**:

   | Variable         | Description                                           |
   |----------------- |-------------------------------------------------------|
   | `MAIL_HOST`      | IMAP host for Home.pl (use `post.pl`)                 |
   | `MAIL_PORT`      | IMAP port (`993` for SSL/TLS)                          |
   | `MAIL_USER`      | Your full e‑mail address (e.g. `gptz7@cloudkeys.pl`)    |
   | `MAIL_PASS`      | The e‑mail account password                            |
   | `MAIL_TLS`       | Set to `true` (default) for encrypted connection       |
   | `SHARED_SECRET`  | Any secret phrase to restrict access to the endpoint  |

4. **Deploy** the site.  Once built, visit your site.  Enter the `SHARED_SECRET`
   in the input field and click **Pobierz kod**.  The latest 6‑digit code
   from your mailbox will be displayed.

## Notes

* The function only reads messages and does not mark them as seen or alter them.
* If the code cannot be found in the latest 15 messages, the function returns a
  404 response.
* If you want to limit the search to specific senders or subjects, you can
  update the `get-otp.js` function to filter messages accordingly (e.g. check
  `msg.envelope.from` or test the subject against a pattern before parsing the
  full message).

## Home.pl IMAP Settings

According to Home.pl documentation, the IMAP server for accessing a mailbox is
`post.pl` on port `993` when using SSL/TLS.  These values are used by default
in the Netlify function configuration【292287612178934†L48-L63】.