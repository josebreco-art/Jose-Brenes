import forge from 'node-forge';
import { DOMParser } from '@xmldom/xmldom';
import { XmlSignerService } from '../src/server/xmlSigner';
import { HaciendaXmlGenerator } from '../src/server/xmlGenerator';
import { ElectronicDocument, PaymentMethodType, Sale } from '../src/types/pos';
import { INITIAL_PRODUCTS } from '../src/data/initialData';

console.log('================================================================');
console.log('🏛️ VERIFICACIÓN INTEGRAL DE CUMPLIMIENTO DGT V4.4 - COSTA RICA');
console.log('   AUDITORÍA PRE-CONEXIÓN SANDBOX MINISTERIO DE HACIENDA');
console.log('================================================================\n');

// 1. GENERACIÓN DE CERTIFICADO DE PRUEBA X.509 + RSA 2048 (SIMULADOR ATV SANDBOX)
const keys = forge.pki.rsa.generateKeyPair(2048);
const cert = forge.pki.createCertificate();
cert.publicKey = keys.publicKey;
cert.serialNumber = '01';
cert.validity.notBefore = new Date();
cert.validity.notAfter = new Date();
cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 2);
const attrs = [
  { name: 'countryName', value: 'CR' },
  { name: 'organizationName', value: 'BANCO CENTRAL DE COSTA RICA' },
  { name: 'organizationalUnitName', value: 'CA SINPE - PERSONA JURIDICA' },
  { name: 'commonName', value: 'Pollo Frito Sabor Cervanteno S.A.' }
];
cert.setSubject(attrs);
cert.setIssuer(attrs);
cert.sign(keys.privateKey, forge.md.sha256.create());

const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], '1234', {
  generateLocalKeyId: true,
  friendlyName: 'Llave Criptografica Sandbox'
});
const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
const p12Base64 = forge.util.encode64(p12Der);
const publicKeyPem = forge.pki.publicKeyToPem(keys.publicKey);

// -----------------------------------------------------------------------------------------
// PROBLEMA 1 & 4: AUDITORÍA DE MEDIOS DE PAGO (CATÁLOGO OFICIAL HACIENDA V4.4)
// -----------------------------------------------------------------------------------------
console.log('----------------------------------------------------------------');
console.log('📋 PROBLEMA 1 & 4: AUDITORÍA DE MEDIOS DE PAGO V4.4');
console.log('----------------------------------------------------------------');

interface PaymentAudit {
  name: string;
  type: PaymentMethodType;
  expectedXmlCode: string;
  haciendaCode: string;
}

const paymentTestCatalog: PaymentAudit[] = [
  { name: 'Efectivo', type: 'CASH', expectedXmlCode: '01', haciendaCode: '01' },
  { name: 'Tarjeta', type: 'CARD', expectedXmlCode: '02', haciendaCode: '02' },
  { name: 'Cheque', type: 'CHECK', expectedXmlCode: '03', haciendaCode: '03' },
  { name: 'Transferencia / depósito bancario', type: 'TRANSFER', expectedXmlCode: '04', haciendaCode: '04' },
  { name: 'Recaudado por terceros', type: 'THIRD_PARTY', expectedXmlCode: '05', haciendaCode: '05' },
  { name: 'SINPE Móvil', type: 'SINPE', expectedXmlCode: '06', haciendaCode: '06' },
  { name: 'Plataforma Digital', type: 'DIGITAL_PLATFORM', expectedXmlCode: '07', haciendaCode: '07' },
  { name: 'Otros', type: 'OTHER', expectedXmlCode: '99', haciendaCode: '99' }
];

console.log('| Medio                  | Código XML | Código Hacienda | Resultado |');
console.log('| ---------------------- | ---------: | --------------: | --------- |');

let paymentAuditSuccess = true;

