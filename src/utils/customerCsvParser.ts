import { Customer, IdentificationType } from '../types/pos';

/**
 * Parsea una línea individual de CSV respetando comillas dobles y comas internas
 */
export function parseCSVLine(text: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cur += '"';
        i++; // saltar comilla escapada
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += char;
    }
  }
  result.push(cur.trim());
  return result;
}

/**
 * Normaliza el tipo de identificación según la DGT v4.4 de Hacienda Costa Rica:
 * 01: Cédula Física (9 dígitos)
 * 02: Cédula Jurídica (10 dígitos)
 * 03: DIMEX (11 o 12 dígitos)
 * 04: NITE (10 dígitos)
 * 05: Extranjero / Pasaporte
 */
export function normalizeIdentificationType(typeStr: string | undefined, idNumber: string): IdentificationType {
  const cleanType = (typeStr || '').toLowerCase();
  const cleanId = (idNumber || '').replace(/\D/g, '');

  if (cleanType.includes('jurídica') || cleanType.includes('juridica') || cleanType === '02') {
    return '02';
  }
  if (cleanType.includes('física') || cleanType.includes('fisica') || cleanType === '01') {
    return '01';
  }
  if (cleanType.includes('dimex') || cleanType === '03') {
    return '03';
  }
  if (cleanType.includes('nite') || cleanType === '04') {
    return '04';
  }
  if (cleanType.includes('extranjero') || cleanType.includes('pasaporte') || cleanType === '05') {
    return '05';
  }

  // Deducción inteligente si no viene explícito
  if (cleanId.length === 10 && cleanId.startsWith('3')) {
    return '02'; // Cédula jurídica costarricense (3-101-...)
  }
  if (cleanId.length === 11 || cleanId.length === 12) {
    return '03'; // DIMEX
  }
  return '01'; // Default física
}

/**
 * Parsea un archivo CSV completo de clientes y genera objetos Customer limpios y validados
 */
