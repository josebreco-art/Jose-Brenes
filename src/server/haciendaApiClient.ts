/**
 * Ministerio de Hacienda de Costa Rica (DGT)
 * Endpoints Oficiales para Entornos Staging (Sandbox) y Producción
 */
export const HACIENDA_URLS = {
  STAGING: {
    AUTH_TOKEN_URL: 'https://idp.comprobanteselectronicos.go.cr/auth/realms/rut-stag/protocol/openid-connect/token',
    RECEPCION_URL: 'https://api-sandbox.comprobanteselectronicos.go.cr/recepcion/v1/recepcion',
    CONSULTA_URL: 'https://api-sandbox.comprobanteselectronicos.go.cr/recepcion/v1/recepcion', // + /{clave}
    CLIENT_ID: 'api-stag'
  },
  PRODUCTION: {
    AUTH_TOKEN_URL: 'https://idp.comprobanteselectronicos.go.cr/auth/realms/rut/protocol/openid-connect/token',
    RECEPCION_URL: 'https://api.comprobanteselectronicos.go.cr/recepcion/v1/recepcion',
    CONSULTA_URL: 'https://api.comprobanteselectronicos.go.cr/recepcion/v1/recepcion', // + /{clave}
    CLIENT_ID: 'api-prod'
  }
};

export interface HaciendaTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_expires_in: number;
  refresh_token: string;
  token_type: string;
  session_state: string;
  scope: string;
  error?: string;
  error_description?: string;
}

export interface HaciendaSendPayload {
  clave: string; // 50 dígitos
  fecha: string; // ISO 8601
  emisor: {
    tipoIdentificacion: string;
    numeroIdentificacion: string;
  };
  receptor?: {
    tipoIdentificacion?: string;
    numeroIdentificacion?: string;
  };
  comprobanteXml: string; // XML firmado o generado en Base64
}

export interface HaciendaConsultaResponse {
  clave: string;
  fecha: string;
  'ind-estado'?: 'aceptado' | 'rechazado' | 'procesando' | 'recibido' | string;
  indEstado?: 'aceptado' | 'rechazado' | 'procesando' | 'recibido' | string;
  'respuesta-xml'?: string; // Base64 del MensajeHacienda
  respuestaXml?: string;
}

export interface HaciendaConsultaResult {
  success: boolean;
  httpStatus: number;
  endpoint: string;
  status: 'aceptado' | 'rechazado' | 'procesando' | 'recibido' | 'no_encontrado' | 'error';
  indEstadoOriginal?: string;
  messageXml?: string;
  haciendaMessageCode?: '1' | '2' | '3' | string; // 1: Aceptado, 2: Aceptado Parcial, 3: Rechazado
  haciendaDetailMessage?: string;
  raw: any;
  error?: string;
}

interface CachedToken {
  token: string;
  expiresAt: number; // Timestamp en ms
}

const tokenCache: Record<string, CachedToken> = {};

export class HaciendaApiClient {
  /**
   * Limpia el caché de tokens si ocurre un error 401 Unauthorized
   */
  public static invalidateTokenCache(environment?: 'STAGING' | 'PRODUCTION', username?: string): void {
    if (environment && username) {
      delete tokenCache[`${environment}:${username.trim()}`];
    } else {
      for (const key of Object.keys(tokenCache)) {
        delete tokenCache[key];
      }
    }
  }

