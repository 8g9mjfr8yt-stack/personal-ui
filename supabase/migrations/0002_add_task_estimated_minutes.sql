-- Pridáva odhadovanú dĺžku úlohy v minútach.
--
-- Dôvod: hlasový agent nevie odpovedať na otázky typu "Mám 35 minút voľna,
-- čo sa tam zmestí?" (príklad priamo z PROJECT.md časť 10) bez toho, aby
-- poznal aspoň hrubý odhad trvania jednotlivých úloh.

alter table tasks
  add column estimated_minutes integer;

comment on column tasks.estimated_minutes is
  'Hrubý odhad trvania úlohy v minútach. Nepovinné, vypĺňa ho agent alebo používateľ. Slúži na navrhovanie úloh do voľných časových blokov.';