export function parseCustomersCSV(csvContent: string): { customers: Customer[]; duplicatesSkipped: number; errorsCount: number } {
  const lines = csvContent.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) {
    return { customers: [], duplicatesSkipped: 0, errorsCount: 0 };
  }

  // Identificar encabezados en la primera línea
  const headerTokens = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/["']/g, '').trim());
  const hasHeaders = headerTokens.some(h => h.includes('nombre') || h.includes('identificación') || h.includes('correo') || h.includes('cédula'));
  const dataLines = hasHeaders ? lines.slice(1) : lines;

  // Índices por defecto
  let nameIdx = 0;
  let typeIdx = 1;
  let idIdx = 2;
  let phone1Idx = 3;
  let phone2Idx = 4;
  let celIdx = 6;
  let provIdx = 7;
  let cantonIdx = 8;
  let distIdx = 9;
  let barrioIdx = 10;
  let dirIdx = 11;
  let emailIdx = 12;

  if (hasHeaders) {
    headerTokens.forEach((h, i) => {
      if (h.includes('nombre') || h.includes('cliente') || h.includes('razon')) nameIdx = i;
      else if (h.includes('tipo') && (h.includes('ident') || h.includes('cedula') || h.includes('id'))) typeIdx = i;
      else if (h.includes('ident') || h.includes('cedula') || h.includes('cédula') || h.includes('ruc') || h.includes('nit')) idIdx = i;
      else if (h.includes('teléfono 1') || (h.includes('tel') && !h.includes('2'))) phone1Idx = i;
      else if (h.includes('teléfono 2') || h.includes('tel 2')) phone2Idx = i;
      else if (h.includes('celular') || h.includes('móvil') || h.includes('movil')) celIdx = i;
      else if (h.includes('provincia')) provIdx = i;
      else if (h.includes('cantón') || h.includes('canton')) cantonIdx = i;
      else if (h.includes('distrito')) distIdx = i;
      else if (h.includes('barrio')) barrioIdx = i;
      else if (h.includes('dirección') || h.includes('direccion') || h.includes('ubicacion')) dirIdx = i;
      else if (h.includes('correo') || h.includes('email') || h.includes('mail')) emailIdx = i;
    });
  }

  const seenIds = new Set<string>();
  const parsedCustomers: Customer[] = [];
  let duplicatesSkipped = 0;
  let errorsCount = 0;

  for (const line of dataLines) {
    if (!line.trim()) continue;
    try {
      const cols = parseCSVLine(line);
      const rawName = (cols[nameIdx] || '').trim();
      const rawId = (cols[idIdx] || '').trim();

      if (!rawName && !rawId) {
        continue;
      }

      const idClean = rawId.replace(/["'\s]/g, '') || `CLI-${Date.now()}-${Math.floor(Math.random()*1000)}`;
      const normalizedType = normalizeIdentificationType(cols[typeIdx], idClean);
      
      // Deduplicación por cédula (salvo genéricos como 100000000)
      const uniqueKey = (idClean === '100000000' || idClean === '000000000')
        ? `${rawName.toLowerCase()}-${idClean}-${(cols[emailIdx] || '').toLowerCase()}`
        : idClean;

      if (seenIds.has(uniqueKey)) {
        duplicatesSkipped++;
        continue;
      }
      seenIds.add(uniqueKey);

      // Teléfono: buscar el primer valor válido
      const phone1 = (cols[phone1Idx] || '').trim();
      const cel = (cols[celIdx] || '').trim();
      const phone2 = (cols[phone2Idx] || '').trim();
      const phone = phone1 || cel || phone2 || '';

      const email = (cols[emailIdx] || '').trim().toLowerCase();
      const province = (cols[provIdx] || 'Cartago').trim();
      const canton = (cols[cantonIdx] || 'Alvarado').trim();
      const district = (cols[distIdx] || 'Cervantes').trim();
      const barrio = (cols[barrioIdx] || '').trim();
      const rawAddress = (cols[dirIdx] || '').trim();
      const fullAddress = [barrio, rawAddress].filter(Boolean).join(', ') || `${district}, ${canton}`;

      const customer: Customer = {
        id: `cust-${idClean.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now()}-${parsedCustomers.length}`,
        name: rawName || 'Cliente Sin Nombre',
        identification: idClean,
        identificationType: normalizedType,
        phone,
        email,
        address: fullAddress,
        province: province ? (province.charAt(0).toUpperCase() + province.slice(1)) : 'Cartago',
        canton: canton ? (canton.charAt(0).toUpperCase() + canton.slice(1)) : 'Alvarado',
        district: district ? (district.charAt(0).toUpperCase() + district.slice(1)) : 'Cervantes',
        neighborhood: barrio,
        fiscalCondition: normalizedType === '02' ? 'Persona Jurídica (Contribuyente DGT)' : 'Persona Física (Receptor Electrónico)',
        createdAt: new Date().toISOString()
      };

      parsedCustomers.push(customer);
    } catch {
      errorsCount++;
    }
  }

  return { customers: parsedCustomers, duplicatesSkipped, errorsCount };
}

// Texto CSV Maestro proporcionado por el usuario
export const DEFAULT_CLIENTS_CSV_RAW = `"Nombre","Tipo de identificación","Identificación","Teléfono 1","Teléfono 2","Fax","Celular","Provincia","Cantón","Distrito","Barrio","Dirección","Correo","Cuenta por cobrar","Cuenta por pagar","Término de pago","Lista de precios","Vendedor"
"GERMAN JESUS ARCE CASTILLO","Cédula Física","304250957","84489749",,,,"Cartago","Paraíso","Birrisito","Birrisito","Frente a proyecto la huerta","germanarca117@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"Cliente de contado","Cédula Física","100000000",,,,,,,,,,"ejemplo@ejemplo.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"JOSE LUIS BRENES COTO","Cédula Física","303700709","88560991",,,,"Cartago","Paraíso","Birrisito","Birrisito","birrisito","josebreco@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado",,
"SILVIA MELISSA JIMENEZ ARAYA","Cédula Física","111110241","83287594",,,,"Cartago","Paraíso","Birrisito","Birrisito","Birrisito","Silviamelissa31@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"BETESDA LA ALTERNATIVA NATURAL SOCIEDAD ANONIMA","Cédula Jurídica","3101663043","22225225",,,,"San josé","San josé","Catedral","Soledad","san jose catedral","betesdasoledadfactura@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"OSCAR ANTONIO BRENES COTO","Cédula Física","302390565",,,,,"Cartago","Paraíso","Birrisito","Birrisito","birrisito","jose.brenes.coto@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"ENRIQUE ALBERTO SOLANO SOLANO","Cédula Física","302250748","86351150",,,,"Cartago","Alvarado","Cervantes","Descanso","Capellades","gastosenrique09@hotmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"EQUIPOS NIETO SOCIEDAD ANONIMA","Cédula Jurídica","3101003119","22226555",,,,"Cartago","Alvarado","Cervantes","El alto","San Jose","facturaservicio@equiposnieto.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"TRIGAS SOCIEDAD ANONIMA","Cédula Jurídica","3101189270",,,,,"Cartago","Alvarado","Cervantes","El alto","Cartago","facturacionelectronica@trigascr.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"EDSON ARANTES MORA COTO","Cédula Física","304180191",,,,,"Cartago","Alvarado","Cervantes","Descanso","Cartago","emorasojo@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"BRIAN ALBERTO MOYA MENDEZ","Cédula Física","305460318","85272806",,,,"Cartago","Alvarado","Cervantes","Aguas (parte)","Cervantes","bmm24603@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"Ecopollo Premium Byg Sociedad De Responsabilidad Limitada","Cédula Jurídica","3102717534",,,,,"San josé","Pérez zeledón","Barú",,"PEREZ",,"Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado",,
"FABIAN VINICIO GOMEZ SERRANO","Cédula Física","304980967","85313035",,,,"Cartago","Alvarado","Cervantes","El alto","Cervantes","fabiangomezserrano52@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"GAS NACIONAL ZETA SOCIEDAD ANONIMA","Cédula Jurídica","3101114502","+506 41005000",,,,"Cartago","Oreamuno","Cipreses",,"Cartago","facturaproveedores@zetagas.co.cr","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado",,
"ELEVADORES CENTROAMERICANOS INT SOCIEDAD ANONIMA","Cédula Jurídica","3101671124","22561241",,,,"Cartago","Alvarado","Cervantes","Descanso","Cartago","facturacion@elevadorescentroamericanos.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"DISTRIBUIDORA LUCEMA SOCIEDAD ANONIMA","Cédula Jurídica","3101191433",,,,,"San josé","Santa ana","Piedades","Montaña del sol","San Jose","viaticos@lucema.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"DISCORSA AUTOMOTRIZ SOCIEDAD ANONIMA","Cédula Jurídica","3101535439","22211117",,,,"San josé","San josé","Carmen","Carmen","San Jose","discorsafedigital@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"JC REFRIGERACION Y AIRE ACONDICIONADO INDUSTRIAL SOCIEDAD ANONIMA","Cédula Jurídica","3101711663","87339476",,,,"Cartago","Alvarado","Cervantes","Descanso","Cartago","jcrefrigeracion01@hotmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"LEONEL ANDRES MATA ARIAS","Cédula Física","114660507","89793535",,,,"San josé","Desamparados","San juan de dios","Mota","San Jose","leonelmata07facturacion@gamil.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"Glenda Maria Madriz Fonseca ","Cédula Física","304420532",,,,,"Cartago","Paraíso","Santiago","Flor","cartago","transpema2019@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"RIO CERERE SOCIEDAD ANONIMA","Cédula Jurídica","3101204716","+506 87136880",,,,"Cartago","Alvarado","Cervantes","El alto","LIMON","riocerere@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"INSOMA CR SOCIEDAD ANONIMA","Cédula Jurídica","3101261215","25581200",,,,"Cartago","Alvarado","Cervantes","Bajo malanga","Cartago","facturaelectronica2@insomacr.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"JOSE MANUEL GUILLEN MARTINEZ","Cédula Física","304690526","85864489",,,,"Cartago","Alvarado","Cervantes","El alto","Cervantes","jmguillenm34@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"ECOLAB SOCIEDAD DE RESPONSABILIDAD LIMITADA","Cédula Jurídica","3102117583","71437096",,,,"Alajuela","Alajuela","Garita","Copeyal","Alajuela","cuentasporpagar@ecolab.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado",,
"AGRICOLA PARRUAS SOCIEDAD ANONIMA","Cédula Jurídica","3101467524","25743749",,,,"Cartago","Alvarado","Cervantes","Descanso","Cervantes","agrparruas@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"TERMINAL CONTENEDORES (INTEROCEANICOS) SOCIEDAD ANONIMA","Cédula Jurídica","3101105632","22225225",,,,"Cartago","Alvarado","Cervantes","Aguas (parte)","La uruca","terconsacxpdigital@terconsa.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"IMPLANTEC SOCIEDAD ANONIMA","Cédula Jurídica","3101122784","22349043",,,,"Cartago","Alvarado","Cervantes","Bajo solano","Cervantes","recepcionfe@implantec.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"CAPRIS SOCIEDAD ANONIMA","Cédula Jurídica","3101005113",,,,,"Cartago","Alvarado","Cervantes","El alto","San Jose","fe.tecnica@capris.co.cr","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"REPUESTOS TIRIBI SOCIEDAD ANONIMA","Cédula Jurídica","3101121786","22591098",,,,"San josé","Desamparados","Desamparados","San josé","San Jose","facturadigital@repuestostiribi.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"DISTRIBUCIONES HORIZONTALES SOCIEDAD ANONIMA","Cédula Jurídica","3101093628",,,,,"Cartago","Alvarado","Cervantes","Descanso","San Jose","fe@dhorizontales.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"CREACIONES SIN LIMITES DEL ESTE SOCIEDAD ANONIMA","Cédula Jurídica","3101322684","22736224",,,,"San josé","Curridabat","Granadilla","Granadilla sur","San Jose","creacionessl@ice.co.cr","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"INVERSIONES FAP SOCIEDAD DE RESPONSABILIDAD LIMITADA","Cédula Jurídica","3102845038","88270019",,,,"Cartago","Oreamuno","San rafael","Alto cerrillos (corazón de jesús)","Cartago","inversionesfap.fe@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"PLYCEM CONSTRUSISTEMAS COSTA RICA SOCIEDAD ANONIMA","Cédula Jurídica","3101372779",,,,,"Cartago","Alvarado","Cervantes","El alto","Cartago","comprasplycemcr@elementia.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"ULISES MANUEL DE LOS ANGELES MARTINEZ ULLOA","Cédula Física","303020905",,,,,"Cartago","Alvarado","Cervantes","El alto","Cervantes","umartinezfacturacion@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"ALMACENES EL COLONO SOCIEDAD ANONIMA","Cédula Jurídica","3101082969","25347835 27131111",,,,"Cartago","Alvarado","Cervantes","Bajo malanga","Cervantes","fealmacenes@colonos.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"LOS DELFINES DE LA TRINIDAD SOCIEDAD ANONIMA","Cédula Jurídica","3101792433","83209209",,,,"Cartago","Alvarado","Cervantes","Descanso","Cartago","delfinescampo@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"MAYKOL ANDREY SANABRIA ALFARO","Cédula Física","205680870","64231240",,,,"Cartago","Alvarado","Cervantes","Bajo malanga","Cartago","msanabriame@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"CORPORACION FONT SOCIEDAD ANONIMA","Cédula Jurídica","3101008736","22229610 22909610",,,,"San josé","San josé","Uruca","Uruca (centro)","SAN JOSE","FE@FONT.CO.CR","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"LUIS ALBERTO ALVARADO RIOS","Cédula Física","303760261","84199935",,,,"Cartago","Alvarado","Cervantes","Bajo malanga","CARTAGO","guisellegranados1975@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"GUISELLE ADRIANA CABALLERO GRANADOS","Cédula Física","303380584","86964271 86964271",,,,"Cartago","Alvarado","Cervantes","Bajo malanga","CARTAGO","guisellegranados1975@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"CAFETALERA AQUIARES SOCIEDAD ANONIMA","Cédula Jurídica","3101063474",,,,,"Cartago","Alvarado","Cervantes","Descanso","Turrialba","aquiaresfacturae@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"LIBERTY SERVICIOS FIJOS LY SOCIEDAD ANONIMA","Cédula Jurídica","3101747406","57155004",,,,"Cartago","Alvarado","Cervantes","Descanso","CARTAGO","facturasproveedores@libertycr.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"DESARROLLOS CULTURALES COSTARRICENSES D C C SOCIEDAD ANONIMA","Cédula Jurídica","3101167504","22203015",,,,"San josé","San josé","Pavas","Metrópolis","SAN JOSE","recepcion@decc.cr","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"TRANSPORTES TERRESTRES LA LIMA A Y M SOCIEDAD ANONIMA","Cédula Jurídica","3101382719","25372672",,,,"Cartago","Alvarado","Cervantes","Bajo malanga","CARTAGO","facturaelectronica@trasporteslalima.co.cr","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"ASOCIACION CRUZ ROJA COSTARRICENSE","Cédula Jurídica","3002045433",,,,,"Cartago","Alvarado","Pacayas","Lourdes","CARTAGO","turrialba@crusroja.or.cr","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"COSEINCA SOCIEDAD ANONIMA","Cédula Jurídica","3101091889","25344204",,,,"Cartago","Alvarado","Cervantes","El alto","CARTAGO","facturas@coseinca.co.cr","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"BRAYAN GILBERTO MENDEZ GOMEZ","Cédula Física","702540168",,,,,"Cartago","Alvarado","Cervantes","Descanso","CARTAGO","facturasbraayanm20@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"EDUARDO ARTURO MORA CORRALES","Cédula Física","109160233","84421243",,,,"Cartago","Alvarado","Cervantes","El alto","SAN JOSE","transporteseduardo24@gmil.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"SOLUCIONES CONSTRUCTIVAS BARULL SOCIEDAD ANONIMA","Cédula Jurídica","3101825619","25341400",,,,"Cartago","Alvarado","Pacayas","Patalillo","CARTAGO","facturas@barull.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"RECONSTRUCTORA NACIONAL DE CABEZOTES LIMITADA","Cédula Jurídica","3102044869","22561828",,,,"Cartago","Alvarado","Cervantes","Bajo malanga","SAN JOSE","facturasrnc@importacinesgm.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"FOUNDEVER COSTA RICA SOCIEDAD ANONIMA","Cédula Jurídica","3101211555","87197987",,,,"Cartago","Alvarado","Cervantes","El alto","CARTAGO","maria.bejarano@foundever.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"Distribuidora A & D De Turrialba Sociedad Anonima","Cédula Jurídica","3101547727","25561132",,,,"Cartago","Turrialba","Turrialba","Américas","125 norte del colegio clorito picado","almacendigrasa@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado",,
"GLADYS MARTINA COTO ARIAS","Cédula Física","302680311","+506 25347852",,,,"Cartago","Paraíso","Paraíso","el alto","birrisito","saborcervantes@recepcion.alegra.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado",,"JOSE"
"DESARROLLOS MEZA CORDERO SOCIEDAD ANONIMA","Cédula Jurídica","3101381265","25522000",,,,"Cartago","Alvarado","Cervantes","El alto","CARTAGO","fe.grupomeza@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"Franklin Alfaro Quesada","Cédula Física","106690484","83496685",,,,"Limón","Limón","Limón","Cariari","Limon","falfaroquesada18@gmaiol.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"DISTRIBUIDORA LARCE SOCIEDAD ANONIMA","Cédula Jurídica","3101047714","22211100",,,,"Cartago","Alvarado","Cervantes","Aguas (parte)","SAN JOSE","factuaraelectronica@dilarce.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"TANNIA ALEJANDRA GARITA SANCHEZ","Cédula Física","304140818","86392764",,,,"Cartago","Cartago","Carmen","San blas","CARTAGO","tannia.garita@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"NIDIA MARIA ARROYO VALERIN","Cédula Física","602650692",,,,,"Cartago","Alvarado","Cervantes","Bajo malanga","CARTAGO","recidenciatrebol@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"JOSE RICARDO SALMERON ROJAS","Cédula Física","303720017",,,,,"Cartago","Alvarado","Cervantes","Bajo malanga","CARTAGO","recidenciatrebol@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"Unilever de centroamerica S.A.","Cédula Jurídica","3101063680","70501018",,,,"Cartago","Alvarado","Cervantes","Bajo malanga","SAN JOSE","leynersr@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"ASOCIACION CRISTIANA LA GRAN COMISION","Cédula Jurídica","3002658239","25313117",,,,"Cartago","Turrialba","Turrialba","Pueblo nuevo","CARTAGO","facturacionesacgc@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"JCG SOLUTIONS AND FACILITIES SOCIEDAD ANONIMA","Cédula Jurídica","3101732298","86458484",,,,"San josé","Desamparados","San rafael arriba","Alpino","SAN JOSE","facturasjcgsolution@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"AGROINNOVA SOCIEDAD ANONIMA","Cédula Jurídica","3101603169","22295050",,,,"Cartago","Alvarado","Cervantes","Bajo malanga","alajuela","fag@grupoagca.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"ALLAN JOHANNY AGUILAR VALVERDE","Cédula Física","303890069","64799597",,,,"Cartago","Alvarado","Cervantes","El alto","CARTAGO","allanaguilarvalverde72@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"YAMIL GERARDO LEAL MARTINEZ","Cédula Física","111060607","83265159",,,,"Cartago","Turrialba","Pavones","San rafael","CARTAGO","yalealmgastos@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"JUAN CARLOS MOYA MENDEZ","Cédula Física","304920229","86178243",,,,"Cartago","Alvarado","Cervantes","El alto","CARTAGO","moyajc96@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"Ana Gabriela Perez Coveda","Cédula Física","304480350","86594402",,,,"Cartago","Alvarado","Cervantes","El alto","CARTAGO","facturaelectronicagpp@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"Corporación megasuper","Cédula Jurídica","3101052164",,,,,"Cartago","Alvarado","Cervantes","El alto","CARTAGO","felectronicabeaticos@megasuper.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"DIEGO MARTIN ROJAS SANABRIA","Cédula Física","303530383","62121976",,,,"Cartago","Alvarado","Cervantes","Bajo malanga","cartago","facturasdiego76@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"SERVICIO INFOTREE SOCIEDAD DE RESPONSABILIDAD LIMITADA","Cédula Jurídica","3102686012","40017610",,,,"Cartago","Alvarado","Cervantes","El alto","San jose","facturacioncheil@infotreeglobal.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"VALVULAS Y CONEXIONES URREA SOCIEDAD ANONIMA","Cédula Jurídica","3101035901","22522222",,,,"San josé","San josé","Hatillo","Hatillo centro","SAN JOSE","valcorecepcionfe@valcosa.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"GRUPO COLONO SOCIEDAD ANONIMA","Cédula Jurídica","3101807735",,,,,"Cartago","Cartago","Oriental","Cerrillos","CARTAGO","jramirezg@colonos.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"HACIENDA EL PEDREGAL SOCIEDAD ANONIMA","Cédula Jurídica","3101008604","47112486",,,,"Cartago","Alvarado","Cervantes","Aguas (parte)","CARTAGO","financiero@haciendaelpedregal.cr","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"SERVICIOS UNIDOS DE TRANSPORTES DE SIQUIRRES SOCIEDAD ANONIMA","Cédula Jurídica","3101182816","27683636",,,,"Cartago","Alvarado","Cervantes","Aguas (parte)","Limon ","sutssa@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"ALEJANDRO GERARDO BARQUERO VIQUEZ","Cédula Física","304050822","89355452",,,,"Cartago","Paraíso","Paraíso","Soledad","CARTAGO","facturacioncontaluci@hotmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"GIOVANNI HUMBERTO SOLIS PEREZ","Cédula Física","303000576","84716620",,,,"Cartago","Alvarado","Cervantes","Bajo malanga","CARTAGO","solismivil1@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"ALBERTO MAURICIO CAMPOS BARRANTES","Cédula Física","303600525",,,,,"Cartago","Alvarado","Cervantes","El alto","CARTAGO","recidenciatrebol@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"JOSE ARTURO HERRERA CORDERO","Cédula Física","601490559",,,,,"Cartago","Alvarado","Cervantes","El alto","cartago","recidenciatrebol@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"CARMEN MAYELA DE JES JIMENEZ CARDENAS","Cédula Física","105970077",,,,,"Cartago","Alvarado","Cervantes","El alto","cartago","recidenciatrebol@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"Asociación Administradora de Acueducto Rural de Turrialba el Recreo ","Cédula Jurídica","3002300780","88452695",,,,"Cartago","Alvarado","Cervantes","El alto","Turrialba","asadaelrecreo@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"SERVICIO Y MANTENIMIENTO TECNICO M T M E I R L","Cédula Jurídica","3105187236",,,,,"Cartago","Alvarado","Cervantes","Descanso","cartago","facturas@mtm.cr","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"ALUTECH COSTA RICA, SOCIEDAD ANONIMA","Cédula Jurídica","3101625109",,,,,"San josé","San josé","Catedral","González víquez","SAN JOSE","facturacioncr@alutech.hn","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"COOPERATIVA DE AHORRO Y CREDITO DE LAS PERSONAS FISICAS Y JURIDICAS R L","Cédula Jurídica","3004045110",,,,,"Cartago","Cartago","Oriental","Estadio","cartago","oorozco@coopecaja.fi.cr","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"TRANSCHAVA TEMPERATURA CONTROLADA SOCIEDAD ANONIMA","Cédula Jurídica","3101670073","22400730",,,,"Heredia","Heredia","Heredia","San vicente","SAN JOSE","transchava@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"Israel David Trejos Gomes","Cédula Física","304240541","72970986 72970986",,,,"Cartago","Alvarado","Cervantes","El alto","cartago","aceptar@facturaelectronica.cr","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"DISTRIBUIDORA CARBONE CR SOCIEDAD ANONIMA","Cédula Jurídica","3101693704","40016263",,,,"Cartago","Alvarado","Cervantes","El alto","San Jose","facturacioncr@carbone.cr","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"COMERCIALIZADORA DE REPUESTOS HERMANOS BALLESTERO SOCIEDAD DE RESPONSABILIDAD LIMITADA","Cédula Jurídica","3102872009","63184929",,,,"Cartago","Alvarado","Cervantes","Descanso","cartago","comerzializadorahnosballestero@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado",,
"SUR QUIMICA SOCIEDAD ANONIMA","Cédula Jurídica","3101022435","22113700",,,,"Cartago","Alvarado","Cervantes","El alto","cartago","electronica@gruposur.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"CLARO CR TELECOMUNICACIONES SOCIEDAD ANONIMA","Cédula Jurídica","3101460479","70255867",,,,"San josé","San josé","Pavas","Lomas del río","SAN JOSE","kenneth.arias@claro.cr","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"CONSORCIO TECNICO AGRICOLA CTA SOLUCIONES SOCIEDAD ANONIMA","Cédula Jurídica","3101566458",,,,,"San josé","San josé","Merced","Cocacola","SAN JOSE","alonso.flores@ctagastos.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"REPRESENTACIONES PARAISO SOCIEDAD ANONIMA","Cédula Jurídica","3101295499","25745989",,,,"Cartago","Paraíso","Paraíso","Birrisito","cartago","facturas@rparaiso.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"Patronato escolar Escuela Juan Evangelista Sojo C.","Cédula Jurídica","3101546949",,,,,"Cartago","Paraíso","Santiago","Flor","cartago","kreznick@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"MARIA ESTER DEL SOCORRO BRENES CORDERO","Cédula Física","302580133","89733690",,,,"Cartago","Alvarado","Cervantes","Bajo malanga","cartago","recidenciatrebol@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"HELADOS SENSACION LIMITADA","Cédula Jurídica","3102368681","42006100",,,,"Cartago","Alvarado","Cervantes","Bajo malanga","alajuela","contabilidad@sensacioncr.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"SERVICIOS CONRADO DE MANTENIMIENTO DE TELECOMUNICACIONES SOCIEDAD DE RESPONSABILIDAD LIMITADA","Cédula Jurídica","3102698670","60022601",,,,"Cartago","Alvarado","Cervantes","El alto","Alajuela","serviciosconrado@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"CENTROSEMILLAS SOCIEDAD ANONIMA","Cédula Jurídica","3101672935","22017457",,,,"Cartago","Alvarado","Cervantes","El alto","cartago","info@centrosemillassa.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"QUEBRADORES RODATEC TFFA SOCIEDAD ANONIMA","Cédula Jurídica","3101806389","86962626 21002218",,,,"Cartago","Alvarado","Cervantes","El alto","Turrialba","facturasquebrador@rodateccr.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"IREX DE COSTA RICA SOCIEDAD ANONIMA","Cédula Jurídica","3101047399",,,,,"Cartago","La unión","Tres ríos","Antigua","cartago","facturaelectronica@irex.co.cr","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"JOSE MANUEL RIOS MORALES","Cédula Física","303280980","25347767",,,,"Cartago","Alvarado","Cervantes","El alto","Santiago","sriosm03@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"COPRODISA COSTA RICA (CR) SOCIEDAD ANONIMA","Cédula Jurídica","3101421033","22579292",,,,"Cartago","Alvarado","Cervantes","El alto","Uruca","factura@coprodisacr.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"JEISON ARNOLDO RAMIREZ RAMIREZ","Cédula Física","304540686",,,,,"Cartago","Alvarado","Cervantes","Aguas (parte)","cartago","jeison2ra@hotmil.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"GLOBAL Q COMUNICACIONES INTERNACIONALES SOCIEDAD ANONIMA","Cédula Jurídica","3101388373","22378019",,,,"Heredia","Heredia","Heredia","Oriente","heredia","factura@globaqsa.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"SOLIS ELECTRICA SOCIEDAD DE RESPONSABILIDAD LIMITADA","Cédula Jurídica","3102176592","27104787",,,,"Limón","Pococí","Guápiles","Garabito","Limon ","facturas@selectrica.net","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"CTI CREATIVE TRADE INNOVATIONS SOCIEDAD ANONIMA","Cédula Jurídica","3101711110","64658036",,,,"San josé","San josé","Carmen","Carmen","SAN JOSE","aceptar@facturaelectronica.cr","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"MARKETING DESIGN GROUP, M.D.G. SOCIEDAD ANONIMA","Cédula Jurídica","3101473563",,,,,"San josé","San josé","Catedral","Carlos maría jiménez","SAN JOSE","tesoreria.cr@marketing.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"TRACTOMOTRIZ SOCIEDAD ANONIMA","Cédula Jurídica","3101013912","84165931",,,,"San josé","Moravia","San vicente","Americano","SAN JOSE","facuraelectronica@tractomotriz.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"PINTUCO COSTA RICA PCR SOCIEDAD ANONIMA","Cédula Jurídica","3101005434","22166100",,,,"Cartago","Alvarado","Cervantes","Descanso","Cartago","reembolsospcr@pintuco.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"COMERCIAL DINANT DE COSTA RICA SOCIEDAD ANONIMA","Cédula Jurídica","3101373220","70707717",,,,"San josé","San josé","Catedral","Dolorosa (parte)","SAN JOSE","comprobanteselectronicos@dinant.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"ROMANAS CR GENERAL SERVICES SOCIEDAD DE RESPONSABILIDAD LIMITADA","Cédula Jurídica","3102796013","85900878",,,,"Cartago","Alvarado","Cervantes","Descanso","cartago","facturacrromanas@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"CRISTIAN ORLANDO LOPEZ ROBLES","Cédula Física","205060683",,,,,"Cartago","Alvarado","Cervantes","Descanso","cartago","ventas@muebleslopez.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"CARSO CONSTRUCCION DE COSTA RICA SOCIEDAD ANONIMA","Cédula Jurídica","3101605212","70394629",,,,"Cartago","Alvarado","Cervantes","Bajo malanga","alajuela","j.sanchez.carso@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"VILLAPLANTS COSTA RICA SOCIEDAD DE RESPONSABILIDAD LIMITADA","Cédula Jurídica","3102161740","25514000",,,,"Cartago","Alvarado","Cervantes","Descanso","cartago","compras@villaplatscr.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"PRODUCTIVE BUSINESS SOLUTIONS (COSTA RICA) SOCIEDAD ANONIMA","Cédula Jurídica","3101009515","44048130",,,,"Cartago","Alvarado","Cervantes","El alto","cartago","proveedores.cr@grouppbs.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"distribuidoraabrasivasmouteazul","Cédula Jurídica","3101213690",,,,"22763637","Cartago","Alvarado","Cervantes","Bajo malanga","SAN JOSE","factura@diamasacr.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"ALLAN ANTONIO GARITA VARGAS","Cédula Física","303440649","+506 87074395",,,,"Cartago","Alvarado","Cervantes","El alto","cartago","allangarita76@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"Productos Kitty S.A","Cédula Jurídica","3101283788",,,,"25372800","San josé","San josé","Zapote","Zapote (centro)","SAN JOSE","ventas@productoskitty.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"centro de aluminio y vidrios brenes","Cédula Jurídica","3101569710",,,,"25524011","Cartago","Alvarado","Cervantes","Bajo malanga","cartago","facturacion@vidriosbrenes.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"MICHAEL LEONEL GUILLEN MARTINEZ","Cédula Física","304910831",,,,"60042118","Cartago","Alvarado","Cervantes","El alto","Cervantes","michaelguillenmartinez96@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"KRISIA RAMOS MATA","Cédula Física","304810245",,,,"71415271","Cartago","Turrialba","Turrialba","Cabiria","Turrialba","krisiak28@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"COLCHONERIA TREBOL SOCIEDAD ANONIMA","Cédula Jurídica","3101303953","24531000",,,,"Alajuela","Palmares","Palmares","San vicente","cartago","facturacion.colchoneriatrebol@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"R BOGANTES E HIJOS SOCIEDAD ANONIMA","Cédula Jurídica","3101149780","25574544",,,,"Cartago","Alvarado","Cervantes","El alto","Turrialba","distrbogantes@rbogantes.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"UL COSTA RICA SCC SOCIEDAD ANONIMA","Cédula Jurídica","3101675076","22984000",,,,"Cartago","Alvarado","Cervantes","Aguas (parte)","SAN JOSE","servicioalcliente@aseunilever.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"ISABU ARFACXAD ARAYA CAMACHO","Cédula Física","305070956","63023894",,,,"Cartago","Alvarado","Cervantes","El alto","cartago","facturacion@urearconsulting.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"DISTRIBUIDORA MOLINA Y OVARES DE GRECIA SOCIEDAD ANONIMA","Cédula Jurídica","3101891472","40002434",,,,"Alajuela","Grecia","Bolívar","San juan","SAN JOSE","gastos@molinayovares.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"UNION COMERCIAL DE COSTA RICA, UNICOMER SOCIEDAD ANONIMA","Cédula Jurídica","3101074154",,,,,"Cartago","Alvarado","Cervantes","El alto","cartago","admon_325@unicomer.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"MARCOS CENTENO MONTERO","Cédula Física","302100359","89309711",,,,"Cartago","Turrialba","Turrialba","Cementerio","cartago","facturasencomiendascenteno@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"GRUPO BBGYA SOCIEDAD ANONIMA","Cédula Jurídica","3101748129",,,,,"Alajuela","Alajuela","Alajuela","Ciruelas","alajuela","facturaelectronica@bbgya.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"CONFECCIONES INDUSTRIALES BELL SOCIEDAD DE RESPONSABILIDAD LIMITADA","Cédula Jurídica","3102697216","84555693",,,,"Cartago","Alvarado","Cervantes","El alto","cartago","delantalesbel14@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"AGROVETERINARIA EL COLONO SOCIEDAD ANONIMA","Cédula Jurídica","3101339561",,,,,"Cartago","Alvarado","Cervantes","El alto","cartago","feagroveterinaria@grupocolono.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"ASOCIACION SOLIDARISTA DE EMPLEADOS DE PRISMAR DE COSTA RICA SOCIEDAD ANONIMA Y AFINES","Cédula Jurídica","3002313802",,,,,"San josé","San josé","Carmen","Carmen","SAN JOSE","facturaselectronicasaseprismar@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"JESUS ALBERTO CASTILLO ESTRADAj","Cédula Física","305370280","63945745",,,,"Cartago","Alvarado","Cervantes","El alto","cartago","jesuscastilloe17@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"RITA LORENA DE LOS ANGELES WASHINGTON ESPINOZA","Cédula Física","106500551","85603376",,,,"Cartago","Alvarado","Cervantes","El alto","cartago","gilberth1215@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"ASOCIACION ADMINISTRADORA ACUEDUCTO DE LA SUIZA DE TURRIALBA","Cédula Jurídica","3002205851","25314343",,,,"Cartago","Turrialba","La suiza","Selva (parte)","CARTAGO","acueductolasuiza@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"LUVITILSE SOCIEDAD ANONIMA","Cédula Jurídica","3101589937",,,,,"Cartago","Alvarado","Cervantes","El alto","cartago","facturas@luvitilse.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"RONALD VINICIO GUILLEN MARTINEZ","Cédula Física","304540333","88567093",,,,"Cartago","Alvarado","Cervantes","El alto","cartago","corpencer.2011@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"CRISTAL DORADO TRANSPORTE Y RECICLAJE SOCIEDAD DE RESPONSABILIDAD LIMITADA","Cédula Jurídica","3102876560","85837372",,,,"Cartago","Alvarado","Cervantes","El alto","SAN JOSE","cristaldorado01@gmil.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"CORPORACION GRUPO Q COSTA RICA SOCIEDAD ANONIMA","Cédula Jurídica","3101025849","25227474",,,,"Cartago","Alvarado","Cervantes","El alto","SAN JOSE","fe@grupoq.co.cr","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"INVERSIONES ABARCA Y LAURITO SOCIEDAD ANONIMA","Cédula Jurídica","3101206593","87047555",,,,"Cartago","Alvarado","Cervantes","Mata de guineo","cartago","fancinvala@hotmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"CAFE EL REY SOCIEDAD ANONIMA","Cédula Jurídica","3101006927","22722323",,,,"Cartago","Alvarado","Cervantes","El alto","cartago","factproveedores@caferey.co.cr","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"INVERSIONES ALONSO Y PIZA S.A","Cédula Jurídica","3101238760","22806058",,,,"San josé","Curridabat","Curridabat","Aromático","CURRIDABAT","FACTURA@MINDS.CR","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"Enersys MVA Costa Rica S.A","Cédula Jurídica","3101343092","411110000",,,,"Cartago","Cartago","Oriental","Ángeles","CARTAGO","fel@enersyscr.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"TIRE DEPOT SOCIEDAD ANONIMA","Cédula Jurídica","3101360967",,,,,"San josé","San josé","Carmen","Aranjuez","SAN JOSE","facturaelectronica@fanast.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"EBISA GLOBAL BRAND SOCIEDAD ANONIMA","Cédula Jurídica","3101734860","22922424",,,,"San josé","Goicoechea","Ipís","Ipís centro","SAN JOSE","fact.ebisa@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"CENTROAMERICANA DE COMERCIO CENCO SOCIEDAD ANONIMA","Cédula Jurídica","3101037641","22938048",,,,"Alajuela","Alajuela","San rafael","San rafael centro","Alajuela","facturafinanzas@cencolab.cr","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"ETIQUETAS PLASTICAS ETIPLAST SOCIEDAD ANONIMA","Cédula Jurídica","3101133134",,,,,"San josé","San josé","San francisco de dos ríos","San francisco de dos ríos centro","SAN JOSE","proveedoresfe@etiplast.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"TRANSPORTES TRC SOCIEDAD ANONIMA","Cédula Jurídica","3101659752","21003987",,,,"Cartago","Cartago","Guadalupe o arenilla","Guadalupe o arenilla centro","cartago","trans.trc@hotmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"GERARDO ENRIQUE LOPEZ TORRES","Cédula Física","303500019","85839601",,,,"Cartago","El guarco","Tobosi","Tobosi centro","cartago","lopezasociados.gerardo@gmai.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"TRANSPORTES EDMORO DE TURRIALBA SOCIEDAD ANONIMA","Cédula Jurídica","3101277344",,,,,"Cartago","Turrialba","Chirripó","Chirripó arriba","cartago","facturasedmoro@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"Junta De Educacion Escuela Primo Cogui Ferrari","Cédula Jurídica","3008051573","25742023 25742223",,,,"Cartago","Paraíso","Santiago",,"frente a la plaza de deportes Ajenjal","esc.ajenjal@mep.go.cr","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado",,
"COMERCIAL INDUSTRIAL Y DE SERVICIOS COSTA RICA ,CISCOSA SOCIEDAD ANONIMA","Cédula Jurídica","3101559064","22585001",,,,"San josé","Curridabat","Tirrases","Tirrases centro","SAN JOSE","ciscosafacturas@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"LIGA AGRICOLA INDUSTRIAL DE LA CAÑA DE AZUCAR","Cédula Jurídica","3007042036","22846000",,,,"Limón","Guácimo","Duacarí","Aguas gatas","CARTAGO","facturas@laica.co.cr","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"REPRESENTACIONES J A MORALES SOCIEDAD ANONIMA","Cédula Jurídica","3101164194","22229628",,,,"Heredia","San isidro","San josé","San josecito","SAN JOSE","facturas@jamorale.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"EMPACADORA AGRICOLA LA TRINIDAD SOCIEDAD ANONIMA","Cédula Jurídica","3101531792","25347858",,,,"Cartago","Alvarado","Cervantes","Cervantes centro","cartago","compras@agricolamorales.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"FRESH CROP EXPORT SOCIEDAD ANONIMA","Cédula Jurídica","3101393815","25344543",,,,"Cartago","Alvarado","Pacayas","Llano grande","cartago","facturacion@freshcrop.net","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"CHAYOTES DEL NORTE SOCIEDAD DE RESPONSABILIDAD LIMITADA","Cédula Jurídica","3102641761","25346124",,,,"Cartago","Alvarado","Cervantes","Cervantes centro","cartago","mafige70@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales",,,
"EDUARDO ANTONIO RAMIREZ LEANDRO","Cédula Física","303410418",,,,,"Cartago","Alvarado","Pacayas","Lourdes","cartago","facturasdistribuidorarg@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"GWA GREEN WORLD ADVENTURES SOCIEDAD ANONIMA","Cédula Jurídica","3101558877","25523269",,,,"Cartago","Cartago","Aguacaliente o san francisco","Aguacaliente o san francisco centro","cartago","fe@gwacr.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"GAS TOMZA DE COSTA RICA SOCIEDAD ANONIMA","Cédula Jurídica","3101349880",,,,,"Cartago","Cartago","San nicolás","Lima","cartago","hmartinez.s@tomza.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"SABRITAS DE COSTA RICA SOCIEDAD DE RESPONSABILIDAD LIMITADA","Cédula Jurídica","3102169101","44042300",,,,"San josé","Desamparados","San rafael arriba","San rafael arriba centro","SAN JOSE","dtecr.prod@einvoicing.signature-cloud.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"ASOCIACION SOLIDARISTA DE EMPLEADOS DE DURMAN ESQUIVEL Y AFINES","Cédula Jurídica","3002078763","24358070",,,,"Alajuela","Río cuarto","Santa isabel","Santa isabel centro","alajuela","facturacionelectronica@asede.co.cr","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"SERENDIPITY DE COSTA RICA SOCIEDAD ANONIMA","Cédula Jurídica","3101127789","25562222",,,,"Cartago","Turrialba","Santa rosa","Santa rosa centro","Turrialba","facturas@serendipityadventures.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"3-101-782331 SOCIEDAD ANONIMA","Cédula Jurídica","3101782331","60592452",,,,"Alajuela","Guatuso","San rafael","San rafael centro","Alajuela","solorzanofrankdavid@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"ASOCIACION SOLIDARISTA DE EMPLEADOS DE RECKITT BENKISER CENTROAMERICANA S A","Cédula Jurídica","3002078479","88879643",,,,"San josé","Escazú","Escazú","Escazú centro","San jose","contabilidadasereckitt@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"AMAZING VACATIONS COSTA RICA SOCIEDAD ANONIMA","Cédula Jurídica","3101760842","83035991",,,,"Cartago","Turrialba","Santa rosa","Santa rosa centro","Turrialba","facturas@amazingvacationscostarica.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"JORGE ENRIQUE SOJO MATA","Cédula Física","304530523","85789537",,,,"Cartago","Alvarado","Cervantes","Cervantes centro","CARTAGO","construfactura0986@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"INDUSTRIAS SALQUI DE CARTAGO LIMITADA","Cédula Jurídica","3102249249","25372885",,,,"Cartago","Cartago","San nicolás","San nicolás","CARTAGO","recepcionfacturas@salqui.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"ALVARO EDUARDO SOJO CAMACHO","Cédula Física","108830356",,,,,"Cartago","Alvarado","Cervantes","Cervantes centro","CARTAGO","a.sojo0982@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"DIX Y VICTORIA SOCIEDAD DE RESPONSABILIDAD LIMITADA","Cédula Jurídica","3102904203","83587622",,,,"Cartago","El guarco","Tobosi","Tobosi centro","cartago","transporteszuniga20@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"EBO CONTACT CENTER SOCIEDAD ANONIMA","Cédula Jurídica","3101729636","40809990",,,,"San josé","Goicoechea","Calle blancos","Calle blancos centro","SAN JOSE","edwinvargasfernandez@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"JUNTA ADMINISTRATIVA DEL SERVICIO ELECTRICO MUNICIPAL DE CARTAGO","Cédula Jurídica","3007045087","25506800",,,,"Cartago","El guarco","Patio de agua","Patio de agua centro","cartago","factura.electronica@jasec.go.cr","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"IMPORTACIONES ISKARLU SOCIEDAD DE RESPONSABILIDAD LIMITADA","Cédula Jurídica","3102801444","87833325",,,,"Alajuela","Naranjo","El rosario","El rosario centro","Alajuela","factura@iskarlu.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"COMPAÑIA NESTLE COSTA RICA SOCIEDAD ANONIMA","Cédula Jurídica","3101177279","22096600",,,,"Heredia","San pablo","San pablo","San pablo centro","Heredia","stan.travel@cr.nestle.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"ALEJANDRO CALDERON RODRIGUEZ","Cédula Física","205940427","86091585",,,,"Alajuela","Grecia","Bolívar","Ángeles","Alajuela","mensajeriacalde@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"DISTRIBUIDORA DE MATERIALES ASOCIADOS DIDEMA SOCIEDAD DE RESPONSABILIDAD LIMITAD","Cédula Jurídica","3102011124","72880250",,,,"San josé","Curridabat","Curridabat","Curridabat centro","SAN JOSE","lfuentes@swteca.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"AVON DE COSTA RICA SOCIEDAD ANONIMA","Cédula Jurídica","3101095143","24320000",,,,"Cartago","El guarco","San isidro","San isidro centro","cartago","facturacontado@avon.cr","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"CHAYOTES DE ALTURA SOCIEDAD ANONIMA","Cédula Jurídica","3101482736","25347249",,,,"Cartago","Alvarado","Cervantes","Aguas (parte)","CARTAGO","compras@chayotesdealtura.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"MANUEL ALBERTO BALDI MADRIGAL","Cédula Física","303000339","89309539",,,,"Cartago","Turrialba","Santa cruz","Santa cruz centro","CARTAGO","albertobaldimadrigal@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"FRANKLIN ALDAMAN ROBINSON ARIAS","Cédula Física","107570815","88111708",,,,"Limón","Siquirres","Siquirres","Siquirres centro","Limon","facturacionrobinson@hotmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"JAEL & NICOLA SOCIEDAD ANONIMA","Cédula Jurídica","3101299272","22693596",,,,"Heredia","Santa bárbara","Jesús",,"heredia","contanbilidad@boecr.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"Alfredo Coto Morales","Cédula Física","106320120","83353345",,,,"San josé","San josé","Carmen",,"San jose","transportescotocr@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"BRYAN ANTONIO PEREZ MENDEZ","Cédula Física","115450955","62231620",,,,"Cartago","Cartago","Carmen",,"cartago","bryanpm023@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"GRUPO AVANZA LIMPIEZAS SOCIEDAD DE RESPONSABILIDAD LIMITADA","Cédula Jurídica","3102666247","22200458",,,,"San josé","San josé","Pavas",,"San jose","fe@grupo-avanza.net","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"MARIA DEL ROSARIO SALAS AGUIRRE","Cédula Física","303870704","87513473",,,,"Cartago","Jiménez","Juan viñas",,"cartago","rosario-312002@hotmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"Encomiendas Centeno Limitada","Cédula Jurídica","3102916366","89309711",,,,"Cartago","Oreamuno","Cipreses",,"Cartago turrialba","facturas@encomiendascenteno.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"DISTRIBUIDORA COMERCIAL ADONAY SOCIEDAD ANONIMA","Cédula Jurídica","3101692365","40012180",,,,"Cartago","Cartago","San nicolás",,"cartago","factura.adonay@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"CORPORACION CAEST SOCIEDAD ANONIMA","Cédula Jurídica","3101443271",,,,,"Alajuela","Alajuela","Garita",,"alajuela","estilos@catalogoestilos.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"BIOLAB INDUSTRIAL SOCIEDAD ANONIMA","Cédula Jurídica","3101081854","85689850",,,,"San josé","Desamparados","San rafael arriba",,"San jose","feasesores@quimusa.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"SONIVISION SOCIEDAD ANONIMA","Cédula Jurídica","3101034067","25803231",,,,"Guanacaste","La cruz","Santa elena",,"San jose","facturaoperacines@sonivision.cocr","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"TRABAJOS Y MANTENIMIENTO TREJOS SOCIEDAD ANONIMA","Cédula Jurídica","3101648471","88774902",,,,"Cartago","Oreamuno","Cipreses",,"cartago","flotade04@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"ELECTROTEC MORALES SOCIEDAD ANONIMA","Cédula Jurídica","3101417260","73006366",,,,"Alajuela","San mateo","San mateo",,"San jose","facturacion@electroteccr.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"DISTRIBUIDORA DE VINOS Y ALIMENTOS POR ALPISTE SOCIEDAD ANONIMA","Cédula Jurídica","3101604064","25870600",,,,"Guanacaste","La cruz","Santa elena",,"San jose","tarjetas@alpiste.co.cr","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"REPAGRO SOCIEDAD ANONIMA","Cédula Juriddica","3101282463","85844588",,,,"Alajuela","Alajuela","San rafael",,"Alajuela","factura@repagro.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"LAM SNACK FOODS COSTA RICA SOCIEDAD ANONIMA","Cédula Jurídica","3101375541",,,,,"Alajuela","Guatuso","Katira",,"cartago","facturacionlams@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"COPEY VINO DE ALTURA LIMITADA","Cédula Jurídica","3102667398","25411489",,,,"San josé","Dota","Copey",,"SAN JOSE","factura@copey.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"CORREOS DE COSTA RICA SOCIEDAD ANONIMA","Cédula Jurídica","3101227869",,,,,"Cartago","Cartago","Carmen",,"cartago","facturaelectronica@correos.go.cr","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"JOSEPH DAVID SOLORZANO CALERO","Cédula Física","113510814","84333682",,,,"Cartago","Alvarado","Cervantes",,"cartago","djdesing7@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"COMPANY ELECTROTECNIA SEQUEIRA Y ROMERO SOCIEDAD DE RESPONSABILIDAD LIMITADA","Cédula Jurídica","3102920996",,,,,"Cartago","Alvarado","Cervantes",,"Cervantes","companysyrrl@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"QUIMICAS MUNDIALES SOCIEDAD ANONIMA","Cédula Jurídica","3101020272","85689850 87888100",,,,"Cartago","Alvarado","Cervantes",,"cartago","feasesores@quimusa.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"ROLANDO MARTIN JIMENEZ CRUZ","Cédula Física","304240936","86046620",,,,"Cartago","Alvarado","Cervantes",,"cartago","soundrolo@hotmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"SOLUCIONES HORTI PET SOCIEDAD DE RESPONSABILIDAD LIMITADA","Cédula Jurídica","3102852748","22333828",,,,"San josé","Tarrazú","San marcos",,"TARRAZU","soluhortipet@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"xitram sa","Cédula Jurídica","3101809423","71528378",,,,"Alajuela","San mateo","San mateo",,"San jose","gastosxitram@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"ANEXA LAB SOCIEDAD ANONIMA","Cédula Jurídica","3101880585","84842586",,,,"San josé","Montes de oca","Mercedes",,"San jose","anexafe@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"CARLOS DANIEL CORDERO SOLANO","Cédula Física","305110454","64579469",,,,"Cartago","Oreamuno","Cipreses",,"cartago","carloscorderosolano041@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"CORPORACION ARROCERA COSTA RICA SOCIEDAD ANONIMA","Cédula Jurídica","3101046884","25056600",,,,"San josé","Santa ana","Uruca",,"San Jose","facturacionelectronica@cacsa.net","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"MONTOYA ALVARADO MARCO JOSUE","Cédula Física","115280729","71508520",,,,"San josé","Curridabat","Curridabat",,"cartago","mjma2011@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"COMERCIAL DE POTENCIA Y MAQUINARIA SOCIEDAD ANONIMA","Cédula Jurídica","3101155082","+506 84611686",,,,"Alajuela","San mateo","San mateo","carmen","San jose","mpcreceptor@mpc.con.cr","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"SISTEMAS LOGICOS INTERNACIONALES SOCIEDAD ANONIMA","Cédula Jurídica","3101135812","+506 22608318",,,,"Heredia","Heredia","Mercedes","MERCEDEZ","HEREDIA","financiero@grupologin.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"SEGURIDAD Y VIGILANCIA SEVIN LIMITADA","Cédula Jurídica","3102067171","+506 22862020",,,,"San josé","Desamparados","San rafael arriba","San josecito (parte)","sanjose","pagos@sevincr.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"JACKSON ARAYA MILTON ANTONIO","Cédula Física","108490908","+506 83169191",,,,"Cartago","Paraíso","Llanos de santa lucia","paraiso","malgaritas","pagosjacksontours@gmil.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"CALDERON RODRIGUEZ FRANKLIN","Cédula Física","302250969","+506 61217394",,,,"Cartago","Jiménez","Juan viñas","Juan Viñas","Juan viñas","calderonrodriguezfranklin@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"FUMIGADORA COROIN CR SOCIEDAD ANONIMA","Cédula Jurídica","3101633999","+506 40016334",,,,,,,,,"facturas@fumigadoracoroin.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"OUTSOURCE EMPRESARIAL SOCIEDAD DE RESPONSABILIDAD LIMITADA","Cédula Jurídica","3102632632","+506 88859037",,,,"San josé","San josé","Pavas","Pavas (centro)","san jose","viaticos.costarica@outsourcela.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"TRANSPORTES Y EQUIPO PESADO BREYBRE SOCIEDAD ANONIMA","Cédula Jurídica","3101401061","+506 40344540",,,,"Cartago","Cartago","Oriental","Estadio","CARTAGO","facturacionbreybre@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"JORGE HUMBERTO PEREIRA DURAN","Cédula Física","304210585","+506 60527999",,,,"Cartago","Paraíso","Santiago","paraiso","CARTAGO","transkokopd@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"AJECEN DEL SUR SOCIEDAD ANONIMA","Cédula Jurídica","3101322767","+506 61580928",,,,,,,,,"edison.ortiz.cr@ajegroup.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"ALQUILERES EIFFEL LIMITADA","Cédula Jurídica","3102177614","+506 22809392",,,,,,,,,"eiffelpagos@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"SERVICIOS INTEGRALES DEL CARIBE SOCIEDAD DE RESPONSABILIDAD LIMITADA","Cédula Jurídica","3102734979",,,,,,,,,,"kennygranados943@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"VILLALOBOS ALVARADO RODOLFO","Cédula Física","701750111",,,,,,,,,,"rvillaa270@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"AGUILAR BORBON PAULO SIMON","Cédula Física","110970721","+506 89189595",,,,"Alajuela","San mateo","San mateo","rio segundo","alajuela","pauloa.buseta@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"YH FO CONEXIONES SOCIEDAD ANONIMA","Cédula Jurídica","3101771163","+506 70433608",,,,"Alajuela","San mateo","San mateo","Barrio (grecia): primavera","alajuela","jimmy@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"RODRIGUEZ MOLINA DANIEL","Cédula Física","602170028",,,,,"Cartago","Alvarado","Pacayas","El alto (parte)","CARTAGO","facturadanielrodriguez@hotmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"SANCHEZ BRENES PABLO DE JESUS","Cédula Física","304590782","+506 87944329",,,,"Cartago","Paraíso","Paraíso","paraiso","CARTAGO","sanchezbrenesp@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"IMPORTADORA ALMACEMA SOCIEDAD ANONIMA","Cédula Jurídica","3101151768",,,,,,,,,,"cuentasporpagar@eckonocr.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"TRANSTUSA SOCIEDAD ANONIMA","Cédula Jurídica","3101038332","+506 22220610",,,,,,,,,"transtiusa.fe@grupocribenos.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"MURILLO GARCIA JUAN CARLOS MANUEL","Cédula Física","107060323","+506 83154116",,,,"Cartago","La unión","San juan","La unión","CARTAGO","facturas.jcmurillo@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"IMPORTADORA MOBIN LIMITADA","Cédula Jurídica","3102758696","+506 25374242",,,,,,,"lima taras",,"mobin.cr.18@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"CECILIANO HERNANDEZ LUIS FERNANDO","Cédula Física","304170841","+506 89611259",,,,"Cartago","Turrialba","Tres equis",,"Turrialba","lcecilianohernandez@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"COCA COLA FEMSA DE COSTA RICA SOCIEDAD ANONIMA","Cédula Jurídica","3101005212",,,,,"San josé","Goicoechea","Calle blancos",,"san jose","gastos.menores@kof.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"GRUPO AGROINDUSTRIAL NUMAR SOCIEDAD ANONIMA","Cédula Jurídica","3101173639","+506 22841000",,,,"San josé","San josé","San sebastián","Cuba","san jose","viaticos@gruponumar.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"CAREJA LIMITADA","Cédula Jurídica","3102808443","+506 61707214",,,,"Cartago","Cartago","Carmen","el carmer","cartago","carejaconta@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"SERVICIOS DE MERCADEO Y ACOMODO DE PRODUCTOS EN GONDOLAS DE SUPERMERCADOS Y OTRO","Cédula Jurídica","3101147254","+506 22603473",,,,,,,,,"facturas.semed@semedsa.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"CALDERON MORALES JUAN MANUEL","Cédula Física","303580088","+506 88155251",,,,"San josé","Desamparados","San rafael arriba","Islas cubas","cartago","chayotesjmc@ghimal.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"INGELECTRA ELECTROMECANICA SOCIEDAD ANONIMA","Cédula Jurídica","3101052613","+506 22864050",,,,"San josé","Santa ana","Uruca",,"SAN JOSE","contabilidad@ingelectra.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"LIBERTY TELECOMUNICACIONES DE COSTA RICA LY SOCIEDAD ANONIMA","Cédula Jurídica","3101610198","+506 40019000",,,,"Cartago","Cartago","Occidental","Cartagos norte","CARTAGO","jo.leon@libertycr.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"CORPORACION CRJUBY  SOCIEDAD DE RESPONSABILIDAD LIMITADA","Cédula Jurídica","3102834639","+506 62212000",,,,"San josé","Goicoechea","Calle blancos","goicochea","SAN JOSE","facturas@crjuby.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"CLAUDEL BRENES BRYAN RODOLFO","Cédula Física","304250181","+506 71069994",,,,"Cartago","Alvarado","Cervantes",,"CARTAGO","profeclaudel@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"ASOCIACION SOLIDARISTA DE EMPLEADOS DE UNILEVER DE CENTROAMERICA Y AFINES","Cédula Jurídica","3002454356","+506 72024616",,,,"Heredia","Belén","La ribera","cuba","san jose","facturasaseunilever@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado",,
"ASOCIACION DE SERVICIOS MEDICOS PARA EL BIEN SOCIAL","Cédula Jurídica","3002116886","+506 22169000",,,,"Cartago","Cartago","Guadalupe o arenilla","Cartagos","cartago","facturaelectronica@asenbis.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"M C LOGISTICA SOCIEDAD ANONIMA","Cédula Jurídica","3101054797","+506 22781122",,,,,,,,,"factura.electronica.recibo@mclogistica.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"BELINA NUTRICION ANIMAL SOCIEDAD ANONIMA","Cédula Jurídica","3101629298","+506 24300527",,,,"Alajuela","Alajuela","Río Segundo","rio segundo","Alajuela","facturaelectronica@belina.co.cr","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"SERVICIOS AGROPUECUARIOS CUBANO SOCIEDAD DE RESPONSABILIDAD LIMITADA","Cédula Jurídica","3102857847","+506 87718253",,,,,,,,,"seacubano@gmaiol.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"SOLANO ZAMORA GABRIEL","Cédula Física","304710202","+506 85821415",,,,"San josé","Desamparados","San rafael arriba","Paraiso","CARTAGO","gabrielpercufactura@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"MARTINEZ GRANADOS VICTOR MANUEL","Cédula Física","304370486","+506 63579961",,,,"Cartago","Alvarado","Cervantes","El alto","CARTAGO","manuelmj1989@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"ANITA FRUIT CR SOCIEDAD DE RESPONSABILIDAD LIMITADA","Cédula Jurídica","3102659329","+506 84464656",,,,"Heredia","Santo domingo","Santo tomás","San miguel","HEREDIA","facturas-Anita@hotmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"CINEMA TURRIALBA SOCIEDAD ANONIMA","Cédula Jurídica","3101696394","+506 72918785",,,,"Cartago","Turrialba","Tuis","turrialba","Turrialba","laguero@josast.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"CORPORACION DE COMPANIAS AGROINDUSTRIALES CCA SOCIEDAD DE RESPONSABILIDAD LIMITA","Cédula Jurídica","3102085278","+506 25828400",,,,,,,,,"cr_viaticoa_da@wal-mart.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"MANPOWER COSTA RICA SOCIEDAD ANONIMA","Cédula Jurídica","3101212545","+506 71379901",,,,,,,,,"jacobsaul23@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"ADEMAR ASOCIADOS SOCIEDAD ANONIMA","Cédula Jurídica","3101717420","+506 64657099",,,,"Cartago","Cartago","Guadalupe o arenilla","El alto","cartago","conta@ademar.lat","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"GRUPO SANTAMARIA SOCIEDAD ANONIMA","Cédula Jurídica","3101397345","+506 24535450",,,,,,,,,"factura@gruposantamaria.cr","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"VALLE DE PAZ SERVICIOS FUNERARIOS SOCIEDAD ANONIMA","Cédula Jurídica","3101318985","+506 40355800",,,,"San josé","Desamparados","San rafael arriba","Paraiso","CARTAGO","infocontavilidadfyc@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"ASOCIACION ADMINISTRADORA DEL ACUEDUCTO Y ALCANTARILLADO SANITARIO DE LA FLOR DI","Cédula Jurídica","3002320248","+506 84592929",,,,"San josé","Desamparados","San rafael arriba","cervante","CARTAGO","asedalaflor@hotmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"JUNTA EDUCACION LAS MESAS DE SANTIAGO DE PARAISO ESCUELA MARIO PACHECO SAENZ","Cédula Jurídica","3008051572",,,,,,,,,,,"Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"C R G TOYS SOCIEDAD ANONIMA","Cédula Jurídica","3101237976","+506 25201234",,,,"San josé","Santa ana","Uruca",,"san jose","conta@crgtoys.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"AQUATRECE COSTA RICA SOCIEDAD ANONIMA","Cédula Jurídica","3101895574","+506 21004787",,,,"Alajuela","Palmares","Palmares",,"alajuela","cr.administracion@aquatrece.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"ESTRUCONSULT SOCIEDAD ANONIMA","Cédula Jurídica","3101254525","+506 22904070",,,,"San josé","San josé","Uruca","robedal","san jose","facturacion@estru.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"ADVERTISING Y PROMOTION SOCIEDAD ANONIMA","Cédula Jurídica","3101328739","+506 83102206",,,,"Cartago","Cartago","Carmen","occidental","CARTAGO","facturas.cr@ayp.mx","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"COMUNICACIONES METROPOLITANAS METROCOM SOCIEDAD ANONIMA","Cédula Jurídica","3101744218","+506 22893365",,,,"San josé","San josé","Uruca","El alto (parte)","san jose","fe@metrocom.cr","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"SUPER BATERIAS O C SOCIEDAD ANONIMA","Cédula Jurídica","3101358818","+506 22195454",,,,"Cartago","Cartago","Carmen","Paraiso","CARTAGO","contabilidad@superbaterias.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"AGROSUPERIOR SOCIEDAD ANONIMA","Cédula Jurídica","3101272187","+506 22105300",,,,"San josé","Santa ana","Uruca",,"SAN JOSE","proveedores@agrosuperior.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"A UNO CALIBRATION LABORATORY SOCIEDAD ANONIMA","Cédula Jurídica","3101495500",,,,,"Alajuela","Alajuela","Río segundo",,"ALAJUELA","facturas@a1calibrationcr.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"SYNGENTA CROP PROTECTION, SOCIEDAD ANONIMA","Cédula Jurídica","3012383664","+506 70993036",,,,,,,,,"costarica.recepcionfacturas@syngenta.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"EXPLORNATURA SOCIEDAD ANONIMA","Cédula Jurídica","3101243619",,,,,,,,,,"contabilidad2@explornatura.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"AGROINDUSTRIAL PROAVE SOCIEDAD ANONIMA","Cédula Jurídica","3101274846",,,,,,,,,,"cajachicacr@somoscmi.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"GRUPO VELCA G.V.C  SOCIEDAD ANONIMA","Cédula Jurídica","3101620273",,,,,,,,,,"felectronica@grupovelca.cr","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"SERVICIOS FEMAROCA TV SOCIEDAD ANONIMA","Cédula Jurídica","3101335938","+506 25341000",,,,"Cartago","Oreamuno","San Rafael","San rafael","Cartago","facturacion@tekicr.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"COARSA SOCIEDAD ANONIMA","Cédula Jurídica","3101251945","+506 24471959",,,,,,,,,"contabilidad@coarsacr.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"COOPERATIVA DE PRODUCTORES DE LECHE DOS PINOS R L","Cédula Jurídica","3004045002","+506 24373000",,,,,,,,,"gastos@dospinos.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"AGENCIAS FEDURO COSTA RICA SOCIEDAD ANONIMA","Cédula Jurídica","3101337371",,,,,,,,,,"facturaelectrinica.cr@feduro.net","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"COMPANIA DE GALLETAS POZUELO DCR SOCIEDAD ANONIMA","Cédula Jurídica","3101420995",,,,,,,,,,"fe@pozuelo.cr","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"MUNICIPALIDAD DE TURRIALBA","Cédula Jurídica","3114042088",,,,,,,,,,"yoelvr@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"CORPORACION FRIONET SOCIEDAD ANONIMA","Cédula Jurídica","3101606254","+506 25890654",,,,,,,,,"cuentasporcobrar@mayca.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"THERMOSOLUTIONS GROUP SOCIEDAD ANONIMA","Cédula Jurídica","3101562833","+506 22034616",,,,"San josé","Santa ana","Santa ana",,"san jose","factura@rinnai.cr","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"DILPROM COSTA RICA SOCIEDAD ANONIMA","Cédula Jurídica","3101687172","+506 88697634",,,,"San josé","Desamparados","Desamparados",,"san jose","gcampos@dilpromcr.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"CTVS COMERCIALIZADORA DE TELEVISION SATELITAL SOCIEDAD ANONIMA","Cédula Jurídica","3101550632","+506 62739166",,,,,,,,,"katymila.leon@yahoo.es","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"ALIMENTOS PROSALUD SOCIEDAD ANONIMA","Cédula Jurídica","3101018721","+506 25047676",,,,"San José","Curridabat","Curridabat","San rafael","san jose","recepcionfe@prosalud.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"MEGA LINEAS SOCIEDAD ANONIMA","Cédula Jurídica","3101202562",,,,,,,,,,,"Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"SALAZAR COMUNICACION SOCIEDAD ANONIMA","Cédula Jurídica","3101196737","+506 71979604",,,,"San josé","Montes de oca","San rafael",,"san jose","contabilidad@salconsa.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"JOSHUA GILBERTO GUZMAN CONEJO","Cédula Física","112490161","+506 89186768",,,,,,,,,"jouverikcrc@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"CANO Y FAJARDO INDUSTRIAL SOCIEDAD ANONIMA","Cédula Jurídica","3101253824","+506 25370944",,,,,,,,,"facturacion@cyfindustrial.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"NICK JHOE AGUILAR HERNANDEZ","Cédula Física","305710044","+506 84500968",,,,,,,,,"nickaguilar@corolesa.net","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"SERVIFOGEL SOCIEDAD ANONIMA","Cédula Jurídica","3101337620","+506 22445530",,,,,,,,,"garaya@electrofriocr.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"YEIMIE PAUL PEREIRA SANABRIA","Cédula Física","303990125","+506 86899481",,,,,,,,,"paulpereiramh@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"COOLTOUCH NATIONAL COMPANY SOCIEDAD ANONIMA","Cédula Jurídica","3101607089","+506 22345463",,,,,,,,,"factura.electronica@cooltouchcr.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"3-101-011167 SOCIEDAD ANONIMA","Cédula Jurídica","3101011167","+506 83709574",,,,,,,,,"p@grupomoreno.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"INVERSIONES BERJUMI SOCIEDAD ANONIMA","Cédula Jurídica","3101795125",,,,,,,,,,"berjumicr@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"ALMACIGOS PACAYAS","Cédula Jurídica","3101242413","+506 25344485",,,"","Cartago","Alvarado","Pacayas","El alto (parte)","PACAYAS","facturacion@almacigospacayas.com",,,,,
"EL COLONO AGROPECUARIO SOCIEDAD ANONIMA","Cédula Jurídica","3101268981","+506 27996000",,,,"Limón","Pococí","Colorado","moin","limon","feagropecuario@grupocolono.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"INNOVATIVE AGRICULTURAL PRODUCTS SOCIEDAD ANONIMA","Cédula Jurídica","3101405067","+506 22018889",,,,,,,,,"factura@innovaagri.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"EXPLOSIVOS INDUSTRIALES EXPLOINSA SOCIEDAD ANONIMA","Cédula Jurídica","3101239210",,,,,,,,,,"info@exploinsa.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"CONSTRUCCION Y ELECTROMECANICA ARCOL RV  SOCIEDAD DE RESPONSABILIDAD LIMITADA","Cédula Jurídica","3102833866","+506 83372092",,,,,,,,,"contabilidad@arcol-cr.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"PUNTA DE LANZA UREK SOCIEDAD ANONIMA","Cédula Jurídica","3101407503","+506 63375265",,,,,,,,,"puntadelanzaurek@yahoo.es","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"MARVIN ASDRUBAL MARTINEZ ULLOA","Cédula Física","108870295","+506 60344992",,,,,,,,,"martinesfacturacion@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"PRODUCTORA AGRICOLA MARMO SOCIEDAD ANONIMA","Cédula Jurídica","3101901270","+506 89533012",,,,"Cartago","Alvarado","Capellades",,"Cervantes","agricolamarmo.fe@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"FUMIGADORA CONTROL TECNICO DE PLAGAS SOCIEDAD ANONIMA","Cédula Jurídica","3101193878","+506 22581875",,,,,,,,,"cynthia.guillen@rentokil.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"TRES CIENTO UNO CINCUENTA Y CUATRO MIL DOSCIENTOS SESENTA Y CUATRO SOCIEDAD ANONIMA","Cédula Jurídica","3101054264",,,,,,,,,,"emisionfegfi@gficr.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"CONSTRUCCIONES GOSTEM SOCIEDAD ANONIMA","Cédula Jurídica","3101469473",,,,,,,,,,"facturaionems5@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"MARCO VINICIO SANCHEZ MONTERO","Cédula Física","108320432","+506 70998414",,,,"Cartago","Cartago","Oriental",,"cartago","marcov090972@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"TYCKLE DE TURRIALBA SOCIEDAD ANONIMA","Cédula Jurídica","3101503429","+506 71111208",,,,,,,,,"accounts@costaricarios.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"CORPORACION DE SERVICIOS MULTIPLES DEL MAGISTERIO NACIONAL","Cédula Jurídica","3007071587","+506 22221346",,,,,,,,,"facturaelectronica@csmmn.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"IMPORTADORA DE INSUMOS AGRICOLAS E INDUSTRIALES SOCIEDAD DE RESPONSABILIDAD LIMITADA","Cédula Jurídica","3102750649","+506 22150323",,,,"Cartago","Oreamuno","Cipreses",,"Cartago","macc@insagricr.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"INSTACREDIT SOCIEDAD ANONIMA","Cédula Jurídica","3101264096","+506 25523909",,,,,,,,,"facturasporpagar@instacredit.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"SUSANA MARIA CHACON CHAVARRIA","Cédula Física","304010196","+506 83219363",,,,"San josé","Montes de oca","Sabanilla","Sabanillas","san jose","facturasdreamlab@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General",
"MONICA MARIA QUIROS MUÑOZ","Cédula Física","304790109","+506 83172598",,,,,,,,,"monifacturas13@gmail.com","Cuentas por cobrar clientes nacionales","Cuentas por pagar a proveedores nacionales","De contado","General"`;
