-- TALVENIQ · Ceses/SPL — base intermedia (Cloudflare D1 / SQLite)
-- Fuente de verdad: Google Sheets (alimentada por el Excel Lite). Esta base es una réplica de consulta.
CREATE TABLE IF NOT EXISTS trabajadores (
  dni TEXT PRIMARY KEY,
  empresa TEXT, codigo TEXT, ap_paterno TEXT, ap_materno TEXT, nombres TEXT, nombre_completo TEXT,
  nombre_norm TEXT,                      -- sin tildes, mayúsculas: para búsqueda
  fecha_inicio_periodo TEXT, fecha_inicio_contrato TEXT, fecha_termino_contrato TEXT,
  centro_costo TEXT, cargo TEXT, provincia TEXT, direccion TEXT, regimen TEXT, sexo TEXT, afp TEXT,
  asig_familiar TEXT, fecha_nacimiento TEXT, sincronizado_en TEXT,
  hash TEXT NOT NULL, actualizado_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_trab_empresa ON trabajadores(empresa);
CREATE INDEX IF NOT EXISTS ix_trab_cc ON trabajadores(centro_costo);
CREATE INDEX IF NOT EXISTS ix_trab_codigo ON trabajadores(codigo);

-- Búsqueda por nombre/apellidos/código/fundo (FTS5 con prefijos: pocas filas leídas por consulta)
CREATE VIRTUAL TABLE IF NOT EXISTS trab_fts USING fts5(dni, nombre_norm, codigo, centro_costo, content='trabajadores', content_rowid='rowid', tokenize='unicode61');
CREATE TRIGGER IF NOT EXISTS trab_ai AFTER INSERT ON trabajadores BEGIN INSERT INTO trab_fts(rowid, dni, nombre_norm, codigo, centro_costo) VALUES (new.rowid, new.dni, new.nombre_norm, new.codigo, new.centro_costo); END;
CREATE TRIGGER IF NOT EXISTS trab_ad AFTER DELETE ON trabajadores BEGIN INSERT INTO trab_fts(trab_fts, rowid, dni, nombre_norm, codigo, centro_costo) VALUES ('delete', old.rowid, old.dni, old.nombre_norm, old.codigo, old.centro_costo); END;
CREATE TRIGGER IF NOT EXISTS trab_au AFTER UPDATE ON trabajadores BEGIN
  INSERT INTO trab_fts(trab_fts, rowid, dni, nombre_norm, codigo, centro_costo) VALUES ('delete', old.rowid, old.dni, old.nombre_norm, old.codigo, old.centro_costo);
  INSERT INTO trab_fts(rowid, dni, nombre_norm, codigo, centro_costo) VALUES (new.rowid, new.dni, new.nombre_norm, new.codigo, new.centro_costo);
END;

CREATE TABLE IF NOT EXISTS programacion (
  id INTEGER PRIMARY KEY,                -- mismo id que la hoja `programacion`
  dni TEXT, nombres TEXT, empresa TEXT, f_inicio TEXT, f_renovacion TEXT, f_termino TEXT, fundo TEXT, cargo TEXT, direccion TEXT,
  anios INTEGER, meses INTEGER, dias INTEGER, estado TEXT, ruta TEXT, codigo TEXT, fundo_zona TEXT, estatus TEXT, semana_mes TEXT,
  fecha_firma TEXT, mes TEXT, anio INTEGER, fecha_doc TEXT, fecha_inicio_sl TEXT, fecha_fin_sl TEXT, fecha_retorno TEXT, cant_dias INTEGER,
  observacion TEXT, estado_retorno TEXT, fecha_pago TEXT, status02 TEXT, responsable_sector TEXT, apoyos TEXT, horario_firma TEXT, origen TEXT, creado_en TEXT,
  texto_norm TEXT,                       -- nombres+dni+fundo+ruta+observación normalizados: filtro de texto del listado
  hash TEXT NOT NULL, actualizado_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_prog_dni ON programacion(dni);
CREATE INDEX IF NOT EXISTS ix_prog_fecha ON programacion(fecha_doc);
CREATE INDEX IF NOT EXISTS ix_prog_fecha_fundo ON programacion(fecha_doc, fundo_zona);
CREATE INDEX IF NOT EXISTS ix_prog_estatus ON programacion(estatus, fecha_doc);
CREATE INDEX IF NOT EXISTS ix_prog_retorno ON programacion(fecha_retorno);
CREATE INDEX IF NOT EXISTS ix_prog_empresa ON programacion(empresa, fecha_doc);

CREATE TABLE IF NOT EXISTS sync_estado (
  tabla TEXT PRIMARY KEY, ultimo TEXT, filas INTEGER, insertadas INTEGER, actualizadas INTEGER, eliminadas INTEGER, detalle TEXT
);
CREATE TABLE IF NOT EXISTS log_api (
  id INTEGER PRIMARY KEY AUTOINCREMENT, fecha_hora TEXT, usuario TEXT, ruta TEXT, ms INTEGER, resultado TEXT, error TEXT
);
