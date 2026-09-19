# TALVENIQ · Ceses/SPL — API de consulta (Cloudflare Worker + D1) · Fase 2

```
Excel Lite ─(macro)─▶ Google Sheets ─(Apps Script: d1Sincronizar cada 10 min + al grabar/eliminar)─▶ D1
Navegador ─(login/permisos/grabar/correos)─▶ Apps Script
          ─(buscar, ficha, Consultar registros)─▶ este Worker (~100–300 ms) ─▶ D1   · si falla → Apps Script
```

## Despliegue (una sola vez, desde PowerShell en la carpeta `api`)

```powershell
cd "D:\SISTEMA RELACIONES LABORALES\ceses-spl-frontend\api"
npm install
npx wrangler login                      # abre el navegador: autorizar con la cuenta de Cloudflare
npx wrangler d1 create ceses-spl        # copiar el database_id que devuelve
```
Pegar el `database_id` en `wrangler.toml` (línea `database_id = "..."`). Luego:
```powershell
npx wrangler d1 execute ceses-spl --remote --file=./schema.sql
npx wrangler secret put D1_API_KEY        # escribir una clave larga (la misma va en config → D1_API_KEY)
npx wrangler secret put D1_TOKEN_SECRET   # escribir otra clave larga (la misma va en config → D1_TOKEN_SECRET)
npx wrangler deploy                       # devuelve la URL: https://ceses-spl-api.<cuenta>.workers.dev
```
Generar claves largas en PowerShell: `-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 48 | % {[char]$_})`

## Configuración en Google Sheets (pestaña `config`)
| clave | valor |
|---|---|
| D1_URL | https://ceses-spl-api.<cuenta>.workers.dev |
| D1_API_KEY | (la misma del secret) |
| D1_TOKEN_SECRET | (la misma del secret) |

En Apps Script: pegar `codigo-v4.0.gs` → Nueva versión → ejecutar `invalidarConfig`, `probarD1` (debe mostrar `ok:true`),
`d1Sincronizar` (primera carga: 1–3 min) e `instalarActivadorD1`.

## Verificación
- `https://ceses-spl-api.<cuenta>.workers.dev/salud` → `{"ok":true,...,"trabajadores":N,"programacion":M}`
- En la web: Buscar trabajador muestra ⚡ en el historial; menú **Consultar registros**; Estado del sistema → bloque "Base de consulta rápida (D1)".

## Límites del plan gratuito (Cloudflare aplica desde 2026-09-01)
5 GB · 5 M filas leídas/día · 100 k filas escritas/día · 100 k peticiones/día. La sincronización es incremental (solo filas nuevas/modificadas), así que el consumo diario típico es de cientos de escrituras.

## Pruebas locales
```powershell
npx wrangler d1 execute ceses-spl --local --file=./schema.sql
npx wrangler dev            # http://localhost:8787 (usa .dev.vars con claves locales)
node test/api-test.js       # 24 pruebas (sync, token, búsqueda, ficha, listado, permisos)
```
