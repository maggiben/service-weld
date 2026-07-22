# Especificaciones del Sistema de Gestión de Cilindros y Alquileres

**Versión:** 1.1  
**Público:** dirección, administración, operaciones y facturación (no técnico)  
**Alcance geográfico:** Argentina — territorios Junín, Chacabuco y nodos / subdistribuidores (p. ej. Ceres)  
**Moneda y fechas:** pesos argentinos (ARS); fechas `dd/mm/yyyy`  
**Estado:** alineado a las especificaciones vigentes del producto Weld

---

## 1. La oportunidad: dejar atrás el Excel

Hoy la operación de cilindros vive en **tres libros Excel** con el orden de **~2.140 hojas** y **~180.000 movimientos**. Funciona… hasta que no: doble carga, celdas en ERROR, tubos “perdidos” en la planilla, alquileres que no se cobran y ninguna forma seria de ver el negocio de un vistazo.

**Weld** no es “otra planilla más linda”. Es el **sistema de registro único** pensado para este negocio: industrial y medicinal, alquiler + recarga, proveedores, subdistribuidores y facturación preparada para el contable.

### Qué gana la empresa el día 1

| Hoy (manual)                                                                      | Con Weld                                                                     | Impacto                                                           |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Cada movimiento se escribe **dos veces** (libro del cliente y libro del cilindro) | Se carga **una sola vez** y se ve en ambos lados                             | Menos horas de oficina, cero desfase entre libros                 |
| Cientos de celdas **ERROR** cuando falta la devolución                            | Los días de alquiler se **calculan solos**; un abierto sigue siendo cobrable | Deja de “perderse” alquiler por un error de fórmula               |
| Un tubo puede figurar en dos clientes a la vez                                    | El sistema **bloquea** la doble entrega                                      | Menos reclamos, menos stock fantasma                              |
| “¿Quién tiene qué?” se responde con Ctrl+F y memoria                              | Listados de **flotante**, **antigüedad** y alertas                           | Recuperás cilindros y cobrás lo que está afuera hace meses o años |
| Las tarifas viven en anotaciones sueltas                                          | Tarifas tipificadas + **borrador → aprobar → exportar**                      | Facturación más rápida, auditable y completa                      |
| El oxígeno medicinal se mezcla con el resto                                       | Flujo y liquidación **médica / municipal** aparte                            | Menos riesgo comercial y de cumplimiento                          |
| Sin tablero de gestión                                                            | KPIs de flota, flotante, pérdidas e ingresos                                 | Decisión con datos, no con intuición                              |
| El repartidor anota en papel o espera señal                                       | **App de campo** que trabaja **sin conexión** y sincroniza después           | Menos demora en ruta y menos datos que nunca llegan               |

**En una frase:** Weld convierte el caos de las planillas en **control, cobro completo y visibilidad** — sin cambiar cómo opera el negocio, sino cómo se registra y se mide.

---

## 2. Por qué el manual ya no alcanza (el costo oculto)

El Excel actual no es “barato”: el costo está escondido en el día a día.

1. **Doble trabajo diario** — La misma entrega se anota en la hoja del cliente y en la del cilindro. Si una falla, los dos mundos se contradicen y nadie confía en ninguno.
2. **Alquileres que no se facturan** — Sin fecha de devolución la fórmula tira ERROR; con fechas imposibles o texto en la columna de fecha (nombres de nodo), el día de alquiler se rompe. Eso es plata que no sale en la factura.
3. **Activos que “desaparecen” en el papel** — Pérdidas, cambios y traspasos anotados a mano libre generan stock fantasma y discusiones con clientes y proveedores.
4. **Ceguera de gerencia** — No hay reporte confiable de flotante, antigüedad (>30 / 90 / 180 / 365 días), ingresos por alquiler ni vida de un cilindro. Dirigir es mirar hojas sueltas.
5. **Dependencia de una o dos personas** — Quien “sabe” las planillas se lleva el conocimiento; el resto opera a ciegas.
6. **Riesgo médico** — Ciclos casi diarios de O₂ domiciliario y liquidación municipal no toleran huecos ni confusiones con el circuito industrial.

Weld ataca **cada uno** de estos puntos de frente.

---

## 3. Las mejoras que Weld trae al negocio

### 3.1 Menos carga administrativa, más velocidad

- **Un solo registro** por entrega / devolución / cambio / venta / pérdida.
- Fin de la “sincronización mental” entre dos libros.
- Validaciones al cargar (CUIT, fechas, cilindro ya entregado) → **menos ida y vuelta** para corregir.
- El repartidor carga en ruta; la oficina no reescribe todo de cero.

