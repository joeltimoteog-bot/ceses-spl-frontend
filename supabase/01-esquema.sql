-- ======================================================================
--  TALVENIQ · Ceses/SPL — Base de consulta rápida en SUPABASE (plan gratuito)  v1.0
--  Fuente de verdad: Google Sheets (Excel Lite → Sheets). Esta base es una RÉPLICA de solo lectura
--  para la web. Apps Script la alimenta (solo filas nuevas/modificadas) con la clave secreta.
--  La web NO lee las tablas: solo llama a las funciones api_* con el token que firma Apps Script.
--
--  Cómo usar: Supabase → SQL Editor → New query → pegar TODO este archivo → Run.
--  Se puede volver a ejecutar sin perder datos (todo es "if not exists" / "create or replace").
-- ======================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm  with schema extensions;

-- ---------- tablas (todo texto salvo el id: igual a como llega desde Sheets) ----------
create table if not exists public.trabajadores (
  dni text primary key,
  empresa text, codigo text, ap_paterno text, ap_materno text, nombres text, nombre_completo text,
  fecha_inicio_periodo text, fecha_inicio_contrato text, fecha_termino_contrato text,
  centro_costo text, cargo text, provincia text, direccion text, regimen text, sexo text, afp text,
  asig_familiar text, fecha_nacimiento text, sincronizado_en text,
  busqueda text,                 -- NOMBRE SIN TILDES + DNI + CÓDIGO + CENTRO DE COSTO (lo arma Apps Script)
  hash text not null, actualizado_en text not null
);
create index if not exists ix_trab_busq on public.trabajadores using gin (busqueda extensions.gin_trgm_ops);
create index if not exists ix_trab_codigo on public.trabajadores (codigo);

create table if not exists public.programacion (
  id bigint primary key,         -- mismo id que la hoja `programacion`
  dni text, nombres text, empresa text, f_inicio text, f_renovacion text, f_termino text, fundo text, cargo text, direccion text,
  anios text, meses text, dias text, estado text, ruta text, codigo text, fundo_zona text, estatus text, semana_mes text,
  fecha_firma text, mes text, anio text, fecha_doc text, fecha_inicio_sl text, fecha_fin_sl text, fecha_retorno text, cant_dias text,
  observacion text, estado_retorno text, fecha_pago text, status02 text, responsable_sector text, apoyos text, horario_firma text,
  origen text, creado_en text,
  codigo_norm text,              -- código del carro normalizado ('120.0' → '120')
  retorno_calc text,             -- fecha_retorno o, si falta, fin SL + 1 (yyyy-mm-dd)
  texto_norm text,               -- nombres+dni+fundo+ruta+código+observación sin tildes: filtro de texto
  hash text not null, actualizado_en text not null
);
create index if not exists ix_prog_dni      on public.programacion (dni);
create index if not exists ix_prog_fecha    on public.programacion (fecha_doc);
create index if not exists ix_prog_retorno  on public.programacion (retorno_calc);
create index if not exists ix_prog_ruta     on public.programacion (upper(btrim(ruta)), codigo_norm);
create index if not exists ix_prog_texto    on public.programacion using gin (texto_norm extensions.gin_trgm_ops);

create table if not exists public.sync_estado (
  tabla text primary key, ultimo text, filas integer, insertadas integer, actualizadas integer, eliminadas integer, detalle text
);

-- Nadie entra a las tablas por la API pública: solo Apps Script (clave secreta) y las funciones api_*
alter table public.trabajadores enable row level security;
alter table public.programacion enable row level security;
alter table public.sync_estado  enable row level security;
revoke all on table public.trabajadores, public.programacion, public.sync_estado from anon, authenticated;

-- ---------- esquema privado: clave del token (NO expuesto por la API) ----------
create schema if not exists privado;
revoke all on schema privado from public;
create table if not exists privado.ajustes (clave text primary key, valor text not null);
revoke all on table privado.ajustes from public;

