-- ======================================================================
--  TALVENIQ · Ceses/SPL — Módulo HISTÓRICO (indicadores por año, exportación total y cambios)  v1.0
--  Ejecutar UNA vez en Supabase → SQL Editor → New query → pegar TODO → Run (se puede repetir sin perder datos).
--  Requiere haber ejecutado antes 01-esquema.sql.
-- ======================================================================

-- ---------- copia de la hoja `modificaciones` (retornos anticipados, cambios de medida, ajustes de fechas) ----------
create table if not exists public.modificaciones (
  id_mod text primary key,
  fecha_hora text, usuario text, id_registro bigint, dni text, nombres text, tipo text,
  antes text, despues text, motivo text, clave_original text, lote_mod text,
  hash text not null, actualizado_en text not null
);
create index if not exists ix_mod_registro on public.modificaciones (id_registro);
create index if not exists ix_mod_dni      on public.modificaciones (dni);
create index if not exists ix_mod_fecha    on public.modificaciones (fecha_hora);
alter table public.modificaciones enable row level security;
revoke all on table public.modificaciones from anon, authenticated;

-- JSON seguro (la hoja recorta 'antes'/'despues' a 2000 caracteres: si quedó incompleto, devuelve vacío)
create or replace function privado.json_seguro(t text) returns jsonb language plpgsql immutable as $$
begin
  if t is null or btrim(t) = '' then return '{}'::jsonb; end if;
  return t::jsonb;
exception when others then return '{}'::jsonb;
end $$;
-- Año de un registro: Fecha Doc.; si falta, la columna AÑO
create or replace function privado.anio_reg(fecha_doc text, anio text) returns text language sql immutable as $$
  select case when fecha_doc ~ '^\d{4}-' then left(fecha_doc, 4) when anio ~ '^\d{4}' then left(anio, 4) else 'S/F' end
$$;
create or replace function privado.num(t text) returns numeric language sql immutable as $$
  select case when btrim(coalesce(t, '')) ~ '^-?\d+(\.\d+)?$' then btrim(t)::numeric end
$$;
revoke all on all functions in schema privado from public;
create index if not exists ix_prog_anio on public.programacion (privado.anio_reg(fecha_doc, anio));

