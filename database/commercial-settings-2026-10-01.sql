-- Dorado · centralized commercial settings · 2026-10-01
alter table public.site_settings
  add column if not exists store_name text not null default 'Dorado Artículos de Pesca',
  add column if not exists whatsapp_phone text not null default '5491168070039',
  add column if not exists phone_display text not null default '+54 9 11 6807-0039',
  add column if not exists address_line text not null default 'Las Heras 1680',
  add column if not exists address_area text not null default 'Carupá, San Fernando',
  add column if not exists address_province text not null default 'Buenos Aires',
  add column if not exists postal_code text not null default 'B1646',
  add column if not exists maps_url text not null default 'https://maps.app.goo.gl/jWDsmRDAwD2SeWJS8',
  add column if not exists legal_holder text not null default 'Maximiliano Adrian Villarino',
  add column if not exists tax_id text not null default '20-25635728-4',
  add column if not exists default_stock_control boolean not null default false,
  add column if not exists checkout_whatsapp_enabled boolean not null default true,
  add column if not exists checkout_transfer_enabled boolean not null default true,
  add column if not exists checkout_cash_enabled boolean not null default true,
  add column if not exists checkout_mp_enabled boolean not null default true,
  add column if not exists checkout_card_enabled boolean not null default true,
  add column if not exists business_hours jsonb not null default '{"mon_fri":[["09:00","13:00"],["16:00","20:00"]],"sat":[["09:00","20:00"]],"sun":[]}'::jsonb;

comment on column public.site_settings.default_stock_control is
'Default for new products only. Existing products keep their own control_stock value.';

comment on column public.site_settings.business_hours is
'Public business schedule used for labels and open/closed status in America/Argentina/Buenos_Aires.';
