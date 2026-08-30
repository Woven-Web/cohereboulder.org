-- Refresh the register-2026 form to the authoritative 2026 registration doc
-- (adds the donation question and the post-submit completion screen).
--
-- The questions are DATA (see schema.sql): running this is the "deploy" for
-- copy changes. Prerequisite, once per database, BEFORE deploying a Worker
-- that selects the column (harmless to the old Worker):
--
--   npx wrangler d1 execute cohere --remote --command "ALTER TABLE forms ADD COLUMN completion TEXT"
--
-- (SQLite has no ADD COLUMN IF NOT EXISTS; if the column already exists this
-- fails with "duplicate column name", which means it is already applied.)
-- Then:
--
--   npx wrangler d1 execute cohere --remote --file worker/register-2026-refresh.sql
--
-- The upsert leaves title, event, active and the confirmation email untouched
-- on an existing row, so it is safe to re-run.

INSERT INTO forms (slug, title, event, fields, active, completion, created_at, updated_at)
VALUES (
  'register-2026',
  'Register for COhere Boulder 2026',
  'october2026',
  '[{"key":"full_name","label":"Full Name","label_es":"Nombre Completo","type":"text","required":true},{"key":"email","label":"Email Address","label_es":"Correo Electrónico","type":"email","required":true},{"key":"phone","label":"Phone Number","label_es":"Número de Teléfono","help":"So we can invite you to a COhere communication channel.","help_es":"Para invitarte a un canal de comunicación de COhere.","type":"tel"},{"key":"orgs","label":"Local organization(s) you''re affiliated with, if any","label_es":"Organización(es) local(es) con las que estás afiliado/a, si corresponde","type":"text"},{"key":"attending_invocation","label":"Do you plan to attend the Invocation (Opening) Gathering?","label_es":"¿Planeas asistir a la Invocación (Reunión de Apertura)?","help":"Thursday, October 15th at The Riverside — shared meal, speakers, activities, live music.","help_es":"Jueves 15 de octubre en The Riverside — comida compartida, oradores, actividades y música en vivo.","type":"radio","options":["Yes","No"],"options_es":["Sí","No"]},{"key":"attending_integration","label":"Do you plan to attend the Integration (Closing) Party?","label_es":"¿Planeas asistir a la Fiesta de Integración (Cierre)?","help":"Sunday, October 25th — harvest activities, live music, food and drink.","help_es":"Domingo 25 de octubre — actividades de cosecha, música en vivo, comida y bebida.","type":"radio","options":["Yes","No"],"options_es":["Sí","No"]},{"key":"how_did_you_hear","label":"How did you hear about COhere?","label_es":"¿Cómo te enteraste de COhere?","type":"text"},{"key":"resilience_nomination","label":"We''ll be highlighting stories of resilience in our community. Is there any individual or organization (including yourself) you''d like to nominate to share?","label_es":"Estaremos destacando historias de resiliencia en nuestra comunidad. ¿Hay alguna persona u organización (incluyéndote a ti) que quieras nominar para compartir?","type":"textarea"},{"key":"contribution","label":"What will you contribute this year?","label_es":"¿Qué contribuirás este año?","intro":"COhere is fueled by donations, and people giving what they can to invest in community. We invite those who are able to give more financially to support those who don''t have as abundant of financial means.\n\nBy registering, you will have access to the 20+ events happening throughout COhere this year (Oct 15-25th), almost all of them are free. If you''ve spent $100 on concert tickets this year, consider the relative value of COhere to you and the community you live in.","intro_es":"COhere se sostiene con donaciones, con personas que dan lo que pueden para invertir en la comunidad. Invitamos a quienes pueden dar más financieramente a apoyar a quienes no cuentan con medios económicos tan abundantes.\n\nAl registrarte tendrás acceso a los más de 20 eventos de COhere este año (15-25 de octubre); casi todos son gratuitos. Si este año gastaste $100 en entradas para conciertos, considera el valor relativo de COhere para ti y para la comunidad en la que vives.","help":"Please make your donation at: https://www.zeffy.com/en-US/donation-form/enriching-boulders-ecology-support-cohere-boulder--2026 (Link available after completing registration form)","help_es":"Por favor haz tu donación en: https://www.zeffy.com/en-US/donation-form/enriching-boulders-ecology-support-cohere-boulder--2026 (el enlace estará disponible al completar el formulario de registro)","type":"radio","options":["$30","$100","$250","$500"],"allow_other":true},{"key":"volunteer_interest","label":"Are you interested in volunteering at one or more COhere events?","label_es":"¿Te interesa ser voluntario/a en uno o más eventos de COhere?","help":"We''ll email you with more info.","help_es":"Te enviaremos más información por correo.","type":"radio","options":["Yes","No"],"options_es":["Sí","No"]},{"key":"additional_notes","label":"Additional Notes or Comments","label_es":"Notas o Comentarios Adicionales","help":"You can also email us at cohere@wovenweb.org for event proposals, ideas for collaborations, etc.","help_es":"También puedes escribirnos a cohere@wovenweb.org para propuestas de eventos, ideas de colaboración, etc.","type":"textarea"},{"key":"subscribed","label":"Yes, I''d like to receive COhere updates and community news.","label_es":"Sí, quiero recibir novedades de COhere y noticias de la comunidad.","type":"checkbox","default":true}]',
  1,
  '{"title":"Thank you for registering for COhere!","title_es":"¡Gracias por registrarte en COhere!","body":"We can''t wait to weave with you this October. If you opted in, you''ll receive email updates as the event approaches.\n\nBefore you move on to other things, please make your donation:","body_es":"Estamos deseando tejer contigo este octubre. Si optaste por recibirlas, te llegarán novedades por correo a medida que se acerque el evento.\n\nAntes de pasar a otra cosa, por favor haz tu donación:","link":"https://www.zeffy.com/en-US/donation-form/enriching-boulders-ecology-support-cohere-boulder--2026","link_label":"Make your donation","link_label_es":"Haz tu donación"}',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(slug) DO UPDATE SET
  fields     = excluded.fields,
  completion = excluded.completion,
  updated_at = excluded.updated_at;