-- ======================================================================
--  Indicadores: por año (todos), y del año elegido: por mes, organización y fundo
-- ======================================================================
create or replace function public.api_historico(p_token text, p jsonb)
returns jsonb language plpgsql stable security definer
set search_path = public, privado, extensions as $$
declare v_emp text; r jsonb;
begin
  perform privado.verificar(p_token, 'programaciones.ver');
  v_emp := nullif(upper(btrim(p->>'empresa')), '');
  with b as (
    select privado.anio_reg(x.fecha_doc, x.anio) a, substr(x.fecha_doc, 6, 2) m, privado.sin_tildes(x.estatus) e, btrim(x.dni) dni,
           privado.num(x.cant_dias) dias, upper(btrim(coalesce(x.empresa, ''))) emp, coalesce(nullif(btrim(x.fundo_zona), ''), nullif(btrim(x.fundo), ''), '(SIN FUNDO)') fz
    from public.programacion x
    where v_emp is null or upper(btrim(x.empresa)) = v_emp
  ), mods as (
    select left(m.fecha_hora, 4) a, m.tipo
    from public.modificaciones m left join public.programacion x on x.id = m.id_registro
    where v_emp is null or upper(btrim(x.empresa)) = v_emp
  ), anios as (
    select a, count(*)::int registros,
           count(*) filter (where e = 'FINIQUITO')::int finiquitos,
           count(*) filter (where e like 'SUSPENSI%')::int suspensiones,
           count(*) filter (where e = 'SIN EFECTO')::int sin_efecto,
           coalesce(sum(dias) filter (where e like 'SUSPENSI%'), 0) dias_spl,
           count(distinct dni)::int personas
    from b group by a
  ), manio as (
    select a, count(*)::int modificaciones,
           count(*) filter (where tipo = 'RETORNO_ANTICIPADO')::int retornos_anticipados,
           count(*) filter (where tipo = 'CAMBIO_MEDIDA')::int cambios_medida,
           count(*) filter (where tipo = 'AJUSTE_FECHAS')::int ajustes_fechas
    from mods group by a
  ), sel as (
    select coalesce(nullif(p->>'anio', ''), (select max(a) from anios where a <> 'S/F'), to_char(now(), 'YYYY')) a
  )
  select jsonb_build_object(
    'anio', (select a from sel),
    'anios', coalesce((select jsonb_agg(to_jsonb(an) || jsonb_build_object(
                'modificaciones', coalesce(ma.modificaciones, 0), 'retornos_anticipados', coalesce(ma.retornos_anticipados, 0),
                'cambios_medida', coalesce(ma.cambios_medida, 0), 'ajustes_fechas', coalesce(ma.ajustes_fechas, 0)) order by an.a desc)
              from anios an left join manio ma on ma.a = an.a), '[]'::jsonb),
    'meses', coalesce((select jsonb_agg(jsonb_build_object('mes', mm.m, 'finiquitos', mm.f, 'suspensiones', mm.s, 'sin_efecto', mm.se, 'dias_spl', mm.d) order by mm.m)
              from (select m, count(*) filter (where e = 'FINIQUITO')::int f, count(*) filter (where e like 'SUSPENSI%')::int s,
                           count(*) filter (where e = 'SIN EFECTO')::int se, coalesce(sum(dias) filter (where e like 'SUSPENSI%'), 0) d
                    from b where a = (select a from sel) and m ~ '^\d{2}$' group by m) mm), '[]'::jsonb),
    'por_empresa', coalesce((select jsonb_agg(jsonb_build_object('empresa', q.emp, 'finiquitos', q.f, 'suspensiones', q.s, 'sin_efecto', q.se, 'personas', q.pe) order by q.emp)
              from (select emp, count(*) filter (where e = 'FINIQUITO')::int f, count(*) filter (where e like 'SUSPENSI%')::int s,
                           count(*) filter (where e = 'SIN EFECTO')::int se, count(distinct dni)::int pe
                    from b where a = (select a from sel) group by emp) q), '[]'::jsonb),
    'por_fundo', coalesce((select jsonb_agg(jsonb_build_object('fundo', q.fz, 'finiquitos', q.f, 'suspensiones', q.s, 'sin_efecto', q.se, 'total', q.t) order by q.t desc)
              from (select fz, count(*) filter (where e = 'FINIQUITO')::int f, count(*) filter (where e like 'SUSPENSI%')::int s,
                           count(*) filter (where e = 'SIN EFECTO')::int se, count(*)::int t
                    from b where a = (select a from sel) group by fz order by count(*) desc limit 20) q), '[]'::jsonb),
    'total', jsonb_build_object('registros', (select count(*) from b), 'personas', (select count(distinct dni) from b), 'modificaciones', (select count(*) from mods))
  ) into r;
  return r;
end $$;

-- ======================================================================
--  Exportación TOTAL por bloques (la web arma el Excel): filtros año / organización / medida
-- ======================================================================
create or replace function public.api_exportar(p_token text, p jsonb, p_desde_id bigint default 0, p_limite int default 5000)
returns jsonb language plpgsql stable security definer
set search_path = public, privado, extensions as $$
declare v_emp text; v_anio text; v_est text; lim int; filas jsonb; ult bigint; n int;
begin
  perform privado.verificar(p_token, 'reportes.exportar');
  v_emp := nullif(upper(btrim(p->>'empresa')), ''); v_anio := nullif(p->>'anio', ''); v_est := nullif(privado.sin_tildes(btrim(p->>'estatus')), '');
  lim := least(greatest(coalesce(p_limite, 5000), 100), 5000);
  select coalesce(jsonb_agg(privado.prog_json(z) order by z.id), '[]'::jsonb), max(z.id), count(*) into filas, ult, n
  from (select x.* from public.programacion x
        where x.id > coalesce(p_desde_id, 0)
          and (v_emp is null or upper(btrim(x.empresa)) = v_emp)
          and (v_anio is null or privado.anio_reg(x.fecha_doc, x.anio) = v_anio)
          and (v_est is null or privado.sin_tildes(btrim(x.estatus)) = v_est)
        order by x.id limit lim) z;
  return jsonb_build_object('filas', filas, 'ultimo_id', coalesce(ult, p_desde_id), 'mas', n = lim);
end $$;