-- Verifica el token HMAC-SHA256 que emite Apps Script al iniciar sesión (payload_base64url.firma_base64url)
create or replace function privado.verificar(p_token text, p_perm text)
returns jsonb language plpgsql stable security definer
set search_path = privado, public, extensions as $$
declare
  partes text[]; pay text; firma text; esperado text; sec text; b64 text; u jsonb;
begin
  if p_token is null or position('.' in p_token) = 0 then raise exception 'No autenticado' using errcode = '28000'; end if;
  partes := string_to_array(p_token, '.'); pay := partes[1]; firma := partes[2];
  select valor into sec from privado.ajustes where clave = 'token_secret';
  if sec is null then raise exception 'Base de consulta sin configurar (token_secret)' using errcode = '28000'; end if;
  esperado := rtrim(translate(encode(extensions.hmac(pay, sec, 'sha256'), 'base64'), '+/', '-_'), '=');
  if firma is null or esperado <> firma then raise exception 'Token inválido' using errcode = '28000'; end if;
  b64 := translate(pay, '-_', '+/'); b64 := b64 || repeat('=', (4 - length(b64) % 4) % 4);
  u := convert_from(decode(b64, 'base64'), 'UTF8')::jsonb;
  if coalesce((u->>'exp')::bigint, 0) < (extract(epoch from clock_timestamp()) * 1000)::bigint then
    raise exception 'Sesión vencida' using errcode = '28000';
  end if;
  if p_perm is not null and coalesce(u->>'r', '') <> 'admin' and not coalesce((u->'p') ? p_perm, false) then
    raise exception 'Acceso denegado. No cuenta con autorización para realizar esta acción.' using errcode = '42501';
  end if;
  return u;
end $$;

-- Código de carro normalizado: igual que codigoTxt_ de Apps Script
create or replace function privado.cod_norm(v text) returns text language sql immutable as $$
  select case when v is null or btrim(v) = '' then ''
              when btrim(v) ~ '^\d+(\.0+)?$' then ((btrim(v))::numeric)::bigint::text
              else upper(btrim(v)) end
$$;
create or replace function privado.sin_tildes(v text) returns text language sql immutable as $$
  select translate(upper(coalesce(v, '')), 'ÁÉÍÓÚÜÀÈÌÒÙ', 'AEIOUUAEIOU')
$$;
create or replace function privado.hoy() returns text language sql stable as $$
  select (now() at time zone 'America/Lima')::date::text
$$;
-- Fila de programación como JSON, sin columnas internas
create or replace function privado.prog_json(r public.programacion) returns jsonb language sql immutable as $$
  select to_jsonb(r) - 'hash' - 'actualizado_en' - 'texto_norm' - 'codigo_norm' - 'retorno_calc'
$$;
revoke all on all functions in schema privado from public;

-- ======================================================================
--  API para la web (POST /rest/v1/rpc/<función>)
-- ======================================================================

-- Buscar trabajador por nombre / apellidos / DNI / código / fundo
create or replace function public.api_buscar(p_token text, p_q text, p_limite int default 30)
returns jsonb language plpgsql stable security definer
set search_path = public, privado, extensions as $$
declare toks text[]; lim int; filas jsonb; n int;
begin
  perform privado.verificar(p_token, 'buscar_trabajador.ver');
  toks := array(select t from unnest(regexp_split_to_array(privado.sin_tildes(regexp_replace(coalesce(p_q, ''), '[%_\\]', '', 'g')), '\s+')) t where length(t) >= 2);
  if coalesce(cardinality(toks), 0) = 0 then return jsonb_build_object('q', p_q, 'total', 0, 'mas', false, 'filas', '[]'::jsonb); end if;
  lim := least(greatest(coalesce(p_limite, 30), 5), 100);
  select coalesce(jsonb_agg(jsonb_build_object('dni', c.dni, 'nombre_completo', c.nombre_completo, 'empresa', c.empresa, 'centro_costo', c.centro_costo, 'cargo', c.cargo, 'codigo', c.codigo) order by c.ord, c.nombre_completo), '[]'::jsonb), count(*)
    into filas, n
  from (select t.*, case when t.dni = toks[1] or t.codigo = toks[1] then 0 when t.busqueda like toks[1] || '%' then 1 else 2 end as ord
        from public.trabajadores t
        where not exists (select 1 from unnest(toks) k where t.busqueda not like '%' || k || '%')
        order by ord, t.nombre_completo limit lim + 1) c;
  if n > lim then filas := filas - lim; end if;   -- quita el elemento extra (índice lim)
  return jsonb_build_object('q', p_q, 'total', least(n, lim + 1), 'mas', n > lim, 'filas', filas);