  /**
   * Obtiene Token OAuth2 desde el IDP de Hacienda (Keycloak) con caché en memoria inteligente
   */
  public static async getAccessToken(params: {
    username: string;
    password: string;
    environment: 'STAGING' | 'PRODUCTION';
    forceRefresh?: boolean;
  }): Promise<{ success: boolean; token?: string; expiresIn?: number; error?: string }> {
    try {
      const cacheKey = `${params.environment}:${params.username.trim()}`;
      const cached = tokenCache[cacheKey];

      // Reutilizar token si está vigente con un margen de seguridad de 45 segundos
      if (!params.forceRefresh && cached && cached.expiresAt > Date.now() + 45000) {
        return {
          success: true,
          token: cached.token,
          expiresIn: Math.round((cached.expiresAt - Date.now()) / 1000)
        };
      }

      const urls = params.environment === 'PRODUCTION' ? HACIENDA_URLS.PRODUCTION : HACIENDA_URLS.STAGING;
      
      const formData = new URLSearchParams();
      formData.append('grant_type', 'password');
      formData.append('client_id', urls.CLIENT_ID);
      formData.append('username', params.username.trim());
      formData.append('password', params.password.trim());

      const response = await fetch(urls.AUTH_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData.toString()
      });

      const text = await response.text().catch(() => '');
      let data: HaciendaTokenResponse;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        const preview = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 150);
        return {
          success: false,
          error: `Hacienda IDP respondió HTTP ${response.status} (${preview || 'Service Unavailable'}). El servicio de Hacienda puede estar en mantenimiento temporal.`
        };
      }

      if (!response.ok || !data.access_token) {
        return {
          success: false,
          error: data.error_description || data.error || `HTTP ${response.status}: Error de autenticación en Hacienda`
        };
      }

      const expiresInSec = Number(data.expires_in) || 300;
      tokenCache[cacheKey] = {
        token: data.access_token,
        expiresAt: Date.now() + (expiresInSec * 1000)
      };

      return {
        success: true,
        token: data.access_token,
        expiresIn: expiresInSec
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Fallo de conexión con Hacienda IDP: ${err.message}`
      };
    }
  }

  /**
   * Envía un Comprobante Electrónico (XML en Base64) al Ministerio de Hacienda
   */
  public static async sendDocument(params: {
    token: string;
    environment: 'STAGING' | 'PRODUCTION';
    payload: HaciendaSendPayload;
  }): Promise<{ success: boolean; status: number; endpoint: string; message: string; rawResponse?: any; data?: any }> {
    const urls = params.environment === 'PRODUCTION' ? HACIENDA_URLS.PRODUCTION : HACIENDA_URLS.STAGING;
    const endpoint = urls.RECEPCION_URL;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${params.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(params.payload)
      });

      // Hacienda responde 202 Accepted si el documento fue recibido a procesamiento
      if (response.status === 202 || response.status === 200) {
        const text = await response.text().catch(() => '');
        let parsed: any = null;
        try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }

        return {
          success: true,
          status: response.status,
          endpoint,
          message: 'Documento recibido exitosamente por el Ministerio de Hacienda (HTTP 202 Accepted)',
          rawResponse: parsed || { status: response.status, statusText: response.statusText }
        };
      }

      const errorText = await response.text().catch(() => '');
      let parsedError: any = null;
      try { parsedError = errorText ? JSON.parse(errorText) : null; } catch { parsedError = errorText; }

      return {
        success: false,
        status: response.status,
        endpoint,
        message: `Hacienda rechazó la recepción (HTTP ${response.status}): ${errorText}`,
        rawResponse: parsedError || errorText
      };
    } catch (err: any) {
      return {
        success: false,
        status: 0,
        endpoint,
        message: `Error al conectar con endpoint de recepción de Hacienda: ${err.message}`,
        rawResponse: err.message
      };
    }
  }

  /**
   * Consulta el estado de un comprobante mediante su Clave de 50 Dígitos
   */
  public static async queryDocumentStatus(params: {
    token: string;
    environment: 'STAGING' | 'PRODUCTION';
    clave50: string;
  }): Promise<HaciendaConsultaResult> {
    const urls = params.environment === 'PRODUCTION' ? HACIENDA_URLS.PRODUCTION : HACIENDA_URLS.STAGING;
    const cleanClave = params.clave50.trim();
    const endpoint = `${urls.CONSULTA_URL}/${cleanClave}`;

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${params.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 404) {
        const text404 = await response.text().catch(() => '');
        return {
          success: false,
          httpStatus: 404,
          endpoint,
          status: 'no_encontrado',
          haciendaDetailMessage: 'El comprobante aún no figura registrado en los servidores de Hacienda',
          raw: text404 || 'HTTP 404 Not Found'
        };
      }

      if (response.ok) {
        const textOk = await response.text().catch(() => '');
        let rawJson: any = {};
        try {
          rawJson = textOk ? JSON.parse(textOk) : {};
        } catch {
          rawJson = {};
        }
        
        // El API oficial de Hacienda DGT v1 usa 'ind-estado' (con guión), pero admitimos compatibilidad
        const rawEstadoStr = String(rawJson['ind-estado'] || rawJson.indEstado || rawJson.status || '').toLowerCase().trim();
        const base64Xml = rawJson['respuesta-xml'] || rawJson.respuestaXml || rawJson.comprobanteXml;

        let decodedXml: string | undefined;
        let haciendaMessageCode: string | undefined;
        let haciendaDetailMessage: string | undefined;

        if (base64Xml && typeof base64Xml === 'string') {
          try {
            decodedXml = Buffer.from(base64Xml, 'base64').toString('utf-8');
            
            // Extraer <Mensaje> y <DetalleMensaje> de MensajeHacienda si existen
            const matchMensaje = decodedXml.match(/<Mensaje>([^<]+)<\/Mensaje>/i);
            if (matchMensaje) {
              haciendaMessageCode = matchMensaje[1].trim();
            }
            const matchDetalle = decodedXml.match(/<DetalleMensaje>([\s\S]*?)<\/DetalleMensaje>/i);
            if (matchDetalle) {
              haciendaDetailMessage = matchDetalle[1].trim();
            }
          } catch (decodeErr) {
            console.warn('[HaciendaApiClient] Error decodificando respuesta-xml:', decodeErr);
            decodedXml = base64Xml;
          }
        }

        // Mapear estado
        let resolvedStatus: 'aceptado' | 'rechazado' | 'procesando' | 'recibido' = 'procesando';
        if (rawEstadoStr === 'aceptado' || haciendaMessageCode === '1') {
          resolvedStatus = 'aceptado';
          if (!haciendaDetailMessage) haciendaDetailMessage = 'Comprobante Aceptado por el Ministerio de Hacienda';
        } else if (rawEstadoStr === 'rechazado' || haciendaMessageCode === '3') {
          resolvedStatus = 'rechazado';
          if (!haciendaDetailMessage) haciendaDetailMessage = 'Comprobante Rechazado por el Ministerio de Hacienda';
        } else if (rawEstadoStr === 'recibido') {
          resolvedStatus = 'recibido';
          if (!haciendaDetailMessage) haciendaDetailMessage = 'Comprobante recibido por Hacienda, en cola de validación';
        } else {
          resolvedStatus = 'procesando';
          if (!haciendaDetailMessage) haciendaDetailMessage = 'Comprobante en procesamiento en servidores de Hacienda';
        }

        return {
          success: true,
          httpStatus: response.status,
          endpoint,
          status: resolvedStatus,
          indEstadoOriginal: rawEstadoStr,
          messageXml: decodedXml,
          haciendaMessageCode,
          haciendaDetailMessage,
          raw: rawJson
        };
      }

      const errorText = await response.text().catch(() => '');
      let parsedErr: any = null;
      try { parsedErr = JSON.parse(errorText); } catch { parsedErr = errorText; }

      return {
        success: false,
        httpStatus: response.status,
        endpoint,
        status: 'error',
        haciendaDetailMessage: `HTTP ${response.status}: ${errorText}`,
        raw: parsedErr || errorText,
        error: `HTTP ${response.status}: ${errorText}`
      };
    } catch (err: any) {
      return {
        success: false,
        httpStatus: 0,
        endpoint,
        status: 'error',
        haciendaDetailMessage: `Error de red o conexión con Hacienda: ${err.message}`,
        raw: err.message,
        error: err.message
      };
    }
  }
}