-- ======================================================================
--  Cambios registrados (retorno anticipado, cambio de medida, ajuste de fechas) con antes / después
-- ======================================================================
create or replace function public.api_modificaciones(p_token text, p jsonb)
returns jsonb language plpgsql stable security definer
set search_path = public, privado, extensions as $$
declare u jsonb; v_anio text; v_tipo text; v_dni text; v_emp text; toks text[]; v_por int; v_pag int; exportar boolean; r jsonb;
begin
  u := privado.verificar(p_token, 'programaciones.ver');
  exportar := coalesce(p->>'exportar', '') = '1';
  if exportar then perform privado.verificar(p_token, 'reportes.exportar'); end if;
  v_anio := nullif(p->>'anio', ''); v_tipo := nullif(upper(btrim(p->>'tipo')), ''); v_dni := nullif(btrim(p->>'dni'), '');
  v_emp := nullif(upper(btrim(p->>'empresa')), '');
  toks := array(select t from unnest(regexp_split_to_array(privado.sin_tildes(regexp_replace(coalesce(p->>'q', ''), '[%_\\]', '', 'g')), '\s+')) t where t <> '');
  v_por := case when exportar then 20000 when (p->>'por') in ('25', '50', '100') then (p->>'por')::int else 50 end;
  v_pag := greatest(1, coalesce(nullif(p->>'pagina', '')::int, 1));
  with f as materialized (
    select m.*, x.empresa, coalesce(nullif(x.fundo_zona, ''), x.fundo) fundo_zona, x.ruta, x.codigo_norm codigo, x.fecha_doc,
           privado.json_seguro(m.antes) ja, privado.json_seguro(m.despues) jd
    from public.modificaciones m left join public.programacion x on x.id = m.id_registro
    where (v_anio is null or left(m.fecha_hora, 4) = v_anio)
      and (v_tipo is null or m.tipo = v_tipo)
      and (v_dni is null or btrim(m.dni) = v_dni)
      and (v_emp is null or upper(btrim(x.empresa)) = v_emp)
      and not exists (select 1 from unnest(toks) k where privado.sin_tildes(concat_ws(' ', m.nombres, m.dni, m.usuario, m.motivo, x.fundo_zona, x.ruta, x.codigo)) not like '%' || k || '%')
  ), t as (
    select count(*)::int n,
           count(*) filter (where tipo = 'RETORNO_ANTICIPADO')::int ra,
           count(*) filter (where tipo = 'CAMBIO_MEDIDA')::int cm,
           count(*) filter (where tipo = 'AJUSTE_FECHAS')::int af
    from f
  ), pg as (select least(v_pag, greatest(1, ceil(n::numeric / v_por)::int)) pag from t)
  select jsonb_build_object(
    'total', t.n, 'pagina', pg.pag, 'por', v_por, 'paginas', greatest(1, ceil(t.n::numeric / v_por)::int),
    'totales', jsonb_build_object('retornos_anticipados', t.ra, 'cambios_medida', t.cm, 'ajustes_fechas', t.af),
    'filas', coalesce((select jsonb_agg(jsonb_build_object(
        'id_mod', w.id_mod, 'fecha_hora', w.fecha_hora, 'usuario', w.usuario, 'tipo', w.tipo, 'id_registro', w.id_registro,
        'dni', w.dni, 'nombres', w.nombres, 'empresa', w.empresa, 'fundo_zona', w.fundo_zona, 'ruta', w.ruta, 'codigo', w.codigo, 'fecha_doc', w.fecha_doc,
        'motivo', w.motivo,
        'estatus_antes', w.ja->>'estatus', 'estatus_despues', w.jd->>'estatus',
        'inicio_sl_antes', w.ja->>'fecha_inicio_sl', 'inicio_sl_despues', w.jd->>'fecha_inicio_sl',
        'fin_sl_antes', w.ja->>'fecha_fin_sl', 'fin_sl_despues', w.jd->>'fecha_fin_sl',
        'retorno_antes', w.ja->>'fecha_retorno', 'retorno_despues', w.jd->>'fecha_retorno',
        'dias_antes', w.ja->>'cant_dias', 'dias_despues', w.jd->>'cant_dias') order by w.fecha_hora desc, w.id_mod)
      from (select * from f order by fecha_hora desc, id_mod limit v_por offset (pg.pag - 1) * v_por) w), '[]'::jsonb)
  ) into r
  from t, pg;
  return r;
end $$;

revoke all on function public.api_historico(text, jsonb), public.api_exportar(text, jsonb, bigint, int), public.api_modificaciones(text, jsonb) from public;
grant execute on function public.api_historico(text, jsonb), public.api_exportar(text, jsonb, bigint, int), public.api_modificaciones(text, jsonb) to anon, authenticated;

-- Listo. Apps Script (v4.4) copiará la hoja `modificaciones` en la próxima sincronización.