**Beneficio:** el tiempo de administración se va a **controlar y cobrar**, no a tipear dos veces lo mismo.

### 3.2 Cobro de alquiler completo y sin sorpresas

- Días = **devolución − entrega** (o acumulado hasta hoy si sigue afuera).
- Nadie tipea los días a mano → se acaban los ERROR de fórmula.
- Un alquiler abierto **sigue siendo facturable**; no “se pierde” porque falta una celda.
- Tarifas por cliente / gas / tamaño, con historial: se cobra con la tarifa de la época.
- Accesorios (regulador, adaptador, mochila) en paralelo, con o sin cargo.
- Borradores de facturación listos para **revisar, aprobar y exportar** al sistema contable.

**Beneficio:** recuperás ingresos que hoy se escapan por errores de planilla y por falta de un proceso de facturación claro.

### 3.3 Control real de la flota (“saber dónde está cada tubo”)

- Un cilindro **solo puede estar en un lugar** a la vez.
- Identidad clara: **dueño + número de serie** (el mismo número puede existir en dueños distintos).
- Estados claros: en stock, en cliente, en proveedor, vendido, perdido, roto, retirado.
- Baterías / packs circulan juntas.
- Historial completo de vida del cilindro (quién lo tuvo y cuándo).
- Conciliación: lo que dice el sistema vs. el conteo físico.

**Beneficio:** menos tubos “perdidos en Excel”, menos stock fantasma, mejor recuperación ante el cliente.

### 3.4 Visibilidad que las planillas nunca dieron

Tableros y reportes listos para gerencia y operaciones:

- Flota por estado, gas y dueño.
- **Flotante y antigüedad** (quién tiene tubos hace 30, 90, 180 o más de 365 días).
- Pendientes por cliente y territorio.
- Ingresos por alquiler (días × tarifa).
- Pérdidas y roturas.
- Devoluciones a proveedores vencidas o por vencer.
- Liquidación médica por paciente / período.
- Calidad de datos (lo que hay que revisar, sobre todo tras la migración).

**Beneficio:** por primera vez se puede **dirigir el negocio de cilindros con números**, no con intuición.

### 3.5 Operación de campo a la altura del reparto real

- App móvil para entregas, retiros y cambios.
- **Funciona sin señal** y sincroniza después.
- Si hay conflicto, lo muestra para resolver: **no pierde ni pisa** el trabajo del chofer.
- Instrucciones de entrega y contactos a la vista en la parada.

**Beneficio:** lo que pasa en la puerta del cliente **entra al sistema el mismo día**, no “cuando haya tiempo en la oficina”.

### 3.6 Proveedores, nodos y territorios bajo control

- Ciclo completo del cilindro de proveedor (entrada → cliente → vuelta → devolución).
- Traspasos entre Junín, Chacabuco y agentes (Ceres, etc.) con origen y destino claros.
- Disposición de stock en subdistribuidores (vendido, devuelto, reentregado, retirado).
- Cada usuario ve **su territorio**; no se mezclan rutas.

**Beneficio:** se termina el texto libre en la columna de fecha (que rompía el alquiler) y el “hay que devolver…” que nunca se cierra.

### 3.7 Oxígeno medicinal sin improvisar

- Pacientes / cobertura hospital municipal separados del circuito industrial.
- Ciclos frecuentes (incluso mismo día) soportados.
- Accesorios en préstamo o alquiler ligados al paciente.
- Liquidación municipal preparada para facturación.

**Beneficio:** menos riesgo operativo y comercial en el flujo más sensible del negocio.

### 3.8 Continuidad del histórico (no se tira el pasado)

- Migración de las planillas Excel al sistema.
- Días de alquiler **recalculados desde fechas** (no se confía en la celda vieja).
- Dobles anotaciones fusionadas en un solo movimiento.
- Informe de lo limpio vs. lo a revisar; **nada se pierde en silencio**.

**Beneficio:** se arranca con historia, no desde cero — y se limpia lo que Excel nunca pudo ordenar.

### 3.9 Seguridad y trazabilidad

- Cada cambio queda **atribuido** (quién y cuándo).
- No se borran movimientos a escondidas: se anulan y se registran de nuevo.
- Perfiles por rol (oficina, repartidor, planta, inventario, facturación, gerencia, etc.).
- Datos médicos restringidos.

**Beneficio:** auditoría interna y confianza en los números que se exportan al contable.

