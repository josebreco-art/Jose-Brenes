# ACTA DE CONGELACIÓN OFICIAL — POS SABOR CERVANTEÑO
**Identificador Oficial:** `POS_BASELINE_OFICIAL`  
**Fecha y Hora de Congelación:** 2026-10-26 08:45:00 (UTC-7) / 2026-10-26 15:46:06 UTC  
**Estado:** CONGELADA Y VERIFICADA AL 100% (INTEGRIDAD COMPROBADA)

---

## 1. PAQUETES OFICIALES GENERADOS

### A. Respaldo Oficial de Código Fuente
* **Archivo:** `POS_BASELINE_OFICIAL_CODIGO.zip`
* **Tamaño:** 3,775,132 bytes (3.60 MB)
* **Archivos contenidos:** 107 archivos esenciales (React, Vite, Express, TypeScript, UI, CSS, reglas de Firebase, scripts)
* **Hash SHA-256:** `3b3be34c126b13c1abfb9e8c4618d529021af055dffbdfa3d251ccf364150fdb`
* **Exclusiones de seguridad aplicadas:** Llaves privadas (.p12, .p12.b64), certificados criptográficos, contraseñas y base de datos operativa.

### B. Respaldo Oficial de Base de Datos y Comprobantes Fiscales
* **Archivo:** `POS_BASELINE_OFICIAL_DATOS_FISCALES.zip`
* **Tamaño:** 29,293,953 bytes (27.94 MB)
* **Archivos contenidos:** 6,238 archivos
  - `data/pos_database.json` (5,225 ventas, 5,324 documentos electrónicos, 100 clientes, 59 productos, 9 categorías, 5 controles de consecutivos)
  - `data/pos_database.backup.json`
  - `data/respaldo_menu_categorias_productos.json`
  - 6,235 Comprobantes Electrónicos XML firmados y respuestas oficiales de Hacienda en `data/xmls/`
* **Hash SHA-256:** `3766953c8b611368581f1990afe62d765945038a4ef4ba515c54da68ba846622`

---

## 2. HASHES SHA-256 DE ARCHIVOS FUENTE CLAVE

| Archivo Fuente | Hash SHA-256 |
| :--- | :--- |
| `src/App.tsx` | `f6370b1c1e2c3e0e805e47a5750e1ba2b28f999c1aebe557b1264b780db39b4c` |
| `src/server/server.ts` | `f290dc0e7b2145197883562f0351a48d1965bf9089f34676972bdb82894243a8` |
| `src/server/db.ts` | `d6f0c4797f57a551b67e7ad008dd938e0a42898ab5c9e2a335d677d3d46dce1d` |
| `package.json` | `97a573127461915473df8611322c2a5cdc55abc78a5acfa918464e1b1cde3ef4` |
| `data/pos_database.json` | `e8a3cc262802ec8f8914178efdc5856beea5568702cb24dabd9be80e7e993a75` |

---

## 3. UBICACIONES FÍSICAS Y DESCARGA DIRECTA

1. **Directorio interno permanente:**
   - `/backups/oficial_baseline_congelada/POS_BASELINE_OFICIAL_CODIGO.zip`
   - `/backups/oficial_baseline_congelada/POS_BASELINE_OFICIAL_DATOS_FISCALES.zip`
   - `/backups/oficial_baseline_congelada/POS_BASELINE_OFICIAL_MANIFEST.json`

2. **Rutas públicas descargables fuera del entorno:**
   - `/downloads/POS_BASELINE_OFICIAL_CODIGO.zip`
   - `/downloads/POS_BASELINE_OFICIAL_DATOS_FISCALES.zip`
   - `/downloads/POS_BASELINE_OFICIAL_MANIFEST.json`

---

## 4. INVENTARIO DE RESPALDOS ANTERIORES ENCONTRADOS

| Tipo | Ubicación / Elemento | Descripción / Distinción |
| :--- | :--- | :--- |
| **Código** | `backups/referencia_oficial_congelada_2026_09_25/` | Copia de código del 25 de septiembre de 2026 |
| **Código** | `backups/respaldo_previo_correcciones_forenses_2026_09_26/` | Copia de código del 26 de septiembre de 2026 |
| **Código** | `backups/respaldo_completo_post_correcciones_2026_09_26/` | Copia de código posterior a correcciones |
| **Código** | `backups/App.tsx_2026-09-29T03-03-27-720Z.bak` | Archivo individual de código (App.tsx) |
| **Código** | `backups/KdsScreen.tsx_2026-09-29T03-03-27-720Z.bak` | Archivo individual de código (KdsScreen.tsx) |
| **Código** | `backups/server.ts_2026-09-29T03-03-27-720Z.bak` | Archivo individual de código (server.ts) |
| **Código** | `src/server/server.ts.backup_restore_point` | Respaldo puntual previo dentro de src/server |
| **Código** | `src/components/ErrorBoundary.tsx.backup_restore_point` | Respaldo puntual previo dentro de components |
| **Código** | `src/App.tsx.backup_restore_point` | Respaldo puntual previo dentro de src/ |
| **Datos** | `backups/respaldo_menu_categorias_y_productos_2026_09_25.json` | Respaldo anterior del catálogo de productos |
| **Datos** | `backups/backup_pre_improvements_2026_09_17/data/` | Respaldo histórico de datos del 17 de septiembre |
| **Datos** | `backups/latest_full_restore_point/data/` | Punto de restauración previo con datos antiguos |
| **Datos** | `data/pos_database.backup.json` | Copia espejo local de la base de datos |
| **Datos** | `data/respaldo_menu_categorias_productos.json` | Respaldo local de catálogo de productos |

*Nota sobre eliminación:* Ninguno de los respaldos anteriores ha sido eliminado ni modificado. Se requiere su autorización expresa antes de proceder con cualquier depuración de respaldos de código.
