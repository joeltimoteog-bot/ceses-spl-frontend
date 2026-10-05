# Ceses/SPL v4.3 — Paso a producción con Supabase (plan gratuito)

```
Excel Lite ─▶ Google Sheets (base principal) ─▶ Apps Script ─(solo cambios, cada 30 min y al grabar)─▶ Supabase
Navegador ─(login, grabar, correos)─▶ Apps Script
          ─(buscar, ficha, Consultar registros, Retornos, Modificar ruta)─▶ Supabase (0.1–0.3 s) · si falla → Apps Script
```

Costo: **S/ 0**. Plan Free de Supabase: 500 MB de base (usaremos ~30–50 MB), 5 GB de descarga al mes, consultas ilimitadas. No pide tarjeta.

---

## Paso 1 — Crear el proyecto en Supabase (5 min)
1. Entra a https://supabase.com → **Start your project** → inicia sesión con GitHub o correo.
2. **New project**: nombre `ceses-spl`, contraseña de base de datos (guárdala), región **South America (São Paulo)**, plan **Free** → *Create*.
3. Espera 1–2 min a que termine de crearse.

## Paso 2 — Crear las tablas y funciones
1. Menú izquierdo **SQL Editor** → **New query**.
2. Abre `supabase/01-esquema.sql`, copia **todo**, pégalo y presiona **Run**. Debe decir *Success. No rows returned*.

## Paso 3 — Crear la clave del token
1. Genera una clave larga en PowerShell:
   ```powershell
   -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 48 | % {[char]$_})
   ```
2. En **SQL Editor → New query**, pega el contenido de `supabase/02-clave.sql`, cambia `PEGA_AQUI_TU_CLAVE` por esa clave y **Run**. Debe responder *Clave guardada: 48 caracteres*.
   ⚠ No guardes el archivo con la clave real (el repositorio es público).

## Paso 4 — Copiar las claves del proyecto
En Supabase: **Project Settings → API Keys** (o *Data API*):
- **Project URL** → `https://xxxx.supabase.co`
- **Publishable key** (`sb_publishable_…`) o, si solo ves las antiguas, la **anon public**
- **Secret key** (`sb_secret_…`) o la antigua **service_role** → ⚠ es secreta, solo va en la hoja

## Paso 5 — Pegar las claves en la hoja `config` (Google Sheets)
Agrega 4 filas (columna A = clave, columna B = valor):

| clave | valor |
|---|---|
| SUPA_URL | https://xxxx.supabase.co |
| SUPA_ANON_KEY | sb_publishable_… (o anon) |
| SUPA_SECRET_KEY | sb_secret_… (o service_role) |
| SUPA_TOKEN_SECRET | la misma clave del paso 3 |

## Paso 6 — Apps Script
1. En la hoja: *Extensiones → Apps Script*. Reemplaza todo el código por `Claude outputs/codigo-v4.3.gs` → Guardar.
2. **Implementar → Administrar implementaciones → ✏️ → Versión: Nueva versión → Implementar** (la URL /exec no cambia).
3. Selector de funciones → **configurarV42** → Ejecutar (apaga Cloudflare y deja el precalentado cada 30 min).
4. Selector → **configurarSupabase** → Ejecutar. Hace la primera carga (1–4 min) e instala la sincronización cada 30 min.
   En *Registro de ejecución* debe salir `Conexión OK` y `Listo · {"trabajadores":…,"programacion":…,"completo":true}`.
   Si sale `completo:false`, no pasa nada: la carga continúa sola en ~1 minuto.

## Paso 7 — Publicar la web (GitHub Pages)
```powershell
cd "D:\SISTEMA RELACIONES LABORALES\ceses-spl-frontend"
git add app.js app.html supabase/01-esquema.sql supabase/GUIA_PRODUCCION_SUPABASE.md
git commit -m "v4.3: consultas rapidas en Supabase (gratis), retornos por ruta + codigo, sin Cloudflare"
git push
```
En 1–2 min la web queda actualizada. Pide a los usuarios **cerrar sesión y volver a entrar** (para recibir el token nuevo).

## Paso 8 — Verificar
- **Estado del sistema** debe mostrar el bloque *Base de consulta rápida (Supabase)* con los conteos.
- **Buscar trabajador**: la ficha muestra ⚡ (respondió Supabase).
- **Retornos**: una fila por ruta + código; el botón *Ruta* abre solo a la gente de ese carro.

## Paso 9 — Apagar Cloudflare (opcional)
Ya no se usa. Puedes dejarlo o borrar el Worker `ceses-spl-api` y la base D1 `ceses-spl` desde el panel de Cloudflare.

---

### Para tener en cuenta
- **Pausa por inactividad**: Supabase Free pausa el proyecto si pasa 7 días sin uso. La sincronización cada 30 min lo mantiene activo. Si alguna vez se pausa: Supabase → *Restore project*; mientras tanto la web sigue funcionando con Apps Script (más lenta).
- **Datos**: Supabase es una copia de consulta. Lo oficial sigue en Google Sheets. Si algún día hay que recargar todo: ejecutar `supaRecargarTodo`.
- **Actualizaciones masivas** (macro / Subir Excel): se envían a Supabase ~1 minuto después, solas.
- **Seguridad**: la web nunca lee las tablas directamente; solo llama a funciones que verifican el token del usuario y sus permisos (los mismos de la web). La clave secreta solo existe en la hoja `config`.