for (const pm of paymentTestCatalog) {
  const dummyDoc: ElectronicDocument = {
    id: `doc-pm-${pm.type}`,
    saleId: 'sale-pm',
    documentType: '01',
    consecutive: '00100001010000000001',
    numericKey: '50617082600310198765400100001010000000001199999999',
    economicActivity: '561001',
    terminal: '00001',
    currency: 'CRC',
    saleCondition: '01',
    status: 'ACEPTADO_HACIENDA',
    issueDate: new Date().toISOString(),
    issuer: {
      name: 'Pollo Frito Sabor Cervanteño S.A.',
      commercialName: 'Pollo Frito Sabor Cervanteño',
      identificationType: '02',
      identificationNumber: '3101987654',
      phone: '25340000',
      email: 'factura@saborcervanteno.cr',
      province: '3',
      canton: '06',
      district: '01',
      address: 'Cervantes de Alvarado'
    },
    receiver: {
      name: 'Cliente Prueba',
      identificationType: '01',
      identificationNumber: '109870654',
      email: 'cliente@prueba.cr'
    },
    lines: [
      {
        lineNumber: 1,
        productId: 'prod-1',
        internalCode: 'SERV-01',
        cabysCode: '6331001000000',
        description: 'Servicio Restaurante',
        itemType: 'SERVICIO',
        unitOfMeasure: 'Os',
        quantity: 1,
        unitPrice: 1000,
        subtotal: 1000,
        discount: 0,
        taxCode: '01',
        taxRateCode: '08',
        taxRate: 0.13,
        taxAmount: 130,
        totalLine: 1130
      }
    ],
    subtotal: 1000,
    discountTotal: 0,
    taxTotal: 130,
    total: 1130,
    retryAttempts: 0,
    isContingency: false,
    createdBy: 'admin',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    paymentMethods: [
      { method: pm.type, amount: 1130 }
    ]
  };

  const xml = HaciendaXmlGenerator.generateDocumentXml(dummyDoc);
  const match = xml.match(/<MedioPago>(\d+)<\/MedioPago>/);
  const xmlCode = match ? match[1] : 'ERROR';
  const passed = (xmlCode === pm.expectedXmlCode && xmlCode === pm.haciendaCode);

  if (!passed) paymentAuditSuccess = false;

  const paddedName = pm.name.padEnd(22, ' ');
  const paddedXml = xmlCode.padStart(10, ' ');
  const paddedHac = pm.haciendaCode.padStart(15, ' ');
  const resText = passed ? 'PASS     ' : 'FAIL     ';
  console.log(`| ${paddedName} | ${paddedXml} | ${paddedHac} | ${resText} |`);
}

// -----------------------------------------------------------------------------------------
// PROBLEMA 3: PRUEBAS DE FIRMA DIGITAL XAdES-EPES (01, 04, 03, 02)
// -----------------------------------------------------------------------------------------
console.log('\n----------------------------------------------------------------');
console.log('🔐 PROBLEMA 3: PRUEBAS DE FIRMA DIGITAL XAdES-EPES POR TIPO DE DOCUMENTO');
console.log('----------------------------------------------------------------');

const docTypesToTest: Array<{ type: '01' | '04' | '03' | '02'; name: string }> = [
  { type: '01', name: 'Factura Electrónica (01)' },
  { type: '04', name: 'Tiquete Electrónico (04)' },
  { type: '03', name: 'Nota de Crédito (03)' },
  { type: '02', name: 'Nota de Débito (02)' }
];

let allDocsPass = true;