---

## 4. Antes y después (mensaje para la organización)

| Pregunta del negocio                         | Respuesta con Excel                      | Respuesta con Weld                             |
| -------------------------------------------- | ---------------------------------------- | ---------------------------------------------- |
| ¿Cuántos tubos hay en la calle hoy?          | A ojo / Ctrl+F                           | Listado de flotante al instante                |
| ¿Cuánto alquiler se puede facturar este mes? | Armar a mano, con ERROR de por medio     | Borrador de facturación por período            |
| ¿Este serial está libre?                     | Revisar varias hojas                     | El sistema ya lo sabe y bloquea si está afuera |
| ¿Qué pasó con el tubo 14 desde 2004?         | Buscar hoja por hoja                     | Historial de vida completo                     |
| ¿El chofer cargó el remito?                  | Cuando vuelva / si no se pierde el papel | App de campo, incluso sin señal                |
| ¿Cuánto perdimos este trimestre?             | No hay reporte                           | Reporte de pérdidas / roturas                  |
| ¿Qué le debemos devolver al proveedor?       | Notas sueltas                            | Ciclo y alertas de vencimiento                 |

---

## 5. ¿Para qué existe Weld? (propósito)

Saber, **en todo momento y con una sola fuente de verdad**:

1. **Qué cilindros** existen y de **quién** son.
2. **Dónde está** cada uno (depósito, cliente, proveedor, nodo).
3. **Cuántos días de alquiler** corresponden y **cuánto facturar**.
4. **Quién** es el cliente, el proveedor o el subdistribuidor involucrado.

Reglas de negocio aplicadas por el sistema (no “acordarse de hacerlo bien”), más los reportes que las planillas nunca pudieron dar.

---

## 6. Qué incluye y qué no

### Incluido (versión 1)

- Altas de **clientes** y de **cilindros** (y baterías / packs).
- **Entregas, devoluciones, recargas, cambios, ventas, pérdidas, roturas y reemplazos**.
- Alquiler de **accesorios** (regulador, adaptador, mochila).
- Ciclo de cilindros de **proveedor**.
- **Traspasos** entre territorios y nodos / subdistribuidores.
- **Conciliación** de stock y cilindros pendientes.
- Cálculo de **días de alquiler** y preparación de datos de **facturación**.
- **Reportes y tableros**.
- **Migración** del histórico Excel.
- **Oficina (web)** + **app de campo** (offline).

### Fuera de alcance por ahora (y por qué no resta valor)

- Facturación electrónica AFIP / contabilidad completa → Weld **prepara y exporta**; el contable sigue emitiendo la factura legal.
- Recertificación hidrostática → fase posterior (seguridad).
- Optimización GPS de rutas → fase posterior.
- Portal del cliente final → fase posterior.

Weld se concentra primero en lo que **más duele hoy**: custodia, alquiler cobrable y visibilidad.

---

## 7. Quién lo usa (y qué gana cada uno)

| Perfil                          | Qué gana con Weld                           |
| ------------------------------- | ------------------------------------------- |
| Administrativo / oficina        | Carga una vez, menos errores, fichas claras |
| Repartidor                      | Carga en ruta sin depender de la señal      |
| Planta / carga                  | Stock vacío/lleno confiable                 |
| Inventario / depósito           | Conciliación y pendientes accionables       |
| Facturación                     | Borradores listos, sin armar Excel a mano   |
| Gerencia / dueño                | Tablero: flotante, pérdidas, ingresos       |
| Subdistribuidor / agente        | Stock del nodo ordenado                     |
| Administrador                   | Usuarios, tarifas y catálogos controlados   |
| Coordinación hospital municipal | Liquidación médica clara                    |
| Cliente (fase 2)                | Consulta de lo que tiene en préstamo        |

Cada uno opera en **su territorio** (Junín, Chacabuco, etc.).

---

## 8. Ideas clave del negocio (reglas que protegen el dinero)

### Propiedad del cilindro

| Tipo                        | Significado               | ¿Genera alquiler?                  |
| --------------------------- | ------------------------- | ---------------------------------- |
| **Nuestra propiedad (N/P)** | Cilindro de la empresa    | Sí                                 |
| **Proveedor**               | Prestado por un proveedor | Sí (mientras circula con nosotros) |
| **Su propiedad (S/P)**      | Cilindro del cliente      | No — solo gas (recarga)            |

### Reglas que el sistema no deja romper (resumen)

