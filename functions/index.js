/* ==========================================================================
   Firebase Cloud Functions — timothyehrlichmd.com
   ==========================================================================
   submitLead — HTTP endpoint that accepts a contact-form submission, writes
   a record to the `leads` Firestore collection, and notifies Dr. Ehrlich
   by email via Resend.

   Called from the site via Firebase Hosting rewrite at /api/submitLead.
   No PHI is collected — just name, phone, email, and selected interests.
   ========================================================================== */

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { Resend } = require('resend');

initializeApp();
const db = getFirestore();

// --- Secrets and constants ---
const RESEND_API_KEY = defineSecret('RESEND_API_KEY');

// Where the notification email gets sent. Not a secret — change in code if
// it needs to move (e.g. to a practice inbox once Workspace is set up).
// TEMPORARY: pointed at a test inbox during setup/testing. Change back to
// Tbehrlichmd@gmail.com before going live.
const DESTINATION_EMAIL = 'connoly252@me.com';

// The From address shown to Dr. Ehrlich. Must be on a domain verified in
// Resend. Until the domain is verified, change this to the Resend
// onboarding address while testing.
const FROM_EMAIL = 'Timothy Ehrlich, MD <contact@timothyehrlichmd.com>';

// --- Helpers ---

function clampString(value, max) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const INTEREST_LABELS = {
  hair:   'Hair Loss Restoration',
  weight: 'Weight Management',
  hrt:    'Testosterone Replacement'
};

// --- The function ---

exports.submitLead = onRequest(
  {
    region: 'us-central1',
    secrets: [RESEND_API_KEY],
    cors: false, // same-origin via Hosting rewrite, no CORS needed
    invoker: 'public'
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    try {
      const body = req.body || {};

      // Honeypot — silently drop bots that fill the hidden field.
      if (body.website) {
        res.status(200).json({ ok: true });
        return;
      }

      const name     = clampString(body.name, 200);
      const phone    = clampString(body.phone, 50);
      const email    = clampString(body.email, 200);
      const interests = Array.isArray(body.interests)
        ? body.interests
            .filter(i => typeof i === 'string')
            .slice(0, 10)
            .map(i => clampString(i, 50))
        : [];

      if (!name || !email || !phone) {
        res.status(400).json({ error: 'Please fill in your name, phone, and email.' });
        return;
      }
      if (!isValidEmail(email)) {
        res.status(400).json({ error: 'Please enter a valid email address.' });
        return;
      }

      // Write to Firestore (system of record)
      const lead = {
        name,
        phone,
        email,
        interests,
        userAgent: clampString(req.headers['user-agent'] || '', 500),
        ip: clampString(req.headers['x-forwarded-for'] || req.ip || '', 100),
        createdAt: FieldValue.serverTimestamp()
      };
      const docRef = await db.collection('leads').add(lead);

      // Notify Dr. Ehrlich. If this fails we still consider the submission
      // captured (lead is safely in Firestore) and return success to the user;
      // the missing email gets logged so we can re-notify manually.
      const interestNames = interests.length
        ? interests.map(k => INTEREST_LABELS[k] || k).join(', ')
        : 'None selected';

      const subject = `New inquiry from ${name}`;
      const text = [
        `New patient inquiry`,
        ``,
        `Name:        ${name}`,
        `Phone:       ${phone}`,
        `Email:       ${email}`,
        `Interested:  ${interestNames}`,
        ``,
        `Reply to this email to respond to ${name} directly.`,
        ``,
        `Lead ID: ${docRef.id}`
      ].join('\n');

      const html = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1A2430;max-width:560px">
          <h2 style="color:#1F5F94;font-family:Georgia,serif;margin:0 0 16px">New patient inquiry</h2>
          <table style="border-collapse:collapse;width:100%;font-size:15px">
            <tr><td style="padding:6px 12px 6px 0;color:#8596A3">Name</td><td style="padding:6px 0">${escapeHtml(name)}</td></tr>
            <tr><td style="padding:6px 12px 6px 0;color:#8596A3">Phone</td><td style="padding:6px 0">${escapeHtml(phone)}</td></tr>
            <tr><td style="padding:6px 12px 6px 0;color:#8596A3">Email</td><td style="padding:6px 0"><a href="mailto:${escapeHtml(email)}" style="color:#1F5F94">${escapeHtml(email)}</a></td></tr>
            <tr><td style="padding:6px 12px 6px 0;color:#8596A3;vertical-align:top">Interested in</td><td style="padding:6px 0">${escapeHtml(interestNames)}</td></tr>
          </table>
          <p style="color:#4A5765;font-size:14px;margin:24px 0 0">
            Replying to this email will respond to <strong>${escapeHtml(name)}</strong> directly.
          </p>
          <p style="color:#8596A3;font-size:12px;margin:24px 0 0">Lead ID: ${escapeHtml(docRef.id)}</p>
        </div>
      `;

      try {
        const resend = new Resend(RESEND_API_KEY.value());
        await resend.emails.send({
          from: FROM_EMAIL,
          to: DESTINATION_EMAIL,
          // Set reply-to so Dr. Ehrlich can reply straight to the patient.
          // Different Resend SDK versions accept replyTo (camelCase) vs
          // reply_to (snake_case); set both so whichever is honored wins.
          replyTo: email,
          reply_to: email,
          subject,
          html,
          text
        });
      } catch (emailErr) {
        console.error('Resend send failed for lead', docRef.id, emailErr);
        // Mark the lead so we can find ones that failed notification.
        await docRef.update({
          notificationError: String(emailErr && emailErr.message || emailErr).slice(0, 500),
          notificationErrorAt: FieldValue.serverTimestamp()
        });
      }

      res.status(200).json({ ok: true, leadId: docRef.id });
    } catch (err) {
      console.error('submitLead failed:', err);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  }
);
