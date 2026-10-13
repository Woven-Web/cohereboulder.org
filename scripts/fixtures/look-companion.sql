-- Today's practice and one quest for the ecology look lane (scripts/ecology-e2e.mjs).
-- Placeholder copy, not the real festival content. The Worker reads the Denver
-- date, so seed the dates either side of "now" in both UTC-6 and UTC-7.
INSERT OR REPLACE INTO companion_daily (date, title, body, title_es, body_es, question, question_es)
SELECT d, 'Learn three neighbours'' names', 'Learn the names of three living things nearby. A tree, a bird, a weed, a person at the next table all count.', 'Aprende tres nombres del lugar', 'Aprende el nombre de tres seres vivos cercanos.', 'Who or what around you has been here longer than you have?', '¿Quién o qué a tu alrededor lleva aquí más tiempo que tú?'
FROM (SELECT date('now','-6 hours') AS d UNION SELECT date('now','-7 hours') UNION SELECT date('now','-6 hours','+1 day') UNION SELECT date('now','-7 hours','+1 day'));
INSERT OR REPLACE INTO companion_quests (id, title, description, title_es, description_es, start_date, end_date)
VALUES ('meet-a-neighbour', 'Meet a neighbour', 'Introduce yourself to someone on your street.', 'Conoce a un vecino', 'Preséntate con alguien de tu calle.', '2026-10-15', '2026-10-25');
