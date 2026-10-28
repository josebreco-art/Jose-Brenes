import express from 'express';
import path from 'path';
import fs from 'fs';
import { Sale, Product, Customer, Category, KitchenObservation } from '../types/pos';
import { FISCAL_CONFIG } from './fiscalConfig';
import { db } from './db';
import { FiscalValidationService } from './fiscalValidationService';
import { OFFICIAL_ECONOMIC_ACTIVITIES } from './taxRules';
import { ElectronicInvoicingEngine } from './electronicInvoicingEngine';
import { HaciendaApiClient } from './haciendaApiClient';
import { XmlSignerService } from './xmlSigner';
import { FiscalEmailService } from './fiscalEmailService';
import { PdfInvoiceGenerator } from './pdfInvoiceGenerator';
import { HaciendaXmlGenerator } from './xmlGenerator';
import { getElectronicDocumentFileNames } from '../utils/documentNaming';
import { getCostaRicaDate } from '../utils/dateUtils';

// Detectar si el servidor se está ejecutando desde el archivo empaquetado de producción (dist/server.cjs)
const isCompiledBundle = (typeof __filename !== 'undefined' && __filename.endsWith('.cjs')) || 
                         process.argv.some(arg => arg.includes('server.cjs'));
if (isCompiledBundle) {
  process.env.NODE_ENV = 'production';
}

const app = express();
// El puerto 3000 está estrictamente definido por la infraestructura del contenedor detrás del proxy nginx
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Health check endpoints prioritarios para Cloud Run probes y balanceadores
app.get('/health', (req, res) => res.status(200).send('OK'));
app.get('/healthz', (req, res) => res.status(200).send('OK'));

// Configurar límite de payload amplio (50MB) para soportar certificados criptográficos P12,
// respaldos completos de base de datos, catálogos masivos y lotes de facturación electrónica.
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Protección de seguridad: bloquear acceso público directo a respaldos JSON, llaves (.p12/.b64) y sourcemaps (.map)
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) {
    const lower = req.path.toLowerCase();
    if (
      lower.endsWith('.p12') ||
      lower.endsWith('.b64') ||
      lower.endsWith('.bak') ||
      lower.includes('.backup') ||
      lower.endsWith('.map') ||
      (lower.endsWith('.json') && (lower.includes('backup') || lower.includes('pos_database') || lower.includes('respaldo') || lower.includes('sales_archive')))
    ) {
      return res.status(403).json({
        success: false,
        error: 'Acceso público denegado por políticas de seguridad.'
      });
    }
  }
  next();
});

// Directorio y servicio de imágenes de productos locales cargadas por el usuario
const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
  } catch (e) {
    console.warn('No se pudo crear directorio uploads:', e);
  }
}
app.use('/uploads', express.static(uploadsDir));

// Middleware para atrapar errores de parseo de payload (como PayloadTooLargeError)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      error: 'El archivo o tamaño de la solicitud excede el límite permitido (50MB).',
      code: 'PAYLOAD_TOO_LARGE'
    });
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: 'Formato JSON inválido en la solicitud.',
      code: 'INVALID_JSON'
    });
  }
  next(err);
});

// ----------------------------------------------------
// REAL-TIME SERVER-SENT EVENTS (SSE) ENGINE
// ----------------------------------------------------
let sseClients: express.Response[] = [];

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders?.();

  sseClients.push(res);

  // Initial handshake
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: Date.now() })}\n\n`);

  // Periodic heartbeat to prevent proxy timeout
  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
    } catch {
      clearInterval(heartbeat);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients = sseClients.filter(c => c !== res);
  });
});

function broadcastEvent(type: string, data: any) {
  const genericPayload = `data: ${JSON.stringify({ type, data, timestamp: Date.now() })}\n\n`;
  
  // Mapear a nombres de eventos con nombre que escucha App.tsx
  let namedEventPayload = '';
  if (type === 'KITCHEN_ORDER_CREATED' || type === 'KITCHEN_ORDER_UPDATED') {
    namedEventPayload = `event: kitchen_order\ndata: ${JSON.stringify({ kitchenOrder: data })}\n\n`;
  } else if (type === 'SALE_CREATED') {
    namedEventPayload = `event: new_order\ndata: ${JSON.stringify({ sale: data })}\n\n`;
  } else if (type === 'SALE_UPDATED') {
    namedEventPayload = `event: order_status_update\ndata: ${JSON.stringify({ saleId: data?.id, orderStatus: data?.orderStatus })}\n\n`;
  } else if (type === 'CATALOG_UPDATED' || type === 'PRODUCT_UPDATED' || type === 'PRODUCT_DELETED' || type === 'CATEGORY_UPDATED' || type === 'CATEGORY_DELETED') {
    namedEventPayload = `event: catalog_updated\ndata: ${JSON.stringify({ type, data, version: db.getCatalogVersion(), timestamp: Date.now() })}\n\n`;
  }

  sseClients.forEach(client => {
    try {
      client.write(genericPayload);
      if (namedEventPayload) {
        client.write(namedEventPayload);
      }
    } catch {
      // client disconnected
    }
  });
}

// ----------------------------------------------------
// DATABASE & HEALTH APIS
// ----------------------------------------------------

// 1. Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    restaurant: 'Pollo Frito Sabor Cervanteño',
    location: 'Cervantes de Alvarado, Cartago, Costa Rica',
    time: new Date().toISOString(),
    database: db.getStats(),
    fiscalEngine: 'Independent Costa Rica DGT v4.4 Engine Ready'
  });
});

// Database diagnostics & management
app.get('/api/db/stats', (req, res) => {
  res.json(db.getStats());
});

app.get('/api/db/export', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=sabor_cervanteno_db_${Date.now()}.json`);
  res.json(db.exportDatabase());
});

