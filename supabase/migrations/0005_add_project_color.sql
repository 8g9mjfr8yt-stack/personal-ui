-- Denný agent 2.0: voliteľná farba akcentu projektu. Keď je NULL, UI
-- použije predvolenú šalviovú (#5B7F66) — spätne kompatibilné, žiadny
-- existujúci projekt sa vizuálne nezmení, kým si používateľ farbu
-- výslovne nenastaví.
alter table projects
  add column accent_color text;

comment on column projects.accent_color is
  'Voliteľná farba akcentu projektu (hex, napr. #5B7F66). Prenáša sa aj na jeho úlohy/podúlohy naprieč UI. NULL = predvolená farba.';