- Un cilindro, **un solo lugar** a la vez.
- Días de alquiler **calculados**, nunca tipeados.
- Sin devolución = sigue **afuera** y sigue siendo **cobrable**.
- No se vende un tubo que sigue prestado.
- Recarga solo en S/P; alquiler en N/P o proveedor.
- Ciclo de proveedor solo hacia adelante.
- CUIT válido y único.
- Hospital municipal → liquidación municipal.
- Un hecho físico = **un** registro.

Estas reglas son el “seguro” contra los agujeros del Excel.

---

## 9. Día a día operativo (resumen)

- **Clientes:** alta con CUIT, contactos, territorio e instrucciones (“pasar por balanza”); particular o hospital municipal.
- **Flota:** altas, baterías, historial de vida.
- **Circulación:** despacho, entrega (empieza alquiler), devolución (cierra días), recarga S/P, oxígeno medicinal frecuente.
- **Excepciones:** cambio, venta, pérdida/rotura, reemplazo.
- **Accesorios:** stock, préstamo o alquiler, recuperación.
- **Proveedores y nodos:** ciclo completo y traspasos claros.
- **Control:** pendientes, conciliación física, disposición en agentes.
- **Facturación:** borrador → aprobar → exportar; períodos exportados quedan cerrados.

---

## 10. Cómo se trabaja

### Oficina (web)

Clientes, cilindros, movimientos, facturación, reportes y administración. Español por defecto; fechas y montos locales.

### Campo (móvil)

Entregas y devoluciones **sin señal**; sincronización posterior con resolución de conflictos a la vista.

### Confianza

Cambios atribuibles, historial sin borrados ocultos, perfiles y datos médicos restringidos.

---

## 11. Migración desde Excel: arrancar con ventaja

No se “apaga” el pasado:

- Se importan clientes, cilindros, movimientos, ventas, ciclos de proveedor y accesorios.
- Gases y variantes se unifican.
- Días se **recalculan** desde fechas.
- Dobles libros se **fusionan**.
- Lo sucio va a una cola de excepciones con informe.
- **Ningún movimiento se pierde en silencio.**

Así Weld nace con la historia del negocio **y** con la limpieza que Excel no podía hacer.

---

## 12. Resultados esperados (cómo se mide el éxito)

- Un cilindro se registra, entrega, devuelve, recarga, cambia, vende, declara perdido y reemplaza de punta a punta — en oficina y en campo.
- Al devolver, los días coinciden con las fechas (sin ERROR).
- El reporte de flotante y el borrador de facturación **cuadran**.
- La migración deja excepciones visibles, no agujeros.
- Un repartidor completa una ruta offline y sincroniza sin perder trabajo.
- Gerencia puede responder en minutos: **quién tiene qué, hace cuánto, y cuánto se puede cobrar**.

---

## 13. Glosario breve

| Término                | Significado                                        |
| ---------------------- | -------------------------------------------------- |
| Cilindro / tubo        | Envase de gas rastreable                           |
| Batería                | Pack de varios cilindros que circulan juntos       |
| Entrega                | Sale de stock hacia el cliente                     |
| Devolución             | Vuelve del cliente                                 |
| Alquiler               | Cobro por días con cilindro nuestro o de proveedor |
| Recarga (S/P)          | Llenado del cilindro del cliente; sin alquiler     |
| Remito                 | Comprobante de entrega                             |
| Flotante               | Cilindros aún en poder del cliente                 |
| Cambio                 | Se intercambia un número por otro                  |
| Nodo / subdistribuidor | Punto de stock fuera de la planta principal        |
| Territorio / reparto   | Zona operativa (Junín, Chacabuco, etc.)            |

---

## 14. Resumen ejecutivo (mensaje comercial)

El modelo actual en Excel **ya opera el negocio**, pero al precio de doble carga, alquileres rotos, stock fantasma y cero tablero de gestión.

**Weld** reemplaza ese modelo por un sistema único que:

1. **Recupera tiempo** — una sola carga, app de campo, menos correcciones.
2. **Recupera dinero** — días de alquiler automáticos, abiertos facturables, borradores listos para exportar.
3. **Recupera control** — un tubo, un lugar; flotante y antigüedad a la vista.
4. **Recupera visión** — reportes que las ~2.140 hojas nunca dieron.
5. **Preserva el pasado** — migración con limpieza e informe de excepciones.

No reemplaza al sistema contable ni a AFIP.  
**Sí elimina** la doble carga, los días de alquiler rotos y la ceguera de “quién tiene qué” — el verdadero costo operativo del proceso manual.
