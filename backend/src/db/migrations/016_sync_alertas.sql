-- Incidencias abiertas de frescura de la replica.
--
-- Para que Altas avise por correo cuando un dataset lleva horas sin recibir
-- nada. Es la otra punta del aviso: el agente avisa de sus fallos, pero un
-- agente muerto no puede avisar de que esta muerto -- si se apaga 10.0.0.85, si
-- se llena su disco o si systemd deja de disparar el timer, de alli no sale
-- ningun correo. El unico que puede notarlo es el destino, viendo que su dato
-- envejece. Por eso la comprobacion NO pregunta nada al agente: mira solo esta
-- base de datos. Si preguntase y no hubiese respuesta, no sabria distinguir un
-- agente caido de un problema de red.
--
-- Va FUERA del esquema `erp`, que lo sobrescribe el agente y donde la app no
-- escribe (CLAUDE.md, regla 1 del receptor). Anotar el estado del aviso en
-- `erp.datasets` seria escribir en su terreno, y ademas se perderia: esa tabla
-- la reescribe cada cierre.
--
-- Una fila = una incidencia ABIERTA. Al recuperarse el dataset, la fila se
-- borra. Que exista o no la fila es lo que evita mandar un correo en cada
-- comprobacion: se avisa al abrir y al cerrar, no cada hora.
--
-- Idempotente porque migrate.js reejecuta todos los ficheros en cada despliegue.

CREATE TABLE IF NOT EXISTS sync_alertas (
  -- El nombre del dataset tal y como esta en config/datasets.js. Sin clave
  -- foranea contra erp.datasets a proposito: la incidencia mas importante es
  -- justo la del dataset que NO tiene fila alli porque nunca ha llegado nada.
  dataset          TEXT PRIMARY KEY,

  -- Cuando se detecto que el dato estaba viejo, y cuantas horas llevaba.
  detectado_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  horas_al_abrir   NUMERIC(10,1),

  -- Cuando se mando el ultimo correo por esta incidencia. Sirve para el
  -- recordatorio: si la incidencia sigue abierta al dia siguiente se vuelve a
  -- avisar, porque un unico correo perdido deja el fallo en silencio otra vez.
  -- No es un aviso por comprobacion: es uno al dia como maximo.
  avisado_at       TIMESTAMPTZ,
  avisos           INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS ix_sync_alertas_avisado ON sync_alertas (avisado_at);
