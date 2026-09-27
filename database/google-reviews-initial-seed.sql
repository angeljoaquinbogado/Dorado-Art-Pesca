-- DORADO — carga inicial de reseñas públicas de Google Maps
-- Fuente proporcionada por el usuario el 2026-09-27.
-- Las fechas relativas se preservan literalmente; no se inventan fechas exactas.

alter table public.resenas_google
  add column if not exists fecha_texto text;

insert into public.resenas_google
(external_id, autor, avatar_url, calificacion, comentario, fecha_resena, fecha_texto, fuente_url, activa)
values
('manual-google-20260927-01','Sebastián Ré',null,5,'Buena variedad, buenos precios, y el dueño es un capo! Muy buena onda 😎…',null,'Hace 5 meses','https://maps.app.goo.gl/jWDsmRDAwD2SeWJS8',true),
('manual-google-20260927-02','Anaisabel Peña MartinezjNo',null,5,'Muy amables y muy majos.nos dieron todo lo que necesitamos',null,'Hace 4 meses','https://maps.app.goo.gl/jWDsmRDAwD2SeWJS8',true),
('manual-google-20260927-03','Rodrigo Aguirre',null,5,'Excelente lugar muy completo y el dueño un capo altamente recomendado!',null,'Hace 8 meses','https://maps.app.goo.gl/jWDsmRDAwD2SeWJS8',true),
('manual-google-20260927-04','dario',null,5,'Muy bueno atención precio y calidad muchas variedad en artículos para la pesca',null,'Editado Hace 6 meses','https://maps.app.goo.gl/jWDsmRDAwD2SeWJS8',true),
('manual-google-20260927-05','Fabian Rossi',null,5,'Muy bueno, muy amables, te asesora muy bien!',null,'Hace 5 meses','https://maps.app.goo.gl/jWDsmRDAwD2SeWJS8',true),
('manual-google-20260927-06','miguel angel pereira',null,5,'Muy buena casa de pesca y una excelente atención diez puntos',null,'Hace 8 meses','https://maps.app.goo.gl/jWDsmRDAwD2SeWJS8',true),
('manual-google-20260927-07','sergio collodel',null,5,'Excelente atención, lugar pequeño pero de buena onda, Buenos precios y discreto surtido. Lo recomiendo',null,'Editado Hace un año','https://maps.app.goo.gl/jWDsmRDAwD2SeWJS8',true),
('manual-google-20260927-08','Agustina Álvarez',null,5,'Buenos productos, variedad, excelente atención! Muy recomendado',null,'Hace 2 años','https://maps.app.goo.gl/jWDsmRDAwD2SeWJS8',true),
('manual-google-20260927-09','Ezequiel Martinez',null,5,'Buena atencion, buenos articulos y buen precio! recomendado para el que esta empezando como yo.',null,'Hace un año','https://maps.app.goo.gl/jWDsmRDAwD2SeWJS8',true),
('manual-google-20260927-10','Guada',null,5,'Es el emprendimiento de mi papá, super confiable y excelente calidad, no se van a arrepentir de pasar a ver un poco de lo que es Dorado art. de Pesca. Lo mejor para los pescadores!!💪🏼🐟…',null,'Editado Hace un año','https://maps.app.goo.gl/jWDsmRDAwD2SeWJS8',true),
('manual-google-20260927-11','Ayelen Ligia Marin',null,5,'Excelente atención y predisposición! Tiene de todo! Muy recomendable! Y pescamos un montón con las cosas que compramos👍…',null,'Hace un año','https://maps.app.goo.gl/jWDsmRDAwD2SeWJS8',true),
('manual-google-20260927-12','pablo zapata',null,5,'Muy buen lugar con todo lo que necesitas para la pesca la atención y los precios de 10!',null,'Hace un año','https://maps.app.goo.gl/jWDsmRDAwD2SeWJS8',true),
('manual-google-20260927-13','Tomas Labourt',null,5,'Excelente atención de Maxi, la tiene re clara!',null,'Hace 10 meses','https://maps.app.goo.gl/jWDsmRDAwD2SeWJS8',true),
('manual-google-20260927-14','Juan Pablo',null,5,'Lindos productos a buen precio excelente lugar',null,'Hace 2 años','https://maps.app.goo.gl/jWDsmRDAwD2SeWJS8',true),
('manual-google-20260927-15','salvador stricker',null,5,'Muy buena atención y muy buenos precios👌👌…',null,'Hace 2 años','https://maps.app.goo.gl/jWDsmRDAwD2SeWJS8',true),
('manual-google-20260927-16','Raúl Guaráz',null,5,'Excelente atencion',null,'Hace 6 meses','https://maps.app.goo.gl/jWDsmRDAwD2SeWJS8',true),
('manual-google-20260927-17','Guillermina Celdane',null,5,'Excelente',null,'Hace 8 meses','https://maps.app.goo.gl/jWDsmRDAwD2SeWJS8',true),
('manual-google-20260927-18','Maximiliano Robledo',null,5,'Excelente atención, buenos precios, variedad y calidad',null,'Hace 5 días','https://maps.app.goo.gl/jWDsmRDAwD2SeWJS8',true),
('manual-google-20260927-19','Fernando Marticorena',null,5,'Muy buenos precios y gran surtido en artículos de pesca. Los sábados esta hasta las 20hs.',null,'Hace un mes','https://maps.app.goo.gl/jWDsmRDAwD2SeWJS8',true),
('manual-google-20260927-20','Guada Villarino',null,5,null,null,'Hace 4 meses','https://maps.app.goo.gl/jWDsmRDAwD2SeWJS8',true),
('manual-google-20260927-21','Marco Flaman',null,5,null,null,'Hace 7 meses','https://maps.app.goo.gl/jWDsmRDAwD2SeWJS8',true),
('manual-google-20260927-22','Victor Morinigo',null,5,null,null,'Hace 10 meses','https://maps.app.goo.gl/jWDsmRDAwD2SeWJS8',true),
('manual-google-20260927-23','Facundo Santucho',null,5,null,null,'Hace 10 meses','https://maps.app.goo.gl/jWDsmRDAwD2SeWJS8',true),
('manual-google-20260927-24','rafael quiroga',null,5,null,null,'Hace un año','https://maps.app.goo.gl/jWDsmRDAwD2SeWJS8',true),
('manual-google-20260927-25','diogoo',null,5,null,null,'Hace un año','https://maps.app.goo.gl/jWDsmRDAwD2SeWJS8',true),
('manual-google-20260927-26','Prii Juarez',null,5,null,null,'Hace 2 años','https://maps.app.goo.gl/jWDsmRDAwD2SeWJS8',true),
('manual-google-20260927-27','Jorge Luis Bisso',null,5,null,null,'Hace 2 años','https://maps.app.goo.gl/jWDsmRDAwD2SeWJS8',true)
on conflict (external_id) do update set
  autor=excluded.autor,
  avatar_url=excluded.avatar_url,
  calificacion=excluded.calificacion,
  comentario=excluded.comentario,
  fecha_resena=excluded.fecha_resena,
  fecha_texto=excluded.fecha_texto,
  fuente_url=excluded.fuente_url,
  activa=excluded.activa,
  updated_at=now();