end $$;

-- Ficha: datos base + historial completo (los cálculos de antigüedad los hace la web)
create or replace function public.api_trabajador(p_token text, p_dni text)
returns jsonb language plpgsql stable security definer
set search_path = public, privado, extensions as $$
declare t jsonb; h jsonb;
begin
  perform privado.verificar(p_token, 'buscar_trabajador.ver');
  select to_jsonb(x) - 'hash' - 'actualizado_en' - 'busqueda' into t from public.trabajadores x where x.dni = btrim(p_dni);
  select coalesce(jsonb_agg(privado.prog_json(p) order by coalesce(p.fecha_doc, p.fecha_firma) desc nulls last, p.id desc), '[]'::jsonb)
    into h from public.programacion p where p.dni = btrim(p_dni);
  return jsonb_build_object('t', t, 'historial', h);
end $$;

-- Consultar registros: filtros + paginación + totales (sobre el total filtrado)
create or replace function public.api_listado(p_token text, p jsonb)
returns jsonb language plpgsql stable security definer
set search_path = public, privado, extensions as $$
declare
  toks text[]; v_dni text; v_emp text; v_est text; v_fundo text; v_ruta text; v_rutac text; v_estado text; v_ret text;
  v_desde text; v_hasta text; v_rd text; v_rh text; v_por int; v_pag int; v_total int; v_fin int; v_sus int; v_se int; v_filas jsonb;
