export function getElectronicDocumentFileNames(clave: string) {
  if (!clave || clave.length !== 50) {
    return {
      xml: `TE-${clave || 'desconocido'}.xml`,
      hacienda: `AHC-${clave || 'desconocido'}.xml`,
      pdf: `TE-${clave || 'desconocido'}.pdf`
    };
  }
  
  // Hacienda CR: digits 31 and 32 are the document type.
  // 01: Factura, 03: Nota Crédito, 04: Tiquete
  const tipoComprobante = clave.substring(29, 31);
  let prefix = 'TE';
  
  if (tipoComprobante === '01') {
    prefix = 'FE';
  } else if (tipoComprobante === '03') {
    prefix = 'NC';
  } else if (tipoComprobante === '04') {
    prefix = 'TE';
  } else {
    prefix = 'CE'; 
  }

  return {
    xml: `${prefix}-${clave}.xml`,
    hacienda: `AHC-${clave}.xml`,
    pdf: `${prefix}-${clave}.pdf`
  };
}