for (const dt of docTypesToTest) {
  console.log(`\n📌 Validando ${dt.name}...`);

  const doc: ElectronicDocument = {
    id: `doc-test-${dt.type}`,
    saleId: `sale-test-${dt.type}`,
    documentType: dt.type,
    consecutive: `00100001${dt.type}0000000001`,
    numericKey: `50617082600310198765400100001${dt.type}0000000001199999999`,
    economicActivity: '561001',
    terminal: '00001',
    currency: 'CRC',
    saleCondition: '01',
    status: 'ACEPTADO_HACIENDA',
    issueDate: new Date().toISOString(),
    issuer: {
      name: 'Pollo Frito Sabor Cervanteño S.A.',
      commercialName: 'Pollo Frito Sabor Cervanteño',
      identificationType: '02',
      identificationNumber: '3101987654',
      phone: '25340000',
      email: 'factura@saborcervanteno.cr',
      province: '3',
      canton: '06',
      district: '01',
      address: 'Cervantes de Alvarado'
    },
    receiver: dt.type === '04' ? undefined : {
      name: 'Compañía Receptora S.A.',
      identificationType: '02',
      identificationNumber: '3101112233',
      economicActivity: '561001',
      email: 'contabilidad@receptora.cr',
      province: '3',
      canton: '06',
      district: '01',
      address: 'Costado Norte de Iglesia'
    },
    reference: (dt.type === '03' || dt.type === '02') ? {
      documentType: '01',
      invoiceNumber: '50617082600310198765400100001010000000001199999999',
      numericKeyOrNumber: '50617082600310198765400100001010000000001199999999',
      issueDate: '2026-08-17T12:00:00.000Z',
      referenceCode: '01',
      code: '01',
      reason: 'Ajuste fiscal autorizado'
    } : undefined,
    lines: [
      {
        lineNumber: 1,
        productId: 'prod-item-1',
        internalCode: 'SERV-01',
        cabysCode: '6331001000000',
        description: 'Servicio de Restaurante',
        itemType: 'SERVICIO',
        unitOfMeasure: 'Os',
        quantity: 1,
        unitPrice: 2000,
        subtotal: 2000,
        discount: 0,
        taxCode: '01',
        taxRateCode: '08',
        taxRate: 0.13,
        taxAmount: 260,
        totalLine: 2260
      }
    ],
    subtotal: 2000,
    discountTotal: 0,
    taxTotal: 260,
    total: 2260,
    retryAttempts: 0,
    isContingency: false,
    createdBy: 'admin',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    paymentMethods: [
      { method: 'SINPE', amount: 2260 }
    ]
  };

  // 1. Generar XML
  const rawXml = HaciendaXmlGenerator.generateDocumentXml(doc);
  const xsdPass = rawXml.includes('xmlns="https://cdn.comprobanteselectronicos.go.cr/xmlschemas/') &&
                  rawXml.includes('<Clave>') &&
                  rawXml.includes('<NumeroConsecutivo>') &&
                  rawXml.includes('<ResumenFactura>');

  // 2. Firmar XML
  const signedXml = XmlSignerService.signXmlDocument(rawXml, '3101987654', p12Base64, '1234');

  const hasExcC14N = signedXml.includes('Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"');
  const hasXPath = signedXml.includes('not(ancestor-or-self::ds:Signature)');
  const hasEnveloped = signedXml.includes('Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"');
  const hasCert = signedXml.includes('<ds:X509Certificate>') && !signedXml.includes('<ds:X509Certificate></ds:X509Certificate>');
  const hasPolicy = signedXml.includes('<xades:SignaturePolicyIdentifier>');

  // 3. Verificación criptográfica con llave pública
  const verify = XmlSignerService.verifySignature(signedXml, publicKeyPem);

  console.log(`  * XSD Schema Structure:      ${xsdPass ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`  * Exclusive C14N:            ${hasExcC14N ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`  * XPath Transform:           ${hasXPath ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`  * Enveloped Signature:       ${hasEnveloped ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`  * Certificado X.509:         ${hasCert ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`  * Policy XML Node:           ${hasPolicy ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`  * Digest SignedProperties:   ${verify.signedPropsValid ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`  * SignatureValue RSA-SHA256: ${verify.signatureValid ? 'PASS ✅' : 'FAIL ❌'}`);

  if (!xsdPass || !hasExcC14N || !hasXPath || !hasCert || !hasPolicy || !verify.valid) {
    allDocsPass = false;
  }
}

// -----------------------------------------------------------------------------------------
// PROBLEMA 5: RESTAURANTE — PRUEBA DE LAS 5 VENTAS ESPECÍFICAS
// -----------------------------------------------------------------------------------------
console.log('\n----------------------------------------------------------------');
console.log('🍗 PROBLEMA 5: RESTAURANTE — PRUEBA DE LAS 5 VENTAS');
console.log('----------------------------------------------------------------');

interface RestaurantSaleTestCase {
  saleNum: number;
  description: string;
  productSku: string;
  productName: string;
  paymentMethod: PaymentMethodType;
  paymentLabel: string;
  expectedPaymentXml: string;
  unitPriceGross: number; // Precio con IVA incluido en el POS
}

const restaurantSalesTests: RestaurantSaleTestCase[] = [
  {
    saleNum: 1,
    description: 'Pollo frito + Efectivo',
    productSku: 'POL-001',
    productName: 'Pieza de Pollo Crujiente',
    paymentMethod: 'CASH',
    paymentLabel: 'Efectivo',
    expectedPaymentXml: '01',
    unitPriceGross: 1450
  },
  {
    saleNum: 2,
    description: 'Hamburguesa + Tarjeta',
    productSku: 'HAM-001',
    productName: 'Hamburguesa Pollo Crispy',
    paymentMethod: 'CARD',
    paymentLabel: 'Tarjeta',
    expectedPaymentXml: '02',
    unitPriceGross: 3600
  },
  {
    saleNum: 3,
    description: 'Tacos + SINPE Móvil',
    productSku: 'TAC-001',
    productName: 'Taco Tico Cervanteño',
    paymentMethod: 'SINPE',
    paymentLabel: 'SINPE Móvil',
    expectedPaymentXml: '06',
    unitPriceGross: 2100
  },
  {
    saleNum: 4,
    description: 'Empanadas + Transferencia',
    productSku: 'EMP-001',
    productName: 'Empanada de Pollo con Queso',
    paymentMethod: 'TRANSFER',
    paymentLabel: 'Transferencia',
    expectedPaymentXml: '04',
    unitPriceGross: 1500
  },
  {
    saleNum: 5,
    description: 'Papas + SINPE Móvil',
    productSku: 'PAP-001',
    productName: 'Papas Fritas Rústicas Grandes',
    paymentMethod: 'SINPE',
    paymentLabel: 'SINPE Móvil',
    expectedPaymentXml: '06',
    unitPriceGross: 1800
  }
];

let restaurantTestsSuccess = true;

for (const test of restaurantSalesTests) {
  console.log(`\n🍗 [VENTA ${test.saleNum}] ${test.description}`);

  const product = INITIAL_PRODUCTS.find(p => p.sku === test.productSku) || INITIAL_PRODUCTS[0];
  const taxRate = 0.13;
  const netUnitPrice = test.unitPriceGross / (1 + taxRate);
  const taxAmount = test.unitPriceGross - netUnitPrice;

  const doc: ElectronicDocument = {
    id: `doc-sale-${test.saleNum}`,
    saleId: `sale-${test.saleNum}`,
    documentType: '01',
    consecutive: `0010000101${String(test.saleNum).padStart(10, '0')}`,
    numericKey: `5061708260031019876540010000101${String(test.saleNum).padStart(10, '0')}199999999`,
    economicActivity: '561001',
    terminal: '00001',
    currency: 'CRC',
    saleCondition: '01',
    status: 'ACEPTADO_HACIENDA',
    issueDate: new Date().toISOString(),
    issuer: {
      name: 'Pollo Frito Sabor Cervanteño S.A.',
      commercialName: 'Pollo Frito Sabor Cervanteño',
      identificationType: '02',
      identificationNumber: '3101987654',
      phone: '25340000',
      email: 'factura@saborcervanteno.cr',
      province: '3',
      canton: '06',
      district: '01',
      address: 'Cervantes de Alvarado'
    },
    receiver: {
      name: 'Cliente Mesa Restaurante',
      identificationType: '01',
      identificationNumber: '109870654',
      economicActivity: '561001',
      email: 'cliente@mesa.cr',
      province: '3',
      canton: '06',
      district: '01',
      address: 'Cervantes'
    },
    lines: [
      {
        lineNumber: 1,
        productId: product.id,
        internalCode: product.sku,
        cabysCode: product.cabysCode,
        description: product.name,
        itemType: product.itemType || 'SERVICIO',
        unitOfMeasure: product.unitOfMeasure || 'Os',
        quantity: 1,
        unitPrice: netUnitPrice,
        subtotal: netUnitPrice,
        discount: 0,
        taxCode: '01',
        taxRateCode: '08',
        taxRate: 0.13,
        taxAmount: taxAmount,
        totalLine: test.unitPriceGross
      }
    ],
    subtotal: netUnitPrice,
    discountTotal: 0,
    taxTotal: taxAmount,
    total: test.unitPriceGross,
    retryAttempts: 0,
    isContingency: false,
    createdBy: 'admin',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    paymentMethods: [
      { method: test.paymentMethod, amount: test.unitPriceGross }
    ]
  };

  // Generar XML
  const rawXml = HaciendaXmlGenerator.generateDocumentXml(doc);

  // Firmar XML con XAdES-EPES
  const signedXml = XmlSignerService.signXmlDocument(rawXml, '3101987654', p12Base64, '1234');
  const verify = XmlSignerService.verifySignature(signedXml, publicKeyPem);

  // Validaciones
  const cabysMatch = rawXml.includes(`<CodigoCabys>${product.cabysCode}</CodigoCabys>`);
  const taxMatch = rawXml.includes('<Tarifa>13.00</Tarifa>') && rawXml.includes('<Codigo>01</Codigo>') && rawXml.includes('<CodigoTarifa>08</CodigoTarifa>');
  const baseMatch = rawXml.includes(`<MontoTotalLinea>${test.unitPriceGross.toFixed(5)}</MontoTotalLinea>`) || rawXml.includes(`<TotalComprobante>${test.unitPriceGross.toFixed(5)}</TotalComprobante>`);
  const tipoFiscalMatch = rawXml.includes(`<TotalServGravados>${netUnitPrice.toFixed(5)}</TotalServGravados>`);
  const paymentMatch = rawXml.includes(`<MedioPago>${test.expectedPaymentXml}</MedioPago>`);
  const signMatch = verify.valid === true;

  console.log(`  * CABYS (${product.cabysCode} - 13 dígitos):       ${cabysMatch ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`  * IVA (13% Tarifa 08 Código 01):                 ${taxMatch ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`  * Base Imponible (₡${netUnitPrice.toFixed(2)} + IVA = ₡${test.unitPriceGross}): ${baseMatch ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`  * Tipo Fiscal (${product.itemType} -> TotalServGravados): ${tipoFiscalMatch ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`  * Medio de Pago (<MedioPago>${test.expectedPaymentXml}</MedioPago>):              ${paymentMatch ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`  * Firma Digital XAdES-EPES RSA-SHA256:          ${signMatch ? 'PASS ✅' : 'FAIL ❌'}`);

  if (!cabysMatch || !taxMatch || !baseMatch || !tipoFiscalMatch || !paymentMatch || !signMatch) {
    restaurantTestsSuccess = false;
  }
}

console.log('\n================================================================');
console.log('📊 RESUMEN EJECUTIVO:');
console.log(`  * Auditoría Medios de Pago (SINPE=06): ${paymentAuditSuccess ? 'PASS ✅' : 'FAIL ❌'}`);
console.log(`  * Firma Digital XAdES-EPES (01,04,03,02): ${allDocsPass ? 'PASS ✅' : 'FAIL ❌'}`);
console.log(`  * Pruebas de 5 Ventas de Restaurante: ${restaurantTestsSuccess ? 'PASS ✅' : 'FAIL ❌'}`);
console.log('================================================================\n');

if (paymentAuditSuccess && allDocsPass && restaurantTestsSuccess) {
  process.exit(0);
} else {
  process.exit(1);
}
