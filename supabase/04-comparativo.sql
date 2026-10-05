-- ======================================================================
--  TALVENIQ · Ceses/SPL — v4.5: comparativo año contra año en el Histórico
--  Ejecutar en Supabase → SQL Editor → New query → pegar TODO → Run. Requiere 03-historico.sql.
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
    'anio_prev', case when (select a from sel) ~ '^\d{4}$' then ((select a from sel)::int - 1)::text end,
    'meses_prev', coalesce((select jsonb_agg(jsonb_build_object('mes', mm.m, 'finiquitos', mm.f, 'suspensiones', mm.s, 'sin_efecto', mm.se, 'dias_spl', mm.d) order by mm.m)
              from (select m, count(*) filter (where e = 'FINIQUITO')::int f, count(*) filter (where e like 'SUSPENSI%')::int s,
                           count(*) filter (where e = 'SIN EFECTO')::int se, coalesce(sum(dias) filter (where e like 'SUSPENSI%'), 0) d
                    from b where (select a from sel) ~ '^\d{4}$' and a = ((select a from sel)::int - 1)::text and m ~ '^\d{2}$' group by m) mm), '[]'::jsonb),
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

-- v4.5: 'Retorno desde / hasta' de Consultar registros usa el retorno calculado (igual que Retornos y el calendario)
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
      and (v_rd is null or x.retorno_calc >= v_rd) and (v_rh is null or x.retorno_calc <= v_rh)   -- v4.5: retorno real (o fin SL + 1)
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

grant execute on function public.api_historico(text, jsonb), public.api_listado(text, jsonb) to anon, authenticated;
notify pgrst, 'reload schema';
