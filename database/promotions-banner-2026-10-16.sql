-- Dorado | Administrador de promociones en franja superior.
-- Se inicia oculto: no anunciar descuentos hasta que el negocio los cargue.
alter table public.site_settings
  add column if not exists promotions jsonb not null default '[]'::jsonb;

alter table public.site_settings
  drop constraint if exists site_settings_promotions_valid;

alter table public.site_settings
  add constraint site_settings_promotions_valid
  check (jsonb_typeof(promotions) = 'array' and jsonb_array_length(promotions) <= 8);

comment on column public.site_settings.promotions is
  'Mensajes promocionales administrables; solo enabled=true se expone públicamente. No modifica precios ni pedidos.';
