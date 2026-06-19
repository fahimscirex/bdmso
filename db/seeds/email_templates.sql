-- Starter email templates for the Broadcast composer. Bodies are markdown
-- (the composer renders them to HTML on send). {{vars}} are NOT expanded, so
-- these use generic wording the admin can tweak before sending.
-- Re-runnable: INSERT OR REPLACE refreshes by unique name.

INSERT OR REPLACE INTO email_templates (name, subject, body, category) VALUES
('Payment reminder',
 'Action needed: complete your BdMSO registration payment',
 '## Your registration is almost complete

Dear Guardian,

We noticed that the payment for your child''s BdMSO registration has not been completed yet. The seat is confirmed only once payment is received.

Please complete the payment at your earliest convenience to secure participation. If you have already paid, kindly disregard this message.

Warm regards,
**Team BdMSO**',
 'reminder'),

('Registration confirmed',
 'Welcome to BdMSO - your registration is confirmed',
 '## Registration confirmed

Dear Guardian,

Thank you for registering with the **Bangladesh Mathematics & Science Olympiad**. Your registration has been received and confirmed.

We will share the exam venue, date, and reporting time in a follow-up email closer to the event. Please keep an eye on your inbox.

We look forward to your child''s participation.

Warm regards,
**Team BdMSO**',
 'confirmation'),

('Exam day details',
 'Your BdMSO exam: venue, date and what to bring',
 '## Exam day details

Dear Guardian,

Here are the details for the upcoming BdMSO exam:

- **Date:** _to be filled in_
- **Reporting time:** _to be filled in_
- **Venue:** _to be filled in_

**Please bring:**

- The participant''s admit card or BdMSO ID
- A valid school ID
- Pen, pencil, and eraser

Participants should report at least 30 minutes before the start time. Calculators and mobile phones are not permitted in the exam hall.

Best of luck!
**Team BdMSO**',
 'event'),

('Event invitation',
 'You are invited - BdMSO event',
 '## You are invited

Dear Guardian,

We are delighted to invite you and your child to an upcoming BdMSO event.

- **Event:** _to be filled in_
- **Date:** _to be filled in_
- **Venue:** _to be filled in_

Please confirm your attendance by replying to this email. We hope to see you there.

Warm regards,
**Team BdMSO**',
 'event'),

('Results announcement',
 'BdMSO results are out',
 '## Results are now available

Dear Guardian,

The results for the recent BdMSO round have been published. Thank you for your child''s enthusiastic participation.

You can view the results and any next steps on our website. Medalists and qualifiers will receive separate instructions regarding the next stage.

Congratulations to all participants!
**Team BdMSO**',
 'announcement'),

('General announcement',
 'An update from BdMSO',
 '## An update from BdMSO

Dear Guardian,

We are writing to share an important update.

_Replace this paragraph with your announcement._

Thank you for being part of the BdMSO community.

Warm regards,
**Team BdMSO**',
 'announcement');