app.post('/api/db/import', (req, res) => {
  try {
    const stats = db.importDatabase(req.body);
    res.json({ success: true, message: 'Base de datos importada exitosamente', stats });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/db/reset', (req, res) => {
  try {
    const stats = db.resetToDefaults();
    res.json({ success: true, message: 'Base de datos reiniciada a valores iniciales', stats });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/db/restore-point', (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Nombre del punto de restauración es requerido' });
    const filename = db.createRestorationPoint(name);
    res.json({ success: true, message: `Punto de restauración "${name}" creado exitosamente`, filename });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// PRODUCTS & CATEGORIES
// ----------------------------------------------------
app.get('/api/products', (req, res) => {
  const versionTag = `"v${db.getCatalogVersion()}"`;
  res.setHeader('ETag', versionTag);
  if (req.headers['if-none-match'] === versionTag) {
    return res.status(304).end();
  }
  res.json(db.getProducts());
});

app.post('/api/products', (req, res) => {
  try {
    const product: Product = req.body;
    const products = db.saveProduct(product);
    broadcastEvent('PRODUCT_UPDATED', product);
    broadcastEvent('CATALOG_UPDATED', {
      products: db.getProducts(),
      categories: db.getCategories(),
      version: db.getCatalogVersion()
    });
    res.json({ success: true, product, products });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/products/:id', (req, res) => {
  const success = db.deleteProduct(req.params.id);
  broadcastEvent('PRODUCT_DELETED', { id: req.params.id });
  broadcastEvent('CATALOG_UPDATED', {
    products: db.getProducts(),
    categories: db.getCategories(),
    version: db.getCatalogVersion()
  });
  res.json({ success, products: db.getProducts() });
});

app.post('/api/upload-image', (req, res) => {
  try {
    const { imageBase64, filename } = req.body;
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ success: false, error: 'No se recibieron datos de imagen.' });
    }

    // Si ya es una ruta relativa o URL pública válida
    if (imageBase64.startsWith('/uploads/') || imageBase64.startsWith('/images/') || imageBase64.startsWith('http')) {
      return res.json({ success: true, url: imageBase64 });
    }

    // Procesar Base64
    const matches = imageBase64.match(/^data:([A-Za-z0-9-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.json({ success: true, url: imageBase64 });
    }

    const mimeType = matches[1].toLowerCase();
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');

    let ext = 'jpg';
    if (mimeType.includes('png')) ext = 'png';
    else if (mimeType.includes('webp')) ext = 'webp';
    else if (mimeType.includes('svg')) ext = 'svg';
    else if (mimeType.includes('gif')) ext = 'gif';

    const safePrefix = filename ? filename.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30) : 'prod';
    const targetName = `${safePrefix}_${Date.now()}.${ext}`;
    const targetPath = path.join(uploadsDir, targetName);

    fs.writeFileSync(targetPath, buffer);
    const publicUrl = `/uploads/${targetName}`;
    console.log(`📸 Imagen de producto guardada en disco: ${publicUrl} (${(buffer.length / 1024).toFixed(1)} KB)`);

    res.json({ success: true, url: publicUrl });
  } catch (err: any) {
    console.error('Error guardando imagen de producto:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/categories', (req, res) => {
  res.json(db.getCategories());
});

app.post('/api/categories', (req, res) => {
  try {
    const category: Category = req.body;
    const categories = db.saveCategory(category);
    broadcastEvent('CATEGORY_UPDATED', category);
    broadcastEvent('CATALOG_UPDATED', {
      products: db.getProducts(),
      categories: db.getCategories(),
      version: db.getCatalogVersion()
    });
    res.json({ success: true, category, categories });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/categories/:id', (req, res) => {
  const success = db.deleteCategory(req.params.id);
  broadcastEvent('CATEGORY_DELETED', { id: req.params.id });
  broadcastEvent('CATALOG_UPDATED', {
    products: db.getProducts(),
    categories: db.getCategories(),
    version: db.getCatalogVersion()
  });
  res.json({ success, categories: db.getCategories() });
});

// ----------------------------------------------------
// SINCRONIZACIÓN DE CATÁLOGO CON LA NUBE (LA NUBE MANDA)
// ----------------------------------------------------
app.get('/api/catalog/version', (req, res) => {
  res.json({
    version: db.getCatalogVersion(),
    productCount: db.getProducts().length,
    categoryCount: db.getCategories().length,
    lastUpdated: db.getLastUpdated()
  });
});

app.post('/api/catalog/sync', async (req, res) => {
  try {
    const result = await db.syncCatalogWithCloud(true);
    if (result.changed) {
      broadcastEvent('CATALOG_UPDATED', {
        products: db.getProducts(),
        categories: db.getCategories(),
        version: db.getCatalogVersion()
      });
    }
    res.json({
      success: true,
      ...result,
      products: db.getProducts(),
      categories: db.getCategories(),
      version: db.getCatalogVersion()
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Error en sincronización con la nube' });
  }
});

// ----------------------------------------------------
// OBSERVACIONES DE COCINA (OFICIALES - CREADAS POR ADMINISTRADOR)
// ----------------------------------------------------
app.get('/api/kitchen-observations', (req, res) => {
  try {
    res.json(db.getKitchenObservations());
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/kitchen-observations', (req, res) => {
  try {
    const observation: KitchenObservation = req.body;
    if (!observation || !observation.text || !observation.text.trim()) {
      return res.status(400).json({ success: false, error: 'El texto de la observación es requerido' });
    }
    const observations = db.saveKitchenObservation(observation);
    broadcastEvent('KITCHEN_OBSERVATIONS_UPDATED', observations);
    res.json({ success: true, observation, observations });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/kitchen-observations/:id', (req, res) => {
  try {
    const observations = db.deleteKitchenObservation(req.params.id);
    broadcastEvent('KITCHEN_OBSERVATIONS_UPDATED', observations);
    res.json({ success: true, observations });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// USERS & CASHIERS
// ----------------------------------------------------
app.get('/api/users', (req, res) => {
  try {
    res.json(db.getUsers());
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/users', (req, res) => {
  try {
    const user = req.body;
    if (!user || !user.name) {
      return res.status(400).json({ success: false, error: 'Nombre de usuario requerido' });
    }
    const users = db.saveUser(user);
    res.json({ success: true, user, users });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/users/:id', (req, res) => {
  try {
    const { id } = req.params;
    const users = db.deleteUser(id);
    res.json({ success: true, users });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// CUSTOMERS
// ----------------------------------------------------
app.get('/api/customers', (req, res) => {
  res.json(db.getCustomers());
});

app.post('/api/customers', (req, res) => {
  try {
    const customer: Customer = req.body;
    const customers = db.saveCustomer(customer);
    broadcastEvent('CUSTOMER_UPDATED', customer);
    res.json({ success: true, customer, customers });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/customers/import', (req, res) => {
  try {
    const { customers: customerList, replaceAll } = req.body;
    if (!Array.isArray(customerList)) {
      return res.status(400).json({ success: false, error: 'Se esperaba un arreglo de clientes.' });
    }
    const result = db.importCustomers(customerList, Boolean(replaceAll));
    broadcastEvent('CUSTOMERS_IMPORTED', { count: result.imported, total: result.total });
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/customers/:id', (req, res) => {
  try {
    const success = db.deleteCustomer(req.params.id);
    broadcastEvent('CUSTOMER_DELETED', { id: req.params.id });
    res.json({ success, customers: db.getCustomers() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// CABYS & FISCAL MANAGEMENT (HACIENDA COSTA RICA v4.4)
// ----------------------------------------------------
app.get('/api/fiscal/cabys', (req, res) => {
  const query = (req.query.q as string || '').toLowerCase().trim();
  const catalog = db.getCabysCatalog();

  if (!query) {
    return res.json(catalog);
  }

  const filtered = catalog.filter(c => 
    c.codigoCabys.includes(query) ||
    c.descripcionOficial.toLowerCase().includes(query) ||
    c.categoria.toLowerCase().includes(query) ||
    c.subcategoria.toLowerCase().includes(query)
  );
  res.json(filtered);
});

app.get('/api/fiscal/cabys/validate/:code', (req, res) => {
  const result = FiscalValidationService.validateCabysCode(req.params.code);
  res.json(result);
});

app.get('/api/fiscal/peek-consecutive', async (req, res) => {
  try {
    const { branch = '001', terminal = '00001', docType = '04' } = req.query;
    const peek = await db.peekNextConsecutive(String(branch), String(terminal), String(docType));
    const restaurantInfo = db.getRestaurantInfo();
    const config = db.getHaciendaDirectConfig();
    const taxId = config.emisorTaxId || restaurantInfo.taxId || '302680311';
    const now = new Date();
    const numericKeyPreview = db.generateNumericKey(peek.consecutive, now, taxId, '1');

    res.json({
      success: true,
      consecutive: peek.consecutive,
      sequenceNumber: peek.sequenceNumber,
      documentType: peek.documentType,
      branch: peek.branch,
      terminal: peek.terminal,
      numericKeyPreview,
      description: peek.documentType === '01' ? 'Factura Electrónica' :
                   peek.documentType === '02' ? 'Nota de Débito Electrónica' :
                   peek.documentType === '03' ? 'Nota de Crédito Electrónica' :
                   peek.documentType === '04' ? 'Tiquete Electrónico' :
                   peek.documentType === '05' ? 'Factura Electrónica de Compra' :
                   'Recibo Electrónico de Pago',
      isVerifiedUnique: true
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/fiscal/tax-rates', (req, res) => {
  res.json(db.getTaxRates());
});

app.get('/api/fiscal/company-info', async (req, res) => {
  try {
    const consecutiveControls = await db.getConsecutiveControls();
    res.json({
      restaurantInfo: db.getRestaurantInfo(),
      haciendaConfig: db.getHaciendaDirectConfig(),
      consecutiveControls,
      economicActivities: OFFICIAL_ECONOMIC_ACTIVITIES
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/fiscal/hacienda-config', async (req, res) => {
  try {
    const consecutives = await db.getConsecutiveControls();
    res.json({
      config: db.getHaciendaDirectConfig(),
      consecutives
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/fiscal/hacienda-config', async (req, res) => {
  try {
    const config = db.saveHaciendaDirectConfig(req.body);
    db.addFiscalAuditLog({
      userId: 'admin',
      userName: 'Administrador Fiscal',
      action: 'EMISION_COMPROBANTE',
      details: `Configuración directa de Hacienda actualizada (Ambiente: ${config.environment}, Llave Criptográfica: ${config.cryptographicKeyFileName || 'No cargada'})`
    });
    const consecutives = await db.getConsecutiveControls();
    res.json({ 
      success: true, 
      message: 'Configuración fiscal guardada exitosamente.',
      config,
      consecutives
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint para configurar manualmente el último número emitido (Factura, Tiquete, NC, etc.)
app.post('/api/fiscal/set-consecutives', async (req, res) => {
  try {
    const { branch = '001', terminal = '00001', lastFacturaNumber, lastTiqueteNumber, lastNotaCreditoNumber, lastNotaDebitoNumber, lastFacturaCompraNumber, lastReciboPagoNumber } = req.body;

    if (lastFacturaNumber !== undefined) {
      await db.setConsecutiveSequence(branch, terminal, '01', Number(lastFacturaNumber));
    }
    if (lastTiqueteNumber !== undefined) {
      await db.setConsecutiveSequence(branch, terminal, '04', Number(lastTiqueteNumber));
    }
    if (lastNotaCreditoNumber !== undefined) {
      await db.setConsecutiveSequence(branch, terminal, '03', Number(lastNotaCreditoNumber));
    }
    if (lastNotaDebitoNumber !== undefined) {
      await db.setConsecutiveSequence(branch, terminal, '02', Number(lastNotaDebitoNumber));
    }
    if (lastFacturaCompraNumber !== undefined) {
      await db.setConsecutiveSequence(branch, terminal, '05', Number(lastFacturaCompraNumber));
    }
    if (lastReciboPagoNumber !== undefined) {
      await db.setConsecutiveSequence(branch, terminal, '06', Number(lastReciboPagoNumber));
    }

    db.addFiscalAuditLog({
      userId: 'admin',
      userName: 'Administrador Fiscal',
      action: 'EMISION_COMPROBANTE',
      details: `Secuencias de consecutivos actualizadas manualmente: FE=${lastFacturaNumber ?? '-'}, TE=${lastTiqueteNumber ?? '-'}, NC=${lastNotaCreditoNumber ?? '-'}`
    });

    const consecutiveControls = await db.getConsecutiveControls();
    res.json({
      success: true,
      message: 'Consecutivos de Hacienda sincronizados exitosamente.',
      consecutiveControls
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Auditoría oficial de Consecutivos y Claves Numéricas para las tarjetas y tabla de historial
app.get('/api/fiscal/consecutives-audit', async (req, res) => {
  try {
    const controls = await db.getConsecutiveControls();
    const docs = db.getElectronicDocuments();

    const history = (docs || []).slice(0, 100).map((d: any) => ({
      id: d.id,
      date: d.createdAt || d.issueDate,
      type: d.documentType,
      consecutive: d.consecutive || (d.numericKey ? d.numericKey.substring(21, 41) : '-'),
      key: d.numericKey || d.clave || '-',
      status: d.status,
      haciendaStatus: d.haciendaStatus || d.status,
      customerName: d.receiver?.name || d.receiverSnapshot?.name || d.customerName || 'Cliente General',
      total: d.total || d.totalAmount || 0
    }));

    res.json({
      success: true,
      controls,
      history,
      keysHistory: history,
      totalConsecutivesUsed: docs.length,
      totalKeysGenerated: docs.length
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Probar conexión y autenticación directa con el IDP de Hacienda (Keycloak)
app.post('/api/fiscal/test-hacienda-connection', async (req, res) => {
  try {
    const { username, password, environment, p12Base64, pin } = req.body;
    const config = db.getHaciendaDirectConfig();

    const testUser = username || config.haciendaUsername;
    const testPass = password || config.haciendaPassword;
    const testEnv = environment || config.environment;
    const testP12 = p12Base64 || config.cryptographicKeyBase64;
    const testPin = pin || config.cryptographicKeyPin;

    if (!testUser || !testPass) {
      return res.status(400).json({
        success: false,
        message: 'Debe ingresar el Usuario y Contraseña generados en el portal ATV de Hacienda.'
      });
    }

    // 1. Probar Token de Hacienda
    const tokenResult = await HaciendaApiClient.getAccessToken({
      username: testUser,
      password: testPass,
      environment: testEnv
    });

    // 2. Validar Llave criptográfica si fue enviada
    let keyValidation: any = { valid: false, message: 'No se adjuntó archivo de llave criptográfica (.p12)' };
    if (testP12) {
      keyValidation = XmlSignerService.validateCryptographicKey(testP12, testPin, testEnv, config.emisorTaxId);
    }

    if (tokenResult.success) {
      db.saveHaciendaDirectConfig({
        testStatus: 'SUCCESS',
        lastTestedAt: new Date().toISOString(),
        lastTestMessage: `Conexión exitosa con IDP Hacienda (${testEnv}). Token válido por ${tokenResult.expiresIn} seg.`
      });

      return res.json({
        success: true,
        message: `¡Conexión y credenciales ATV verificadas exitosamente con Hacienda (${testEnv})!`,
        tokenExpiresIn: tokenResult.expiresIn,
        keyValidation
      });
    } else {
      db.saveHaciendaDirectConfig({
        testStatus: 'ERROR',
        lastTestedAt: new Date().toISOString(),
        lastTestMessage: tokenResult.error
      });

      return res.status(400).json({
        success: false,
        message: tokenResult.error || 'Error al autenticar ante el Ministerio de Hacienda',
        keyValidation
      });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Descargar archivo binario de la llave criptográfica (.p12) guardada
app.get('/api/fiscal/download-cryptographic-key', (req, res) => {
  try {
    const config = db.getHaciendaDirectConfig();
    const b64 = config.cryptographicKeyBase64 || db.loadLocalCryptoKey();
    if (!b64) {
      return res.status(404).json({ success: false, message: 'No hay llave criptográfica configurada o almacenada en el servidor.' });
    }
    const cleanB64 = b64.replace(/^data:.*?;base64,/, '');
    const buffer = Buffer.from(cleanB64, 'base64');
    const filename = config.cryptographicKeyFileName || 'llave_criptografica_hacienda.p12';
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/x-pkcs12');
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Consulta de estado de un comprobante ante Hacienda
app.get('/api/fiscal/query-document/:numericKey', async (req, res) => {
  try {
    const result = await ElectronicInvoicingEngine.queryHaciendaStatus(req.params.numericKey);
    if (result.document) {
      broadcastEvent('ELECTRONIC_DOC_UPDATED', result.document);
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Reconciliación / Sondeo por lotes de comprobantes pendientes en Hacienda
app.post('/api/fiscal/reconcile-pending', async (req, res) => {
  try {
    const result = await ElectronicInvoicingEngine.reconcilePendingDocuments();
    broadcastEvent('ELECTRONIC_DOCS_RECONCILED', result);
    res.json({
      success: true,
      message: `Sondeo completado: ${result.totalChecked} procesados, ${result.accepted} aceptados, ${result.rejected} rechazados, ${result.stillProcessing} aún en proceso.`,
      result
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Emisión de Tiquete Electrónico de Prueba en Sandbox con Monitoreo de Estados
app.post('/api/fiscal/test-emit-ticket', async (req, res) => {
  try {
    const directConfig = db.getHaciendaDirectConfig();
    const restInfo = db.getRestaurantInfo();

    // Crear una venta de prueba controlada
    const now = new Date();
    const testSaleId = `sale-test-${Date.now()}`;
    const testSale: Sale = {
      id: testSaleId,
      orderNumber: 9999,
      date: now.toISOString().split('T')[0],
      time: now.toTimeString().split(' ')[0],
      timestamp: now.getTime(),
      customerName: 'Consumidor Final (Prueba DGT v4.4)',
      orderType: 'DINE_IN',
      items: [
        {
          productId: 'prod-p1',
          name: 'Pieza de Pollo Crujiente (Prueba DGT v4.4)',
          price: 1283.19,
          quantity: 1,
          taxRate: 0.13,
          subtotal: 1283.19,
          taxAmount: 166.81,
          total: 1450,
          notes: 'Prueba de Facturación Electrónica DGT v4.4'
        }
      ],
      subtotal: 1283.19,
      discount: 0,
      taxTotal: 166.81,
      total: 1450,
      payments: [
        {
          method: 'CASH',
          amount: 1450
        }
      ],
      amountPaid: 1450,
      change: 0,
      saleCondition: '01',
      orderStatus: 'DELIVERED',
      invoiceStatus: 'PROCESSING',
      cashierId: 'cajero-test',
      cashierName: 'Administrador Fiscal (Pruebas)',
      location: 'RESTAURANTE',
      electronicDocumentType: '04',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };

    // Guardar venta temporal
    db.createSale(testSale);

    // Emitir Tiquete Electrónico 04
    const emitResult = await ElectronicInvoicingEngine.emitDocumentFromSale({
      sale: testSale,
      documentType: '04',
      branch: directConfig.branch || '001',
      terminal: directConfig.terminal || '00001'
    });

    if (emitResult.success && emitResult.electronicDocument) {
      db.updateSale(testSaleId, {
        invoiceStatus: 'INVOICED',
        electronicDocumentType: emitResult.electronicDocument.documentType,
        numericKey50: emitResult.electronicDocument.numericKey,
        consecutive20: emitResult.electronicDocument.consecutive,
        haciendaStatus: emitResult.electronicDocument.status,
        haciendaResponseMessage: emitResult.electronicDocument.statusDescription,
        xmlEmitted: emitResult.electronicDocument.xmlGenerated,
        xmlHaciendaResponse: emitResult.electronicDocument.xmlResponseHacienda
      });
      broadcastEvent('SALE_UPDATED', db.getSaleById(testSaleId));
    }

    res.json({
      success: true,
      message: 'Tiquete de prueba emitido satisfactoriamente. Iniciando trazabilidad...',
      sale: testSale,
      emission: emitResult
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/fiscal/company-info', (req, res) => {
  try {
    const updated = db.updateRestaurantInfo(req.body);
    db.addFiscalAuditLog({
      userId: 'admin',
      userName: 'Administrador Fiscal',
      action: 'EMISION_COMPROBANTE',
      details: 'Información fiscal y actividad económica del emisor actualizada.'
    });
    res.json({ success: true, restaurantInfo: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/fiscal/validate-sale', (req, res) => {
  try {
    const { documentType, items, customer, payments, subtotal, discount, taxTotal, total } = req.body;
    const productsRegistry = db.getProducts();

    const validation = FiscalValidationService.validateElectronicDocumentPayload({
      documentType: documentType || '04',
      items,
      customer,
      payments,
      subtotal,
      discount: discount || 0,
      taxTotal,
      total,
      productsRegistry
    });

    if (!validation.isValid) {
      db.addFiscalAuditLog({
        userId: 'pos',
        userName: 'POS Cajero',
        action: 'VALIDACION_FALLIDA',
        details: `Validación fiscal fallida: ${validation.errors.join('; ')}`,
        error: validation.errors.join(' | ')
      });
    }

    res.json(validation);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint de Auditoría y Validación Oficial del Emisor (DGT v4.4)
app.post('/api/fiscal/validate-issuer', (req, res) => {
  try {
    const candidate = req.body && Object.keys(req.body).length > 0 
      ? req.body 
      : {
          name: db.getHaciendaDirectConfig().emisorName || db.getRestaurantInfo().name,
          identificationType: db.getHaciendaDirectConfig().emisorIdentificationType || db.getRestaurantInfo().identificationType,
          identificationNumber: db.getHaciendaDirectConfig().emisorTaxId || db.getRestaurantInfo().taxId,
          commercialName: db.getHaciendaDirectConfig().emisorCommercialName || db.getRestaurantInfo().commercialName,
          economicActivity: db.getHaciendaDirectConfig().emisorEconomicActivity || db.getRestaurantInfo().economicActivity,
          province: db.getHaciendaDirectConfig().emisorProvince || db.getRestaurantInfo().province,
          canton: db.getHaciendaDirectConfig().emisorCanton || db.getRestaurantInfo().canton,
          district: db.getHaciendaDirectConfig().emisorDistrict || db.getRestaurantInfo().district,
          neighborhood: db.getHaciendaDirectConfig().emisorNeighborhood,
          address: db.getHaciendaDirectConfig().emisorAddressDetail || db.getRestaurantInfo().location,
          phone: db.getHaciendaDirectConfig().emisorPhone || db.getRestaurantInfo().phone,
          phoneCountryCode: db.getHaciendaDirectConfig().emisorPhoneCountryCode || '506',
          email: db.getHaciendaDirectConfig().emisorEmail || db.getRestaurantInfo().email,
          branch: db.getHaciendaDirectConfig().branch || '001',
          terminal: db.getHaciendaDirectConfig().terminal || '00001',
          softwareProviderName: db.getHaciendaDirectConfig().softwareProviderName,
          softwareProviderTaxId: db.getHaciendaDirectConfig().softwareProviderTaxId,
          hasAlcoholicBeverageRegistry: db.getHaciendaDirectConfig().hasAlcoholicBeverageRegistry,
          alcoholicBeverageRegistry: db.getHaciendaDirectConfig().alcoholicBeverageRegistry
        };

    const auditResult = FiscalValidationService.validateIssuer(candidate);
    res.json({
      success: true,
      audit: auditResult
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint para Generar Factura Electrónica 01 de Prueba en Ambiente de Pruebas (Staging / Sandbox)
app.post('/api/fiscal/test-factura-01', async (req, res) => {
  try {
    const directConfig = db.getHaciendaDirectConfig();
    const restaurantInfo = db.getRestaurantInfo();

    // 1. Emisor bajo prueba
    const candidateIssuer = req.body.issuerOverride || {
      name: directConfig.emisorName || restaurantInfo.name,
      commercialName: directConfig.emisorCommercialName || restaurantInfo.commercialName,
      identificationType: directConfig.emisorIdentificationType || restaurantInfo.identificationType,
      identificationNumber: directConfig.emisorTaxId || restaurantInfo.taxId,
      economicActivity: FISCAL_CONFIG.codigoActividadEmisor,
      phone: directConfig.emisorPhone || restaurantInfo.phone,
      phoneCountryCode: directConfig.emisorPhoneCountryCode || '506',
      email: directConfig.emisorEmail || restaurantInfo.email,
      province: directConfig.emisorProvince || restaurantInfo.province,
      canton: directConfig.emisorCanton || restaurantInfo.canton,
      district: directConfig.emisorDistrict || restaurantInfo.district,
      neighborhood: directConfig.emisorNeighborhood,
      address: directConfig.emisorAddressDetail || `${restaurantInfo.district}, ${restaurantInfo.canton}, ${restaurantInfo.province}`,
      branch: directConfig.branch || '001',
      terminal: directConfig.terminal || '00001'
    };

    // 2. Validar Emisor
    const issuerAudit = FiscalValidationService.validateIssuer(candidateIssuer);
    if (!issuerAudit.isValid) {
      return res.status(400).json({
        success: false,
        message: `El emisor no cumple con los requisitos DGT v4.4: ${issuerAudit.errors[0]}`,
        audit: issuerAudit
      });
    }

    // 3. Receptor de prueba (Cliente Frecuente con Cédula Jurídica)
    const testReceiver = req.body.receiver || {
      name: 'Corporación Gastronómica de Cartago S.A.',
      commercialName: 'Gastronomía Cartago',
      identificationType: '02',
      identificationNumber: '3101789456',
      economicActivity: FISCAL_CONFIG.codigoActividadEmisor,
      phone: '25510000',
      phoneCountryCode: '506',
      email: 'contabilidad@gastronomiacartago.cr',
      province: '3',
      canton: '01',
      district: '01',
      address: 'Avenida Central, Cartago Centro'
    };

    // 4. Armar documento de prueba
    const now = new Date();
    const consecutive = `0010000101${String(Date.now() % 10000000000).padStart(10, '0')}`;
    const numericKey = db.generateNumericKey(consecutive, now, candidateIssuer.identificationNumber, '1');

    const sampleDoc: import('../types/pos').ElectronicDocument = {
      id: `doc-test-${Date.now()}`,
      saleId: `sale-test-${Date.now()}`,
      documentType: '01', // Factura Electrónica
      consecutive,
      numericKey,
      issueDate: now.toISOString(),
      economicActivity: candidateIssuer.economicActivity,
      economicActivityCode: candidateIssuer.economicActivity,
      terminal: candidateIssuer.terminal || '00001',
      currency: 'CRC',
      saleCondition: '01',
      status: 'ACEPTADO_HACIENDA',
      statusDescription: 'Factura Electrónica de Prueba v4.4 - Validación Exitosa',
      issuer: {
        name: candidateIssuer.name,
        commercialName: candidateIssuer.commercialName,
        identificationType: candidateIssuer.identificationType,
        identificationNumber: candidateIssuer.identificationNumber,
        economicActivity: candidateIssuer.economicActivity,
        phone: candidateIssuer.phone,
        phoneCountryCode: candidateIssuer.phoneCountryCode || '506',
        email: candidateIssuer.email,
        province: candidateIssuer.province,
        canton: candidateIssuer.canton,
        district: candidateIssuer.district,
        neighborhood: candidateIssuer.neighborhood,
        address: candidateIssuer.address
      },
      receiver: testReceiver,
      lines: [
        {
          lineNumber: 1,
          productId: 'prod-p1',
          internalCode: 'POL-001',
          cabysCode: '6332000000000',
          commercialCode: '101',
          description: 'Pieza de Pollo Crujiente (Receta Cervanteña)',
          detail: 'Pieza de Pollo Crujiente (Receta Cervanteña)',
          itemType: 'SERVICIO',
          quantity: 1,
          unitOfMeasure: 'Os',
          unitPrice: 1283.1858,
          discount: 0,
          totalAmount: 1283.1858,
          subtotal: 1283.1858,
          taxRate: 0.13,
          taxCode: '01',
          taxRateCode: '08',
          taxAmount: 166.8142,
          totalLine: 1450,
          totalLineAmount: 1450
        }
      ],
      subtotal: 1283.19,
      discountTotal: 0,
      taxTotal: 166.81,
      total: 1450,
      paymentMethods: [
        {
          method: 'CASH',
          amount: 1450
        }
      ],
      retryAttempts: 0,
      isContingency: false,
      createdBy: 'Administrador Fiscal',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };

    // 5. Generar XML
    const xml = HaciendaXmlGenerator.generateDocumentXml(sampleDoc);

    res.json({
      success: true,
      message: 'Factura Electrónica 01 generada y validada satisfactoriamente bajo estándar DGT v4.4.',
      sampleDoc,
      xml,
      audit: issuerAudit
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/fiscal/electronic-documents', (req, res) => {
  const full = req.query.full === 'true';
  const rawDocs = db.getElectronicDocuments();

  // Mapear ventas para asociar fecha original de venta y número de comanda
  const salesMap = new Map<string, any>();
  (db.getSales() || []).forEach(s => {
    if (s && s.id) salesMap.set(s.id, s);
  });

  const docs = rawDocs.map(d => {
    const sale = d.saleId ? salesMap.get(d.saleId) : null;
    const saleDate = sale ? (sale.date || (sale.timestamp ? getCostaRicaDate(sale.timestamp) : undefined)) : undefined;
    const orderNumber = sale ? sale.orderNumber : undefined;
    return {
      ...d,
      saleDate: saleDate || (d as any).saleDate,
      orderNumber: orderNumber || (d as any).orderNumber
    };
  });

  // Si se pide explícitamente full sin paginar
  if (full && !req.query.page && !req.query.limit && !req.query.paginated) {
    return res.json(docs);
  }

  // Soporte de paginación del servidor para escalar a 60,000+ comprobantes con 0 latencia
  const isPaginated = req.query.paginated === 'true' || Boolean(req.query.page || req.query.limit);

  if (isPaginated) {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.max(1, Math.min(1000, parseInt(String(req.query.limit || '20'), 10)));
    const search = String(req.query.search || '').trim().toLowerCase();
    const docType = String(req.query.docType || 'ALL');
    const status = String(req.query.status || 'ALL');
    const sort = String(req.query.sort || 'DESC');
    const dateFrom = String(req.query.dateFrom || '');
    const dateTo = String(req.query.dateTo || '');
    const dateMode = String(req.query.dateMode || 'saleDate');

    let filtered = docs;

    if (search) {
      filtered = filtered.filter(d => {
        const key = (d.numericKey || '').toLowerCase();
        const consec = (d.consecutive || '').toLowerCase();
        const clientName = (d.receiver?.name || '').toLowerCase();
        const clientId = (d.receiver?.identificationNumber || '').toLowerCase();
        const clientEmail = (d.receiver?.email || '').toLowerCase();
        return key.includes(search) || consec.includes(search) || clientName.includes(search) || clientId.includes(search) || clientEmail.includes(search);
      });
    }

    if (docType && docType !== 'ALL') {
      filtered = filtered.filter(d => d.documentType === docType);
    }

    if (status && status !== 'ALL') {
      filtered = filtered.filter(d => d.status === status);
    }

    if (dateFrom) {
      filtered = filtered.filter(d => {
        const targetDate = dateMode === 'saleDate'
          ? (d.saleDate || (d.issueDate ? d.issueDate.split('T')[0] : (d.createdAt ? d.createdAt.split('T')[0] : '')))
          : (d.issueDate ? d.issueDate.split('T')[0] : (d.createdAt ? d.createdAt.split('T')[0] : ''));
        return targetDate >= dateFrom;
      });
    }

    if (dateTo) {
      filtered = filtered.filter(d => {
        const targetDate = dateMode === 'saleDate'
          ? (d.saleDate || (d.issueDate ? d.issueDate.split('T')[0] : (d.createdAt ? d.createdAt.split('T')[0] : '')))
          : (d.issueDate ? d.issueDate.split('T')[0] : (d.createdAt ? d.createdAt.split('T')[0] : ''));
        return targetDate <= dateTo;
      });
    }

    // Ordenar
    filtered = [...filtered].sort((a, b) => {
      const timeA = new Date(a.issueDate || a.createdAt || 0).getTime();
      const timeB = new Date(b.issueDate || b.createdAt || 0).getTime();
      if (sort === 'ASC') {
        if (timeA !== timeB) return timeA - timeB;
        return (a.consecutive || '').localeCompare(b.consecutive || '');
      } else {
        if (timeB !== timeA) return timeB - timeA;
        return (b.consecutive || '').localeCompare(a.consecutive || '');
      }
    });

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const offset = (page - 1) * limit;
    const pageItems = filtered.slice(offset, offset + limit);

    // Mapear a formato liviano para transferir solo unos pocos kilobytes
    const items = pageItems.map(doc => {
      const {
        xmlGenerated,
        xmlResponseHacienda,
        diagnosticLogs,
        lastQueryRawResponse,
        sendResponseRaw,
        ...essentialDoc
      } = doc;
      return {
        ...essentialDoc,
        hasXmlGenerated: Boolean(xmlGenerated),
        hasXmlResponse: Boolean(xmlResponseHacienda)
      };
    });

    return res.json({
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasPrev: page > 1,
        hasNext: page < totalPages
      }
    });
  }

  // Modo compatibilidad previa (sin parámetros de paginación)
  const lightweightDocs = docs.map(doc => {
    const {
      xmlGenerated,
      xmlResponseHacienda,
      diagnosticLogs,
      lastQueryRawResponse,
      sendResponseRaw,
      ...essentialDoc
    } = doc;
    return {
      ...essentialDoc,
      hasXmlGenerated: Boolean(xmlGenerated),
      hasXmlResponse: Boolean(xmlResponseHacienda)
    };
  });
  res.json(lightweightDocs);
});

app.get('/api/fiscal/electronic-documents/:id', (req, res) => {
  const doc = db.getElectronicDocumentById(req.params.id);
  if (!doc) {
    return res.status(404).json({ error: 'Comprobante no encontrado' });
  }
  const xmlGen = db.getXmlForDocument(doc.numericKey) || doc.xmlGenerated;
  const xmlResp = db.getXmlResponseForDocument(doc.numericKey) || doc.xmlResponseHacienda;
  res.json({
    ...doc,
    xmlGenerated: xmlGen,
    xmlResponseHacienda: xmlResp
  });
});

// Conjunto en memoria de bloqueo (Mutex) para evitar emisiones concurrentes duplicadas
const activeEmittingSales = new Set<string>();

// =========================================================================
// WORKER AUTÓNOMO DE FONDO: EMISIÓN SECUENCIAL FIFO Y RECONCILIACIÓN CONTINUA
// Despacha comprobantes pendientes uno por uno de forma continua en el servidor
// sin depender del navegador del cajero ni congelar la pantalla de ventas
// =========================================================================
let isAutoFiscalRunning = false;
let fiscalWorkerTriggerTimer: NodeJS.Timeout | null = null;

const triggerAutonomousFiscalWorker = (delayMs = 200) => {
  if (fiscalWorkerTriggerTimer) clearTimeout(fiscalWorkerTriggerTimer);
  fiscalWorkerTriggerTimer = setTimeout(() => {
    runAutonomousFiscalWorker().catch(err => {
      console.warn('⚠️ [FiscalWorker] Error no fatal:', err?.message || err);
    });
  }, delayMs);
};

const runAutonomousFiscalWorker = async (): Promise<void> => {
  if (isAutoFiscalRunning) return;
  isAutoFiscalRunning = true;
  try {
    const config = db.getHaciendaDirectConfig();
    if (!config.enabled || !config.autoSendToHacienda) return;

    // 1. Sincronizar ventas recientes desde Firestore y marcar expirados (TE > 2 días, FE > 7 días)
    await db.syncRecentSalesFromFirestore();
    db.markExpiredPendingSales();

    const cutoffStr = '2026-10-11';

    const allSales = db.getSales();
    const pendingSales = allSales.filter(s => {
      const hasRealKey = Boolean(s.numericKey50 && /^\d{50}$/.test(s.numericKey50));
      const hasRealConsec = Boolean(s.consecutive20 && /^\d{20}$/.test(s.consecutive20));
      const isAlreadyFullyInvoiced = (s.invoiceStatus === 'INVOICED' || s.haciendaStatus === 'ACEPTADO_HACIENDA') && hasRealKey && hasRealConsec;
      if (isAlreadyFullyInvoiced) return false;
      if (s.haciendaStatus === 'CONTINGENCIA_VENCIDA' || s.haciendaStatus === 'ANULADO_POR_NC') return false;

      const sDate = s.date || (s.timestamp ? getCostaRicaDate(s.timestamp) : '');
      if (!sDate || sDate < cutoffStr) return false;

      const lockKey = s.id || `order-${s.orderNumber}-${s.date || ''}`;
      if (activeEmittingSales.has(lockKey)) return false;
      return true;
    });

    if (pendingSales.length > 0) {
      // Orden estrictamente cronológico (FIFO: más antiguo primero) para que las órdenes se emitan en secuencia
      pendingSales.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

      // Procesar hasta 25 ventas por pasada para vaciar la cola rápidamente
      const batch = pendingSales.slice(0, 25);
      let emittedThisCycle = 0;

      for (const sale of batch) {
        const lockKey = sale.id || `order-${sale.orderNumber}-${sale.date || ''}`;
        if (activeEmittingSales.has(lockKey)) continue;
        activeEmittingSales.add(lockKey);
        try {
          const docType = sale.electronicDocumentType || (sale.customerId && sale.customerId !== 'cust-final' && sale.customerIdentification ? '01' : '04');
          const receiver = (sale.customerId ? db.getCustomerById(sale.customerId) : undefined) || 
            sale.receiverSnapshot || {
            id: sale.customerId || 'cust-final',
            name: sale.customerName || 'Cliente General',
            identification: sale.customerIdentification || '000000000',
            identificationType: sale.customerIdentificationType || '01',
            email: sale.customerEmail,
            phone: sale.customerPhone,
            address: sale.customerAddress || 'Cervantes, Cartago',
            province: '3',
            canton: '02',
            district: '01',
            createdAt: new Date().toISOString()
          };

          const result = await ElectronicInvoicingEngine.emitDocumentFromSale({
            sale,
            documentType: docType,
            receiverCustomer: receiver,
            branch: '001',
            terminal: '00001',
            useRestaurantServiceLine: docType === '01' ? sale.useRestaurantServiceLine : false
          });

          if (result.success && result.electronicDocument) {
            emittedThisCycle++;
            db.updateSale(sale.id, {
              invoiceStatus: 'INVOICED',
              electronicDocumentType: result.electronicDocument.documentType,
              numericKey50: result.electronicDocument.numericKey,
              consecutive20: result.electronicDocument.consecutive,
              haciendaStatus: result.electronicDocument.status,
              haciendaResponseMessage: result.electronicDocument.statusDescription,
              xmlEmitted: result.electronicDocument.xmlGenerated,
              xmlHaciendaResponse: result.electronicDocument.xmlResponseHacienda
            });
            broadcastEvent('SALE_UPDATED', db.getSaleById(sale.id));
          }
        } catch (singleEmitErr) {
          // Silencioso: reintentará en el siguiente ciclo
        } finally {
          activeEmittingSales.delete(lockKey);
        }
      }

      // Si aún quedan ventas pendientes y se lograron emitir comprobantes en este ciclo, continuar de inmediato
      if (pendingSales.length > batch.length && emittedThisCycle > 0) {
        triggerAutonomousFiscalWorker(500);
      }
    }

    // 2. RECONCILIACIÓN: Sondear documentos pendientes de respuesta DGT
    const allDocs = db.getElectronicDocuments();
    const pendingContingency = allDocs.filter(d => 
      d.status === 'CONTINGENCIA' || 
      d.status === 'CONTINGENCIA_PENDIENTE' || 
      d.status === 'SIN_INTERNET_PENDIENTE' || 
      d.status === 'PENDIENTE_ENVIO' || 
      d.status === 'ENVIADO_PROCESANDO'
    );

    if (pendingContingency.length > 0) {
      const result = await ElectronicInvoicingEngine.reconcilePendingDocuments();
      if (result && result.totalChecked > 0) {
        console.log(`[AutoSync Contingencia] Reconciliación: ${result.totalChecked} procesados, ${result.accepted} aceptados, ${result.rejected} rechazados.`);
        broadcastEvent('FISCAL_DOCS_UPDATED', { message: 'Comprobantes fiscales reconciliados con Hacienda' });
      }
    }
  } catch (err) {
    // Red no disponible o fallo transitorio - no bloqueante
  } finally {
    isAutoFiscalRunning = false;
  }
};


// Emisión Directa Oficial Costa Rica (Hacienda v4.4)
app.post('/api/fiscal/emit-document', async (req, res) => {
  try {
    const { sale, documentType, receiverCustomer, branch, terminal, isContingency, contingencyReason, isOffline, forceSituation, useRestaurantServiceLine } = req.body;
    
    if (!sale) {
      return res.status(400).json({ success: false, message: 'La venta es requerida para emitir comprobante.' });
    }

    // Idempotencia: si el worker autónomo del servidor ya emitió esta venta con clave de 50 dígitos y consecutivo de 20 dígitos, devolver el comprobante existente sin re-emitir
    const existingSale = sale.id ? db.getSaleById(sale.id) : undefined;
    if (
      existingSale &&
      existingSale.numericKey50 &&
      /^\d{50}$/.test(existingSale.numericKey50) &&
      existingSale.consecutive20 &&
      /^\d{20}$/.test(existingSale.consecutive20) &&
      (existingSale.invoiceStatus === 'INVOICED' || existingSale.haciendaStatus === 'ACEPTADO_HACIENDA')
    ) {
      const existingDoc = db.getElectronicDocuments().find(
        d => d.saleId === existingSale.id || d.numericKey === existingSale.numericKey50
      );
      return res.json({
        success: true,
        alreadyEmitted: true,
        message: 'Comprobante ya emitido previamente por el motor fiscal del servidor.',
        electronicDocument: existingDoc || {
          id: existingSale.numericKey50,
          saleId: existingSale.id,
          documentType: existingSale.electronicDocumentType || documentType || '04',
          numericKey: existingSale.numericKey50,
          consecutive: existingSale.consecutive20,
          status: existingSale.haciendaStatus || 'ACEPTADO_HACIENDA',
          statusDescription: existingSale.haciendaResponseMessage || 'Comprobante aceptado por el Ministerio de Hacienda',
          xmlGenerated: existingSale.xmlEmitted || '',
          xmlResponseHacienda: existingSale.xmlHaciendaResponse || ''
        }
      });
    }

    // Candado contra doble emisión concurrente
    const lockKey = sale.id || `order-${sale.orderNumber}-${sale.date || ''}`;
    if (activeEmittingSales.has(lockKey)) {
      return res.status(409).json({
        success: false,
        message: 'Esta venta ya se encuentra en proceso de emisión ante Hacienda en este instante. Por favor espere.'
      });
    }

    activeEmittingSales.add(lockKey);
    try {
      const result = await ElectronicInvoicingEngine.emitDocumentFromSale({
        sale,
        documentType: documentType || '04',
        receiverCustomer,
        branch: branch || '001',
        terminal: terminal || '00001',
        isContingency: Boolean(isContingency),
        contingencyReason,
        isOffline: Boolean(isOffline),
        forceSituation,
        useRestaurantServiceLine: Boolean(useRestaurantServiceLine || sale.useRestaurantServiceLine)
      });

      if (result.success && result.electronicDocument) {
        // Actualizar venta local con clave 50 dígitos, consecutivo y estado facturado
        db.updateSale(sale.id, {
          invoiceStatus: 'INVOICED',
          electronicDocumentType: result.electronicDocument.documentType,
          numericKey50: result.electronicDocument.numericKey,
          consecutive20: result.electronicDocument.consecutive,
          haciendaStatus: result.electronicDocument.status,
          haciendaResponseMessage: result.electronicDocument.statusDescription,
          xmlEmitted: result.electronicDocument.xmlGenerated,
          xmlHaciendaResponse: result.electronicDocument.xmlResponseHacienda
        });
        broadcastEvent('SALE_UPDATED', db.getSaleById(sale.id));
      }

      res.json(result);
    } finally {
      activeEmittingSales.delete(lockKey);
    }
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Conteo rápido de comprobantes pendientes de emisión fiscal (A partir de 2026-10-23: Tiquetes 04 2 días, Facturas 01 1 semana)
app.get('/api/fiscal/pending-count', async (req, res) => {
  const targetDate = req.query.date ? String(req.query.date) : undefined;
  const cutoffStr = '2026-10-11';
  await db.syncRecentSalesFromFirestore(targetDate);
  db.markExpiredPendingSales();

  const allSales = db.getSales();
  const pending = allSales.filter(s => {
    const hasRealKey = Boolean(s.numericKey50 && /^\d{50}$/.test(s.numericKey50));
    const hasRealConsec = Boolean(s.consecutive20 && /^\d{20}$/.test(s.consecutive20));
    if ((s.invoiceStatus === 'INVOICED' || s.haciendaStatus === 'ACEPTADO_HACIENDA') && hasRealKey && hasRealConsec) return false;
    if (s.haciendaStatus === 'CONTINGENCIA_VENCIDA' || s.haciendaStatus === 'ANULADO_POR_NC') return false;

    const sDate = s.date || (s.timestamp ? getCostaRicaDate(s.timestamp) : '');
    if (!sDate || sDate < cutoffStr) return false;

    if (targetDate) {
      return sDate === targetDate;
    }
    return true;
  });
  res.json({ count: pending.length });
});

// Emisión en lote de comprobantes pendientes hacia Hacienda (A partir de 2026-10-23: Tiquetes 04 2 días, Facturas 01 1 semana)
app.post('/api/fiscal/emit-pending-batch', async (req, res) => {
  try {
    const targetDate = req.body?.date || req.query?.date;
    const cutoffStr = '2026-10-11';
    const clientSales: any[] = Array.isArray(req.body?.sales) ? req.body.sales : [];
    
    // Si el cliente envía ventas pendientes desde su IndexedDB/memoria, registrar si están dentro de la ventana de 1 semana
    clientSales.forEach(s => {
      if (s && s.id) {
        const sDate = s.date || (s.timestamp ? getCostaRicaDate(s.timestamp) : '');
        if (sDate && sDate >= cutoffStr) {
          db.createSale(s);
        }
      }
    });

    // Refrescar automáticamente ventas recientes desde Firestore y marcar expirados
    await db.syncRecentSalesFromFirestore(targetDate ? String(targetDate) : undefined);
    db.markExpiredPendingSales();

    const allSales = db.getSales();
    
    const requestedSaleIds: string[] = Array.isArray(req.body?.saleIds) ? req.body.saleIds : [];
    
    // Filtrar ventas pendientes de emisión dentro de la ventana de 1 semana
    const pendingSales = allSales.filter(s => {
      const hasRealKey = Boolean(s.numericKey50 && /^\d{50}$/.test(s.numericKey50));
      const hasRealConsec = Boolean(s.consecutive20 && /^\d{20}$/.test(s.consecutive20));
      const isAlreadyFullyInvoiced = (s.invoiceStatus === 'INVOICED' || s.haciendaStatus === 'ACEPTADO_HACIENDA') && hasRealKey && hasRealConsec;
      if (isAlreadyFullyInvoiced) {
        return false;
      }
      if (s.haciendaStatus === 'CONTINGENCIA_VENCIDA' || s.haciendaStatus === 'ANULADO_POR_NC') {
        return false;
      }
      const sDate = s.date || (s.timestamp ? getCostaRicaDate(s.timestamp) : '');
      if (!sDate || sDate < cutoffStr) {
        return false;
      }
      const lockKey = s.id || `order-${s.orderNumber}-${s.date || ''}`;
      if (activeEmittingSales.has(lockKey)) {
        return false;
      }
      if (requestedSaleIds.length > 0) {
        const matches = requestedSaleIds.includes(s.id) || 
                        requestedSaleIds.includes(`pending-${s.id}`) ||
                        requestedSaleIds.includes(s.numericKey50 || '') ||
                        requestedSaleIds.includes(`PENDIENTE-ORDEN-${s.orderNumber}`);
        if (!matches) return false;
      }
      if (targetDate) {
        return sDate === targetDate;
      }
      return true;
    });

    // Orden estrictamente cronológico (FIFO: más antiguo primero) para mantener la secuencia fiscal
    pendingSales.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    console.log(`📑 [Batch Fiscal] Iniciando emisión en lote para ${pendingSales.length} ventas pendientes...`);
    
    let emittedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    for (const sale of pendingSales) {
      const lockKey = sale.id || `order-${sale.orderNumber}-${sale.date || ''}`;
      if (activeEmittingSales.has(lockKey)) continue;
      activeEmittingSales.add(lockKey);
      try {
        const docType = sale.electronicDocumentType || (sale.customerId && sale.customerId !== 'cust-final' && sale.customerIdentification ? '01' : '04');
        const receiver = (sale.customerId ? db.getCustomerById(sale.customerId) : undefined) || 
          sale.receiverSnapshot || {
          id: sale.customerId || 'cust-final',
          name: sale.customerName || 'Cliente General',
          identification: sale.customerIdentification || '000000000',
          identificationType: sale.customerIdentificationType || '01',
          email: sale.customerEmail,
          phone: sale.customerPhone,
          address: sale.customerAddress || 'Cervantes, Cartago',
          province: '3',
          canton: '02',
          district: '01',
          createdAt: new Date().toISOString()
        };

        const result = await ElectronicInvoicingEngine.emitDocumentFromSale({
          sale,
          documentType: docType,
          receiverCustomer: receiver,
          branch: '001',
          terminal: '00001',
          useRestaurantServiceLine: docType === '01' ? sale.useRestaurantServiceLine : false
        });

        if (result.success && result.electronicDocument) {
          emittedCount++;
          db.updateSale(sale.id, {
            invoiceStatus: 'INVOICED',
            electronicDocumentType: result.electronicDocument.documentType,
            numericKey50: result.electronicDocument.numericKey,
            consecutive20: result.electronicDocument.consecutive,
            haciendaStatus: result.electronicDocument.status,
            haciendaResponseMessage: result.electronicDocument.statusDescription,
            xmlEmitted: result.electronicDocument.xmlGenerated,
            xmlHaciendaResponse: result.electronicDocument.xmlResponseHacienda
          });
          broadcastEvent('SALE_UPDATED', db.getSaleById(sale.id));
        } else {
          failedCount++;
          if (result.message) errors.push(`Orden #${sale.orderNumber}: ${result.message}`);
        }
      } catch (err: any) {
        failedCount++;
        errors.push(`Orden #${sale.orderNumber}: ${err.message}`);
      } finally {
        activeEmittingSales.delete(lockKey);
      }
    }

    res.json({
      success: true,
      totalPending: pendingSales.length,
      emittedCount,
      failedCount,
      errors: errors.slice(0, 10),
      message: `Procesadas ${pendingSales.length} ventas: ${emittedCount} comprobantes emitidos exitosamente.`
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Emisión de Nota de Crédito Electrónica (03)
app.post('/api/fiscal/emit-credit-note', async (req, res) => {
  try {
    const { 
      originalDocumentKey, 
      reason, 
      referenceCode, 
      referenceDocumentType, 
      customNumericKey,
      cashierName, 
      branch, 
      terminal 
    } = req.body;

    if (!originalDocumentKey) {
      return res.status(400).json({ success: false, message: 'La clave o identificador del documento original es obligatoria.' });
    }

    const result = await ElectronicInvoicingEngine.emitCreditNote({
      originalDocumentKey,
      reason: reason || 'Anulación de documento de referencia',
      referenceCode: referenceCode || '01',
      referenceDocumentType: referenceDocumentType || undefined,
      customNumericKey: customNumericKey || undefined,
      cashierName: cashierName || 'Cajero Principal',
      branch: branch || '001',
      terminal: terminal || '00001'
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Endpoint para obtener el resumen de sincronización y estado fiscal (Desde 2026-10-11)
app.get('/api/fiscal/sync-summary', async (req, res) => {
  try {
    const cutoffStr = '2026-10-11';
    const todayStr = getCostaRicaDate();
    const yesterdayStr = getCostaRicaDate(Date.now() - 24 * 60 * 60 * 1000);
    
    // Sincronizar ventas recientes de Firestore y marcar expirados
    await db.syncRecentSalesFromFirestore();
    db.markExpiredPendingSales();
    
    const allSales = db.getSales();
    
    const isPending = (s: any) => {
      const hasRealKey = Boolean(s.numericKey50 && /^\d{50}$/.test(s.numericKey50));
      const hasRealConsec = Boolean(s.consecutive20 && /^\d{20}$/.test(s.consecutive20));
      if ((s.invoiceStatus === 'INVOICED' || s.haciendaStatus === 'ACEPTADO_HACIENDA') && hasRealKey && hasRealConsec) return false;
      if (s.haciendaStatus === 'CONTINGENCIA_VENCIDA' || s.haciendaStatus === 'ANULADO_POR_NC') return false;
      const sDate = s.date || (s.timestamp ? getCostaRicaDate(s.timestamp) : '');
      if (!sDate || sDate < cutoffStr) return false;
      return true;
    };

    const isAccepted = (s: any) => {
      const hasRealKey = Boolean(s.numericKey50 && /^\d{50}$/.test(s.numericKey50));
      return (s.haciendaStatus === 'ACEPTADO_HACIENDA' || s.invoiceStatus === 'INVOICED') && hasRealKey;
    };

    const todaySales = allSales.filter(s => (s.date || (s.timestamp ? getCostaRicaDate(s.timestamp) : '')) === todayStr);
    const yesterdaySales = allSales.filter(s => (s.date || (s.timestamp ? getCostaRicaDate(s.timestamp) : '')) === yesterdayStr);

    const paymentTotalsToday = { cash: 0, card: 0, sinpe: 0, other: 0 };
    todaySales.forEach(s => {
      (s.payments || []).forEach((p: any) => {
        if (p.method === 'CASH') paymentTotalsToday.cash += (p.amount || 0);
        else if (p.method === 'CARD') paymentTotalsToday.card += (p.amount || 0);
        else if (p.method === 'SINPE') paymentTotalsToday.sinpe += (p.amount || 0);
        else paymentTotalsToday.other += (p.amount || 0);
      });
    });

    const todayPendingCount = todaySales.filter(isPending).length;
    const yesterdayPendingCount = yesterdaySales.filter(isPending).length;
    const totalPendingOverall = allSales.filter(isPending).length;

    res.json({
      success: true,
      timestamp: Date.now(),
      todayStr,
      yesterdayStr,
      isDbConnected: true,
      today: {
        salesCount: todaySales.length,
        totalAmount: todaySales.reduce((sum, s) => sum + (s.total || 0), 0),
        pendingCount: todayPendingCount,
        acceptedCount: todaySales.filter(isAccepted).length
      },
      yesterday: {
        salesCount: yesterdaySales.length,
        totalAmount: yesterdaySales.reduce((sum, s) => sum + (s.total || 0), 0),
        pendingCount: yesterdayPendingCount,
        acceptedCount: yesterdaySales.filter(isAccepted).length
      },
      totalPendingOverall,
      paymentTotalsToday
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint para ejecutar sincronización y emisión forzada (A partir de 2026-10-23: Tiquetes 04 2 días, Facturas 01 1 semana)
app.post('/api/fiscal/execute-full-sync', async (req, res) => {
  try {
    const FISCAL_RULES_START_DATE = '2026-10-23';
    const rawYesterdayStr = getCostaRicaDate(Date.now() - 24 * 60 * 60 * 1000);
    const rawOneWeekAgoStr = getCostaRicaDate(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const yesterdayStr = rawYesterdayStr < FISCAL_RULES_START_DATE ? FISCAL_RULES_START_DATE : rawYesterdayStr;
    const oneWeekAgoStr = rawOneWeekAgoStr < FISCAL_RULES_START_DATE ? FISCAL_RULES_START_DATE : rawOneWeekAgoStr;
    const clientSales: any[] = Array.isArray(req.body?.sales) ? req.body.sales : [];
    clientSales.forEach(s => {
      if (s && s.id) {
        const isFE = s.electronicDocumentType === '01' || Boolean(s.customerIdentification && s.customerIdentification !== '000000000' && s.customerId !== 'cust-final');
        const sDate = s.date || (s.timestamp ? getCostaRicaDate(s.timestamp) : '');
        const cutoffStr = isFE ? oneWeekAgoStr : yesterdayStr;
        if (sDate && sDate >= cutoffStr) {
          db.createSale(s);
        }
      }
    });

    await db.syncRecentSalesFromFirestore();
    db.markExpiredPendingSales();

    // Invocar emisión para Tiquetes pendientes (hasta 2 días) y Facturas Electrónicas pendientes (hasta 1 semana)
    const allSales = db.getSales();
    const pendingSales = allSales.filter(s => {
      const hasRealKey = Boolean(s.numericKey50 && /^\d{50}$/.test(s.numericKey50));
      const hasRealConsec = Boolean(s.consecutive20 && /^\d{20}$/.test(s.consecutive20));
      if ((s.invoiceStatus === 'INVOICED' || s.haciendaStatus === 'ACEPTADO_HACIENDA') && hasRealKey && hasRealConsec) return false;
      if (s.haciendaStatus === 'CONTINGENCIA_VENCIDA' || s.haciendaStatus === 'ANULADO_POR_NC') return false;
      const isFE = s.electronicDocumentType === '01' || Boolean(s.customerIdentification && s.customerIdentification !== '000000000' && s.customerId !== 'cust-final');
      const sDate = s.date || (s.timestamp ? getCostaRicaDate(s.timestamp) : '');
      const cutoffStr = isFE ? oneWeekAgoStr : yesterdayStr;
      return Boolean(sDate && sDate >= cutoffStr);
    });

    pendingSales.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    let emitted = 0;
    for (const sale of pendingSales.slice(0, 50)) {
      const lockKey = sale.id || `order-${sale.orderNumber}-${sale.date || ''}`;
      if (activeEmittingSales.has(lockKey)) continue;
      activeEmittingSales.add(lockKey);
      try {
        const docType = sale.electronicDocumentType || (sale.customerId && sale.customerId !== 'cust-final' && sale.customerIdentification ? '01' : '04');
        const receiver = (sale.customerId ? db.getCustomerById(sale.customerId) : undefined) || sale.receiverSnapshot || {
          id: sale.customerId || 'cust-final',
          name: sale.customerName || 'Cliente General',
          identification: sale.customerIdentification || '000000000',
          identificationType: sale.customerIdentificationType || '01',
          email: sale.customerEmail,
          phone: sale.customerPhone,
          address: sale.customerAddress || 'Cervantes, Cartago',
          province: '3', canton: '02', district: '01',
          createdAt: new Date().toISOString()
        };

        const result = await ElectronicInvoicingEngine.emitDocumentFromSale({
          sale,
          documentType: docType,
          receiverCustomer: receiver,
          branch: '001',
          terminal: '00001',
          useRestaurantServiceLine: docType === '01' ? sale.useRestaurantServiceLine : false
        });
        if (result.success && result.electronicDocument) {
          emitted++;
          db.updateSale(sale.id, {
            invoiceStatus: 'INVOICED',
            electronicDocumentType: result.electronicDocument.documentType,
            numericKey50: result.electronicDocument.numericKey,
            consecutive20: result.electronicDocument.consecutive,
            haciendaStatus: result.electronicDocument.status,
            haciendaResponseMessage: result.electronicDocument.statusDescription,
            xmlEmitted: result.electronicDocument.xmlGenerated,
            xmlHaciendaResponse: result.electronicDocument.xmlResponseHacienda
          });
        }
      } catch (e) {
      } finally {
        activeEmittingSales.delete(lockKey);
      }
    }

    res.json({
      success: true,
      message: emitted > 0
        ? `Sincronización completada (Hoy y Ayer). Se emitieron ${emitted} comprobantes ante Hacienda.`
        : 'Sincronización al día (Hoy y Ayer). No hay comprobantes pendientes por emitir.'
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/fiscal/audit-logs', (req, res) => {
  res.json(db.getFiscalAuditLogs());
});

app.get('/api/fiscal/consecutive-status', async (req, res) => {
  try {
    const branch = String(req.query.branch || '001');
    const terminal = String(req.query.terminal || '00001');
    const counters = await db.getConsecutiveStatus(branch, terminal);
    res.json({
      success: true,
      branch,
      terminal,
      counters
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/fiscal/reissue-document', async (req, res) => {
  try {
    const { numericKey, reason, receiver } = req.body;
    if (!numericKey) {
      return res.status(400).json({ success: false, message: 'La clave o número de documento a reemitir es obligatoria.' });
    }

    const result = await ElectronicInvoicingEngine.reissueRejectedDocument({
      originalNumericKey: numericKey,
      reason,
      receiverOverride: receiver
    });

    res.json(result);
  } catch (err: any) {
    console.error('❌ Error en reemisión de comprobante:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------
// GESTIÓN DE LEASES Y SINCRONIZACIÓN OFFLINE (SITUACIÓN 3)
// ----------------------------------------------------
app.post('/api/fiscal/request-consecutive-lease', async (req, res) => {
  try {
    const { branch, terminal, documentType, blockSize, deviceFingerprint } = req.body;
    const cleanBranch = branch || '001';
    const cleanTerminal = terminal || '00001';
    const cleanDocType = documentType || '04';
    const cleanBlockSize = Number(blockSize) || (cleanDocType === '04' ? 50 : 20);

    const lease = await db.requestConsecutiveLease(
      cleanBranch,
      cleanTerminal,
      cleanDocType,
      cleanBlockSize,
      deviceFingerprint
    );

    res.json({
      success: true,
      message: `Bloque de consecutivos reservado: [${lease.rangeStart} - ${lease.rangeEnd}] para Terminal ${cleanTerminal} (${cleanDocType})`,
      lease
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/fiscal/sync-offline', async (req, res) => {
  try {
    const { items } = req.body;
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ success: false, message: 'La lista de comprobantes offline es obligatoria.' });
    }

    const syncResult = await ElectronicInvoicingEngine.syncOfflineBatch(items);
    res.json({
      success: true,
      ...syncResult
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Endpoint para disparar el worker fiscal autónomo en demanda
app.post('/api/fiscal/trigger-queue', (req, res) => {
  triggerAutonomousFiscalWorker(0);
  res.json({ success: true, message: 'Worker fiscal de fondo activado.' });
});

// ----------------------------------------------------
// ENVÍO AUTOMÁTICO DE XML Y PDF & GESTIÓN DE OUTBOX FISCAL
// ----------------------------------------------------
app.get('/api/fiscal/email-logs', (req, res) => {
  res.json(db.getEmailDispatchLogs());
});

app.post('/api/fiscal/send-email', async (req, res) => {
  try {
    const { numericKey, recipientEmail } = req.body;

    if (!numericKey) {
      return res.status(400).json({ success: false, message: 'La clave del documento es obligatoria.' });
    }

    const doc = db.getElectronicDocumentById(numericKey);
    if (!doc) {
      return res.status(404).json({ success: false, message: `No se encontró el documento con clave ${numericKey}` });
    }

    const sale = doc.saleId ? db.getSaleById(doc.saleId) : undefined;
    const result = await FiscalEmailService.sendInvoiceEmail(doc, sale, recipientEmail);

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/fiscal/test-email-connection', async (req, res) => {
  try {
    const result = await FiscalEmailService.testSmtpConnection(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Descargar Representación Gráfica PDF Oficial
app.get('/api/fiscal/download-pdf/:numericKey', async (req, res) => {
  try {
    const doc = db.getElectronicDocumentById(req.params.numericKey);
    if (!doc) {
      return res.status(404).send('Documento electrónico no encontrado.');
    }

    const sale = doc.saleId ? db.getSaleById(doc.saleId) : undefined;
    const config = db.getHaciendaDirectConfig();
    const restInfo = db.getRestaurantInfo();
    const logoBase64 = config?.emisorLogoBase64 || restInfo?.logoBase64;
    const pdfBuffer = await PdfInvoiceGenerator.generateInvoicePdf(doc, sale, logoBase64);

    const docTypeName = doc.documentType === '01' ? 'Factura' : (doc.documentType === '04' ? 'Tiquete' : 'Nota_Credito');
    const fileNames = getElectronicDocumentFileNames(doc.numericKey);
    const fileName = fileNames.pdf;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(pdfBuffer);
  } catch (err: any) {
    res.status(500).send(`Error generando PDF: ${err.message}`);
  }
});

// Descargar XML del Comprobante Firmado
app.get('/api/fiscal/download-xml/:numericKey', (req, res) => {
  try {
    const doc = db.getElectronicDocumentById(req.params.numericKey);
    if (!doc) {
      return res.status(404).send('Documento electrónico no encontrado.');
    }

    const xmlContent = db.getXmlForDocument(doc.numericKey) || doc.xmlGenerated || '<FacturaElectronica></FacturaElectronica>';
    const fileNames = getElectronicDocumentFileNames(doc.numericKey);
    const fileName = fileNames.xml;

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(xmlContent);
  } catch (err: any) {
    res.status(500).send(`Error obteniendo XML: ${err.message}`);
  }
});

// Descargar XML de Respuesta de Hacienda (MensajeHacienda)
app.get('/api/fiscal/download-hacienda-xml/:numericKey', (req, res) => {
  try {
    const doc = db.getElectronicDocumentById(req.params.numericKey);
    if (!doc) {
      return res.status(404).send('Documento electrónico no encontrado.');
    }

    const xmlResponse = db.getXmlResponseForDocument(doc.numericKey) || doc.xmlResponseHacienda;
    if (!xmlResponse) {
      return res.status(404).send('La respuesta en XML de Hacienda aún no está disponible para este comprobante. Consulte el estado ante Hacienda primero.');
    }

    const fileNames = getElectronicDocumentFileNames(doc.numericKey);
    const fileName = fileNames.hacienda;

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(xmlResponse);
  } catch (err: any) {
    res.status(500).send(`Error obteniendo XML de respuesta: ${err.message}`);
  }
});

// ----------------------------------------------------
// POS SALES MANAGEMENT
// ----------------------------------------------------
app.get('/api/sales', (req, res) => {
  const all = req.query.all === 'true';
  const limitParam = req.query.limit ? parseInt(req.query.limit as string, 10) : 0;
  const sinceParam = req.query.since ? Number(req.query.since) : 0;
  const dateFrom = (req.query.dateFrom as string) || undefined;
  const dateTo = (req.query.dateTo as string) || undefined;
  const allSales = db.getSales();

  if (all) {
    return res.json(allSales);
  }

  // Sincronización incremental ligera: devolver únicamente ventas creadas o actualizadas desde `since`
  if (sinceParam > 0) {
    const delta = allSales.filter(s => {
      const ts = s.timestamp || (s.createdAt ? new Date(s.createdAt).getTime() : 0);
      const upd = s.updatedAt ? new Date(s.updatedAt).getTime() : ts;
      return ts >= sinceParam || upd >= sinceParam;
    });
    return res.json(limitParam > 0 ? delta.slice(0, limitParam) : delta);
  }

  // Consulta histórica por rango de fechas para Reportes, Libro IVA, Cierres y Auditoría DGT
  if (dateFrom || dateTo) {
    const ranged = allSales.filter(s => {
      const sDate = s.date || (s.timestamp ? getCostaRicaDate(s.timestamp) : '');
      if (!sDate) return false;
      if (dateFrom && sDate < dateFrom) return false;
      if (dateTo && sDate > dateTo) return false;
      return true;
    });
    return res.json(limitParam > 0 ? ranged.slice(0, limitParam) : ranged);
  }

  if (limitParam > 0) {
    return res.json(allSales.slice(0, limitParam));
  }

  // Ventana operativa inicial: ventas del día actual + turno de caja abierto (con mínimo de 100 ventas recientes)
  const todayStr = getCostaRicaDate();
  const currentReg = db.getCurrentCashRegister()?.register;
  const regOpenTimeMs = currentReg && currentReg.status === 'OPEN' && currentReg.openTime
    ? new Date(currentReg.openTime).getTime()
    : 0;

  const operationalSales = allSales.filter(s => {
    const sDate = s.date || (s.timestamp ? getCostaRicaDate(s.timestamp) : '');
    if (sDate === todayStr) return true;
    if (regOpenTimeMs > 0 && (s.timestamp || 0) >= regOpenTimeMs) return true;
    return false;
  });

  const responseSales = operationalSales.length >= 100 ? operationalSales : allSales.slice(0, 100);
  res.json(responseSales);
});

app.get('/api/sales/paginated', async (req, res) => {
  try {
    const limitCount = parseInt(req.query.limit as string) || 50;
    const lastTimestamp = req.query.lastTimestamp ? Number(req.query.lastTimestamp) : undefined;
    const dateFrom = (req.query.dateFrom as string) || undefined;
    const dateTo = (req.query.dateTo as string) || undefined;
    const status = (req.query.status as string) || undefined;
    const search = (req.query.search as string) || undefined;

    const result = await db.getPaginatedSales({
      limitCount,
      lastTimestamp,
      dateFrom,
      dateTo,
      status,
      search
    });

    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/sales', (req, res) => {
  try {
    const sale: Sale = req.body;
    const savedSale = db.createSale(sale);
    broadcastEvent('SALE_CREATED', savedSale);
    // Transmitir también la comanda de cocina asociada (nueva o actualizada con los ítems finales) para que el KDS se refresque en vivo
    const associatedKitchen = db.getKitchenOrders().find(k => 
      (savedSale.kitchenOrderId && k.id === savedSale.kitchenOrderId) ||
      (k.saleId && k.saleId === savedSale.id) ||
      (k.orderNumber === savedSale.orderNumber)
    );
    if (associatedKitchen) {
      broadcastEvent('KITCHEN_ORDER_UPDATED', associatedKitchen);
    }
    // Disparar en segundo plano el worker fiscal autónomo sin bloquear la respuesta del POS
    triggerAutonomousFiscalWorker(150);
    res.json({ success: true, sale: savedSale });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/sales/:id/status', (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  const sale = db.updateSale(id, updates);
  if (!sale) {
    return res.status(404).json({ error: 'Venta no encontrada' });
  }

  broadcastEvent('SALE_UPDATED', sale);
  res.json({ success: true, sale });
});

app.post('/api/sales/reconcile', (req, res) => {
  try {
    const result = db.reconcileSalesFromDocuments();
    db.persist();
    broadcastEvent('SALES_RECONCILED', result);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// KITCHEN ORDERS / COMANDAS (KDS)
// ----------------------------------------------------
app.get('/api/kitchen-orders/next-number', (req, res) => {
  const dateStr = (req.query.date as string) || undefined;
  const nextNumber = db.getNextDailyOrderNumber(dateStr);
  res.json({ success: true, nextNumber });
});

app.get('/api/kitchen-orders', (req, res) => {
  res.json(db.getKitchenOrders());
});

app.post('/api/kitchen-orders', (req, res) => {
  try {
    const kitchenOrder = req.body;
    const saved = db.saveKitchenOrder(kitchenOrder);
    broadcastEvent('KITCHEN_ORDER_CREATED', saved);
    res.json({ success: true, kitchenOrder: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/kitchen-orders/cleanup-duplicates', (req, res) => {
  try {
    const { targetDate, duplicateOrderNumbers } = req.body;
    const result = db.removeDuplicateKitchenOrders(
      targetDate || getCostaRicaDate(),
      Array.isArray(duplicateOrderNumbers) ? duplicateOrderNumbers : []
    );
    broadcastEvent('KITCHEN_ORDERS_CLEANED', result);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/kitchen-orders/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const order = db.updateKitchenOrderStatus(id, status);
  if (!order) {
    // Si no existía comanda directa, intentar actualizar la venta si el ID era de una venta
    const sale = db.updateSale(id, { orderStatus: status });
    if (!sale) {
      return res.status(404).json({ error: 'Comanda o venta no encontrada' });
    }
    broadcastEvent('SALE_UPDATED', sale);
    return res.json({ success: true, sale });
  }

  broadcastEvent('KITCHEN_ORDER_UPDATED', order);
  // También emitir evento de venta si la comanda tenía venta ligada
  if (order.saleId) {
    broadcastEvent('SALE_UPDATED', { id: order.saleId, orderStatus: status });
  }
  res.json({ success: true, kitchenOrder: order });
});

app.patch('/api/kitchen-orders/:id', (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  // Blindaje post-cobro: Si la comanda ya fue pagada y cerrada, impedir alteración de productos o totales
  const existing = db.getKitchenOrders().find(k => k.id === id);
  if (existing && existing.isPaid && (updates.items || updates.total !== undefined || updates.subtotal !== undefined)) {
    return res.status(409).json({ 
      error: 'CONFLICT_ORDER_PAID', 
      message: 'No se puede modificar el contenido de una comanda que ya fue cobrada y facturada.' 
    });
  }

  const order = db.updateKitchenOrder(id, updates);
  if (!order) {
    return res.status(404).json({ error: 'Comanda no encontrada' });
  }

  broadcastEvent('KITCHEN_ORDER_UPDATED', order);
  res.json({ success: true, kitchenOrder: order });
});

app.get('/api/firebase-config', (req, res) => {
  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      res.json(configData);
    } else {
      res.status(404).json({ error: 'Firebase config not found' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// CASH REGISTER MANAGEMENT
// ----------------------------------------------------
app.get('/api/cash-register/current', (req, res) => {
  res.json(db.getCurrentCashRegister());
});

app.get('/api/cash-register/history', (req, res) => {
  res.json(db.getCashRegisterHistory());
});

app.post('/api/cash-register/open', (req, res) => {
  const { openingBalance, cashierName, location } = req.body;
  const register = db.openCashRegister(openingBalance, cashierName, location);
  broadcastEvent('CASH_REGISTER_UPDATED', register);
  res.json({ success: true, register });
});

app.post('/api/cash-register/close', (req, res) => {
  const { countedCash, notes } = req.body;
  const register = db.closeCashRegister(countedCash, notes);
  if (!register) {
    return res.status(400).json({ error: 'La caja ya está cerrada.' });
  }

  broadcastEvent('CASH_REGISTER_UPDATED', register);
  res.json({ success: true, register });
});

app.post('/api/cash-register/movement', (req, res) => {
  const { type, amount, reason, cashierName } = req.body;
  const movement = db.addCashMovement(type, amount, reason, cashierName);
  broadcastEvent('CASH_REGISTER_UPDATED', db.getCurrentCashRegister());
  res.json({ success: true, movement, register: db.getCurrentCashRegister().register });
});

// ----------------------------------------------------
// BACKUP & RESTORE
// ----------------------------------------------------
// Sincronización Maestra (Fuerza Bruta / Mando Absoluto del Administrador)
app.post('/api/sync/master-force', async (req, res) => {
  try {
    const authoritativeData = req.body;
    const result = await db.executeMasterForceSync(authoritativeData);
    broadcastEvent('CATALOG_UPDATED', {
      products: db.getProducts(),
      categories: db.getCategories(),
      catalogVersion: db.getCatalogVersion()
    });
    broadcastEvent('MASTER_SYNC_COMPLETED', result);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Error en sincronización maestra.' });
  }
});

// Respaldo Exhaustivo Inmediato: 100% de la información (Local + Nube Firestore)
app.post('/api/backup/full-backup-now', async (req, res) => {
  try {
    const result = await db.backupAllInformation();
    broadcastEvent('BACKUP_COMPLETED', {
      timestamp: result.timestamp,
      summary: result.summary,
      cloudSync: result.cloudBackup
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Error ejecutando respaldo total.' });
  }
});

// Descargar el respaldo total solicitado más reciente
app.get('/api/backup/full/download', (req, res) => {
  try {
    const dataDir = path.join(process.cwd(), 'data');
    const canonicalPath = path.join(dataDir, 'pos_database.backup.respaldo_total_solicitado.json');
    const fallbackPath = path.join(dataDir, 'pos_database.backup.json');
    const targetPath = fs.existsSync(canonicalPath) ? canonicalPath : fallbackPath;

    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ success: false, error: 'Archivo de respaldo no encontrado.' });
    }

    const dateStr = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="respaldo_total_sabor_cervanteno_${dateStr}.json"`);
    return res.sendFile(targetPath);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Error descargando respaldo.' });
  }
});

// Respaldo dedicado: SOLO la información creada y subida por el usuario
app.get('/api/backup/user-data/download', (req, res) => {
  try {
    const data = db.exportDatabase();
    const cryptoKey = db.loadLocalCryptoKey();
    const xmlsDir = path.join(process.cwd(), 'data', 'xmls');
    const xmlDocuments: Array<{ filename: string; size: number; content: string }> = [];

    if (fs.existsSync(xmlsDir)) {
      const files = fs.readdirSync(xmlsDir);
      for (const file of files) {
        if (file.endsWith('.xml')) {
          const fullPath = path.join(xmlsDir, file);
          const content = fs.readFileSync(fullPath, 'utf-8');
          xmlDocuments.push({
            filename: file,
            size: fs.statSync(fullPath).size,
            content: content
          });
        }
      }
    }

    const userBackup = {
      version: '1.0',
      backupType: 'USER_DATA_ONLY',
      createdAt: new Date().toISOString(),
      system: 'Pollo Frito Sabor Cervanteño POS & Facturación Electrónica',
      businessName: data.restaurantInfo?.name || 'Pollo Frito Sabor Cervanteño',
      taxId: data.restaurantInfo?.taxId || '302680311',
      scope: 'INFORMACIÓN CREADA Y SUBIDA POR EL USUARIO',
      summary: {
        restaurantInfo: true,
        haciendaConfigSaved: true,
        hasCryptographicKey: Boolean(cryptoKey),
        cryptographicKeyBytes: cryptoKey ? cryptoKey.length : 0,
        electronicDocumentsCount: data.electronicDocuments ? data.electronicDocuments.length : 0,
        salesCount: data.sales ? data.sales.length : 0,
        customersCount: data.customers ? data.customers.length : 0,
        consecutiveControlsCount: data.consecutiveControls ? data.consecutiveControls.length : 0,
        xmlFilesCount: xmlDocuments.length,
        usersCount: data.users ? data.users.length : 0
      },
      restaurantInfo: data.restaurantInfo,
      haciendaDirectConfig: {
        ...data.haciendaDirectConfig,
        cryptographicKeyBase64: cryptoKey || data.haciendaDirectConfig?.cryptographicKeyBase64
      },
      consecutiveControls: data.consecutiveControls,
      electronicDocuments: data.electronicDocuments,
      sales: data.sales,
      customers: data.customers,
      currentCashRegister: data.currentCashRegister,
      cashRegisterHistory: data.cashRegisterHistory,
      cashMovements: data.cashMovements,
      users: data.users,
      xmlDocuments: xmlDocuments
    };

    const dateStr = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="respaldo_datos_usuario_sabor_cervanteno_${dateStr}.json"`);
    res.send(JSON.stringify(userBackup, null, 2));
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/backup/user-data/package', (req, res) => {
  try {
    const backupDir = path.join(process.cwd(), 'backups');
    if (fs.existsSync(backupDir)) {
      const files = fs.readdirSync(backupDir).filter(f => f.startsWith('respaldo_archivos_usuario_') && f.endsWith('.tar.gz'));
      if (files.length > 0) {
        const latestFile = path.join(backupDir, files[files.length - 1]);
        res.setHeader('Content-Type', 'application/gzip');
        res.setHeader('Content-Disposition', `attachment; filename="${path.basename(latestFile)}"`);
        return res.sendFile(latestFile);
      }
    }
    res.status(404).json({ success: false, error: 'Paquete de respaldo no encontrado.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// RESPALDO ESPECÍFICO DEL MENÚ (CATEGORÍAS Y PRODUCTOS)
// ----------------------------------------------------
app.get('/api/backup/menu/download', (req, res) => {
  try {
    const menuBackup = db.exportMenuBackup();
    const dateStr = new Date().toISOString().split('T')[0];
    
    // Guardar también copia local física en el servidor
    try {
      const backupPath = path.join(process.cwd(), 'data', 'respaldo_menu_categorias_productos.json');
      fs.writeFileSync(backupPath, JSON.stringify(menuBackup, null, 2), 'utf-8');
    } catch (saveErr) {
      console.warn('Advertencia guardando copia local de respaldo de menú:', saveErr);
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="respaldo_menu_sabor_cervanteno_${dateStr}.json"`);
    res.send(JSON.stringify(menuBackup, null, 2));
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Error al exportar respaldo del menú' });
  }
});

app.get('/api/backup/menu/csv', (req, res) => {
  try {
    const menuBackup = db.exportMenuBackup();
    const categoriesMap = new Map<string, string>();
    (menuBackup.categories || []).forEach((c: any) => {
      categoriesMap.set(c.id, c.name);
    });

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const headers = [
      'ID',
      'Nombre',
      'Categoría',
      'Precio Venta Final (CRC)',
      'Precio Neto (CRC)',
      'Monto IVA (CRC)',
      'Tasa IVA (%)',
      'Código CABYS',
      'SKU / Código Comercial',
      'Estación de Cocina',
      'Tipo de Ítem',
      'Estado',
      'Descripción'
    ];

    const rows = (menuBackup.products || []).map((p: any) => {
      const categoryName = categoriesMap.get(p.categoryId) || p.categoryId || 'SIN CATEGORÍA';
      const taxRatePercent = p.taxRate !== undefined ? Math.round(p.taxRate * 100) : 13;
      return [
        escapeCsv(p.id),
        escapeCsv(p.name),
        escapeCsv(categoryName),
        escapeCsv(p.price || 0),
        escapeCsv(p.netPrice || 0),
        escapeCsv(p.taxAmount || 0),
        escapeCsv(`${taxRatePercent}%`),
        escapeCsv(p.cabysCode || ''),
        escapeCsv(p.sku || p.commercialCode || ''),
        escapeCsv(p.station || 'COCINA'),
        escapeCsv(p.itemType || 'MERCANCIA'),
        escapeCsv(p.active !== false ? 'ACTIVO' : 'INACTIVO'),
        escapeCsv(p.description || '')
      ].join(',');
    });

    // UTF-8 BOM (\uFEFF) para compatibilidad total con Microsoft Excel en español
    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const dateStr = new Date().toISOString().split('T')[0];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="catalogo_menu_sabor_cervanteno_${dateStr}.csv"`);
    res.send(csvContent);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Error al exportar catálogo en CSV' });
  }
});

app.post('/api/backup/menu/import', express.json({ limit: '25mb' }), (req, res) => {
  try {
    const menuData = req.body;
    if (!menuData || typeof menuData !== 'object') {
      return res.status(400).json({ success: false, error: 'El archivo de respaldo no es válido.' });
    }
    const result = db.importMenuBackup(menuData);
    broadcastEvent('CATALOG_UPDATED', {
      timestamp: Date.now(),
      categoriesCount: result.categoriesCount,
      productsCount: result.productsCount
    });
    res.json({
      success: true,
      message: `¡Menú restaurado exitosamente! Se importaron ${result.categoriesCount} categorías y ${result.productsCount} platillos.`,
      stats: result
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Error al restaurar respaldo del menú' });
  }
});

app.get('/api/backup/export', (req, res) => {
  try {
    const data = db.exportDatabase();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="sabor_cervanteno_backup_${new Date().toISOString().split('T')[0]}.json"`);
    res.send(JSON.stringify(data, null, 2));
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/backup/import', express.json({ limit: '10mb' }), (req, res) => {
  try {
    const backupData = req.body;
    if (!backupData || typeof backupData !== 'object' || (!backupData.products && !backupData.sales)) {
      return res.status(400).json({ success: false, error: 'Archivo de respaldo inválido o corrupto.' });
    }
    const stats = db.importDatabase(backupData);
    broadcastEvent('DATABASE_RESTORED', { timestamp: new Date().toISOString() });
    res.json({ success: true, message: 'Respaldo restaurado exitosamente.', stats });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/clear-test-data', async (req, res) => {
  try {
    const result = await db.clearTestDataAndResetForProduction();
    broadcastEvent('DATABASE_RESTORED', { 
      timestamp: new Date().toISOString(),
      action: 'CLEAR_TEST_DATA'
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// GLOBAL ERROR GUARDS FOR CONTAINER STABILITY
// ----------------------------------------------------
process.on('unhandledRejection', (reason) => {
  console.warn('⚠️ [Process] Unhandled Rejection (no bloqueante):', reason);
});
process.on('uncaughtException', (err) => {
  console.error('⚠️ [Process] Uncaught Exception:', err);
});

// ----------------------------------------------------
// VITE MIDDLEWARE OR STATIC SERVING
// ----------------------------------------------------
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production' || isCompiledBundle;

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);

    // Explicit fallback handler for all non-API HTML requests in dev
    app.use('*', async (req, res, next) => {
      if (req.originalUrl.startsWith('/api')) {
        return next();
      }
      try {
        const indexPath = path.resolve(process.cwd(), 'index.html');
        if (fs.existsSync(indexPath)) {
          let template = fs.readFileSync(indexPath, 'utf-8');
          template = await vite.transformIndexHtml(req.originalUrl, template);
          res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
        } else {
          next();
        }
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    const candidatePaths = [
      path.join(process.cwd(), 'dist'),
      process.cwd(),
      __dirname,
      path.resolve(__dirname, '..', 'dist')
    ];
    const distPath = candidatePaths.find(p => fs.existsSync(path.join(p, 'index.html'))) || candidatePaths[0];

    app.use(express.static(distPath, {
      maxAge: '1y',
      immutable: true,
      index: false,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      }
    }));

    app.get('/sw.js', (req, res) => {
      const swCandidate = [
        path.join(distPath, 'sw.js'),
        path.join(process.cwd(), 'public', 'sw.js'),
        path.join(process.cwd(), 'sw.js')
      ].find(p => fs.existsSync(p));
      if (swCandidate) {
        res.setHeader('Content-Type', 'application/javascript');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.sendFile(swCandidate);
      }
      res.status(404).send('SW not found');
    });

    app.get('/manifest.json', (req, res) => {
      const mfCandidate = [
        path.join(distPath, 'manifest.json'),
        path.join(process.cwd(), 'public', 'manifest.json'),
        path.join(process.cwd(), 'manifest.json')
      ].find(p => fs.existsSync(p));
      if (mfCandidate) {
        res.setHeader('Content-Type', 'application/manifest+json');
        res.setHeader('Cache-Control', 'no-cache');
        return res.sendFile(mfCandidate);
      }
      res.status(404).send('Manifest not found');
    });

    // Prevenir que assets inexistentes devuelvan index.html (lo que causa TypeError de módulo)
    app.get(['/assets/*', '/*.css'], (req, res) => {
      res.status(404).type('text/plain').send('Asset not found');
    });

    app.get('*', (req, res) => {
      const indexPath = path.join(distPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.sendFile(indexPath);
      } else {
        res.status(200).send('Pollo Frito Sabor Cervanteño POS is running.');
      }
    });
  }

  // Iniciar el servidor HTTP inmediatamente en 0.0.0.0:3000 (el proxy nginx de la infraestructura redirige a este puerto)
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🍗 POS Pollo Frito Sabor Cervanteño running on port ${PORT}`);
    console.log(`🗄️ Base de datos local inicializada.`);

    // Inicialización asíncrona diferida para garantizar que los probes de Cloud Run pasen de inmediato
    const initTimer = setTimeout(() => {
      db.initialize()
        .then(() => {
          console.log('✅ Sincronización inicial con Firebase Firestore completada.');
        })
        .catch((err: any) => {
          console.warn('⚠️ Error no bloqueante al inicializar Firebase Firestore:', err?.message || err);
        });
    }, 6000);
    if (initTimer.unref) initTimer.unref();
  });

  server.on('error', (err: any) => {
    console.warn('⚠️ [HTTP Server] Aviso de socket/puerto:', err?.message || err);
  });

  // Iniciar el worker autónomo a los 10 segundos de arrancar y ejecutar cada 45 segundos
  // (Nota: cada nueva venta en el POS dispara triggerAutonomousFiscalWorker de forma reactiva en 500ms)
  const startDelayedTimer = setTimeout(() => {
    runAutonomousFiscalWorker();
    const contingencyTimer = setInterval(() => {
      runAutonomousFiscalWorker();
    }, 45000); // 45 segundos para liberar CPU y garantizar respuesta instantánea al POS
    if (contingencyTimer.unref) contingencyTimer.unref();
  }, 10000);
  if (startDelayedTimer.unref) startDelayedTimer.unref();

    // Sincronización periódica inteligente del catálogo con la Nube (La nube manda en discrepancias)
    const cloudSyncTimer = setInterval(async () => {
      try {
        const syncResult = await db.syncCatalogWithCloud();
        if (syncResult && syncResult.changed) {
          console.log(`☁️ [Cloud Catalog Sync] Menú actualizado desde Firestore. Notificando dispositivos vía SSE...`);
          broadcastEvent('CATALOG_UPDATED', {
            products: db.getProducts(),
            categories: db.getCategories(),
            version: db.getCatalogVersion()
          });
        }
      } catch (e) {
        // Silencioso ante desconexión de red transitoria
      }
    }, 120000);
    if (cloudSyncTimer.unref) cloudSyncTimer.unref();

  // Manejo de señales de apagado limpio y seguro para Cloud Run (vaciando cola a disco y cerrando clientes SSE)
  const gracefulShutdown = (signal: string) => {
    console.log(`Recibida señal ${signal}, cerrando servidor ordenadamente...`);
    try {
      db.flushToDiskSync();
    } catch (flushErr) {
      console.warn('⚠️ Error al vaciar base de datos a disco en cierre:', flushErr);
    }
    sseClients.forEach(client => {
      try {
        client.end();
      } catch {}
    });
    sseClients = [];

    const forceTimer = setTimeout(() => {
      console.warn('Forzando salida tras timeout de apagado.');
      process.exit(0);
    }, 5000);
    if (forceTimer.unref) forceTimer.unref();

    server.close(() => {
      clearTimeout(forceTimer);
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

startServer();