begin
  perform privado.verificar(p_token, 'programaciones.ver');
  toks := array(select t from unnest(regexp_split_to_array(privado.sin_tildes(regexp_replace(coalesce(p->>'q', ''), '[%_\\]', '', 'g')), '\s+')) t where t <> '');
  v_dni := nullif(btrim(p->>'dni'), ''); v_emp := nullif(upper(btrim(p->>'empresa')), '');
  v_est := nullif(privado.sin_tildes(btrim(p->>'estatus')), ''); v_fundo := nullif(upper(btrim(p->>'fundo')), '');
  v_ruta := nullif(upper(btrim(p->>'ruta')), ''); v_rutac := privado.cod_norm(v_ruta);
  v_estado := nullif(upper(btrim(p->>'estado')), ''); v_ret := nullif(upper(btrim(p->>'estado_retorno')), '');
  v_desde := nullif(p->>'desde', ''); v_hasta := nullif(p->>'hasta', ''); v_rd := nullif(p->>'retorno_desde', ''); v_rh := nullif(p->>'retorno_hasta', '');
  if coalesce(cardinality(toks), 0) = 0 and v_dni is null and v_emp is null and v_est is null and v_fundo is null and v_ruta is null
     and v_estado is null and v_ret is null and v_desde is null and v_hasta is null and v_rd is null and v_rh is null then
    v_desde := ((now() at time zone 'America/Lima')::date - 90)::text;   -- sin filtros: últimos 90 días
  end if;
  v_por := case when (p->>'por') in ('25', '50', '100') then (p->>'por')::int else 50 end;
  v_pag := greatest(1, coalesce(nullif(p->>'pagina', '')::int, 1));

  with f as materialized (
    select x.id, x.fecha_doc, x.fundo_zona, x.ruta, x.nombres, x.estatus from public.programacion x
    where (v_desde is null or x.fecha_doc >= v_desde) and (v_hasta is null or x.fecha_doc <= v_hasta)
      and (v_dni is null or btrim(x.dni) = v_dni) and (v_emp is null or upper(btrim(x.empresa)) = v_emp)
      and (v_est is null or privado.sin_tildes(btrim(x.estatus)) = v_est)
      and (v_fundo is null or upper(btrim(x.fundo_zona)) = v_fundo)
      and (v_ruta is null or upper(btrim(x.ruta)) = v_ruta or x.codigo_norm = v_rutac)
      and (v_estado is null or upper(x.estado) like '%' || v_estado || '%')
      and (v_ret is null or upper(btrim(x.estado_retorno)) = v_ret)
      and (v_rd is null or x.fecha_retorno >= v_rd) and (v_rh is null or x.fecha_retorno <= v_rh)
      and not exists (select 1 from unnest(toks) k where coalesce(x.texto_norm, '') not like '%' || k || '%')
  ), t as (
    select count(*)::int n,
           (count(*) filter (where privado.sin_tildes(estatus) = 'FINIQUITO'))::int fin,
           (count(*) filter (where privado.sin_tildes(estatus) like 'SUSPENSI%'))::int sus,
           (count(*) filter (where privado.sin_tildes(estatus) = 'SIN EFECTO'))::int se
    from f
  ), pg as (
    select least(v_pag, greatest(1, ceil(n::numeric / v_por)::int)) pag from t
  )
  select t.n, t.fin, t.sus, t.se, pg.pag,
         coalesce((select jsonb_agg(privado.prog_json(z) order by z.fecha_doc desc nulls last, z.fundo_zona, z.ruta, z.nombres, z.id)
                   from (select f2.id from f f2 order by f2.fecha_doc desc nulls last, f2.fundo_zona, f2.ruta, f2.nombres, f2.id
                         limit v_por offset (pg.pag - 1) * v_por) w join public.programacion z on z.id = w.id), '[]'::jsonb)
    into v_total, v_fin, v_sus, v_se, v_pag, v_filas
  from t, pg;

  return jsonb_build_object('total', v_total, 'pagina', v_pag, 'por', v_por, 'paginas', greatest(1, ceil(v_total::numeric / v_por)::int),
    'filas', v_filas, 'totales', jsonb_build_object('finiquitos', v_fin, 'suspensiones', v_sus, 'sin_efecto', v_se), 'fuente', 'supabase');
end $$;

-- Suspendidos de una ruta (con código exacto = un carro) para "Modificar ruta"
create or replace function public.api_suspendidos(p_token text, p jsonb)
returns jsonb language plpgsql stable security definer
set search_path = public, privado, extensions as $$
declare q text; v_cod text; tiene_cod boolean; v_fundo text; v_fret text; todas boolean; n int; filas jsonb;
begin
  perform privado.verificar(p_token, 'programaciones.ver');
  q := upper(btrim(coalesce(p->>'ruta', ''))); if q = '' then raise exception 'Indica la ruta o el código'; end if;
  tiene_cod := p ? 'codigo' and jsonb_typeof(p->'codigo') <> 'null'; v_cod := privado.cod_norm(p->>'codigo');
  v_fundo := nullif(upper(btrim(p->>'fundo')), ''); v_fret := nullif(p->>'fecha_retorno', '');
  todas := coalesce(p->>'vigentes', '') = 'false';
  select count(*), coalesce(jsonb_agg(privado.prog_json(p2) order by w.rn) filter (where w.rn <= 500), '[]'::jsonb) into n, filas
  from (select x.id, row_number() over (order by x.retorno_calc, x.nombres, x.id) rn from public.programacion x
        where privado.sin_tildes(x.estatus) like 'SUSPENSI%'
          and (case when tiene_cod then upper(btrim(x.ruta)) = q and x.codigo_norm = v_cod
                    else upper(btrim(x.ruta)) = q or x.codigo_norm = privado.cod_norm(q) end)
          and (v_fundo is null or upper(btrim(coalesce(nullif(x.fundo_zona, ''), x.fundo))) = v_fundo)
          and (case when v_fret is not null then x.retorno_calc = v_fret
                    when todas then true else x.retorno_calc >= privado.hoy() end)) w
  join public.programacion p2 on p2.id = w.id;
  return jsonb_build_object('ruta', q, 'codigo', case when tiene_cod then v_cod end, 'total', n, 'filas', filas, 'recortado', n > 500, 'fuente', 'supabase');
end $$;

-- Retornos: suspendidos cuyo retorno cae en el rango (la web agrupa por fecha / fundo / ruta + código)
create or replace function public.api_retornos(p_token text, p_desde text, p_hasta text)
returns jsonb language plpgsql stable security definer
set search_path = public, privado, extensions as $$
declare u jsonb; nominal boolean;
begin
  u := privado.verificar(p_token, 'programaciones.ver');
  nominal := coalesce(u->>'r', '') = 'admin' or coalesce((u->'p') ? 'buscar_trabajador.ver', false);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'dni', case when nominal then x.dni end, 'nombres', case when nominal then x.nombres end,
      'empresa', x.empresa, 'fundo', x.fundo, 'fundo_zona', x.fundo_zona, 'ruta', x.ruta, 'codigo', x.codigo_norm,
      'fecha_inicio_sl', x.fecha_inicio_sl, 'fecha_fin_sl', x.fecha_fin_sl, 'retorno', x.retorno_calc,
      'cant_dias', x.cant_dias, 'estado_retorno', x.estado_retorno))
    from public.programacion x
    where privado.sin_tildes(x.estatus) like 'SUSPENSI%' and x.retorno_calc between p_desde and p_hasta), '[]'::jsonb);
end $$;

-- Catálogos para los filtros (últimos 18 meses)
create or replace function public.api_catalogos(p_token text)
returns jsonb language plpgsql stable security definer
set search_path = public, privado, extensions as $$
declare d text := ((now() at time zone 'America/Lima')::date - 548)::text;
begin
  perform privado.verificar(p_token, null);
  return jsonb_build_object(
    'fundos', coalesce((select jsonb_agg(v order by v) from (select distinct fundo_zona v from public.programacion where fecha_doc >= d and coalesce(fundo_zona, '') <> '') a), '[]'::jsonb),
    'rutas', coalesce((select jsonb_agg(v order by v) from (select distinct ruta v from public.programacion where fecha_doc >= d and coalesce(ruta, '') <> '') a), '[]'::jsonb),
    'estados_retorno', coalesce((select jsonb_agg(v order by v) from (select distinct estado_retorno v from public.programacion where fecha_doc >= d and coalesce(estado_retorno, '') <> '') a), '[]'::jsonb),
    'estatus', '["FINIQUITO","SUSPENSIÓN","SIN EFECTO"]'::jsonb);
end $$;

-- Estado del servicio (sin datos personales). También mantiene "despierto" el proyecto gratuito.
create or replace function public.api_salud()
returns jsonb language sql stable security definer
set search_path = public, privado, extensions as $$
  select jsonb_build_object('ok', true, 'version', 'supa-1.0', 'hora', (now() at time zone 'America/Lima')::text,
    'trabajadores', (select count(*) from public.trabajadores), 'programacion', (select count(*) from public.programacion),
    'sync', coalesce((select jsonb_agg(to_jsonb(s)) from public.sync_estado s), '[]'::jsonb))
$$;

revoke all on function public.api_buscar(text, text, int), public.api_trabajador(text, text), public.api_listado(text, jsonb),
  public.api_suspendidos(text, jsonb), public.api_retornos(text, text, text), public.api_catalogos(text), public.api_salud() from public;
grant execute on function public.api_buscar(text, text, int), public.api_trabajador(text, text), public.api_listado(text, jsonb),
  public.api_suspendidos(text, jsonb), public.api_retornos(text, text, text), public.api_catalogos(text), public.api_salud() to anon, authenticated;

-- Listo. Siguiente paso: ejecutar 02-clave.sql (con TU clave) para activar el token.
