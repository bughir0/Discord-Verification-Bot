import logger from './logger.js';
import crypto from 'crypto';

/**
 * Busca o XUID (Xbox User ID) de um jogador Bedrock
 * @param {string} username - Nome de usuário do Bedrock
 * @returns {Promise<{xuid: string, uuid: string, name: string} | null>} - XUID, UUID formatada e nome, ou null se não encontrado
 */
export async function getBedrockUUID(username) {
    try {
        const trimmedUsername = username.trim();
        
        // Para servidores GeyserMC, a UUID do Bedrock é gerada a partir do XUID
        // Vamos tentar buscar o XUID primeiro
        const xuid = await getBedrockXUID(trimmedUsername);
        
        if (xuid) {
            // Converter XUID para UUID no formato usado pelo GeyserMC
            // GeyserMC usa um formato específico: 00000000-0000-0000-XXXX-XXXXXXXXXXXX
            // onde XXXX é o XUID convertido
            const uuid = convertXUIDToUUID(xuid);
            
            logger.info('UUID do Bedrock encontrada', {
                username: trimmedUsername,
                xuid: xuid,
                uuid: uuid
            });
            
            return {
                uuid: uuid,
                name: trimmedUsername,
                xuid: xuid,
                source: 'bedrock-xbox'
            };
        }
        
        // Se não encontrou XUID, tentar gerar UUID offline para Bedrock
        // Bedrock também pode usar UUID offline em alguns casos
        const offlineUUID = calculateBedrockOfflineUUID(trimmedUsername);
        
        logger.info('UUID do Bedrock gerada (offline)', {
            username: trimmedUsername,
            uuid: offlineUUID
        });
        
        return {
            uuid: offlineUUID,
            name: trimmedUsername,
            source: 'bedrock-offline'
        };
    } catch (error) {
        logger.error('Erro ao buscar UUID do Bedrock', {
            error: error.message,
            username: username,
            stack: error.stack
        });
        return null;
    }
}

/**
 * Busca o XUID de um jogador Bedrock usando a API do GeyserMC
 * @param {string} username - Nome de usuário do Bedrock
 * @returns {Promise<string | null>} - XUID do jogador ou null se não encontrado
 */
async function getBedrockXUID(username) {
    try {
        // API do GeyserMC para buscar XUID
        // Esta API é pública e permite buscar informações de jogadores Bedrock
        const response = await fetch(`https://api.geysermc.org/v2/xbox/xuid/${encodeURIComponent(username)}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Minecraft-Whitelist-Bot/1.0'
            }
        });

        if (response.ok) {
            const data = await response.json();
            if (data && data.xuid) {
                return data.xuid.toString();
            }
        }
        
        // Se a API do GeyserMC não retornar, tentar calcular UUID offline
        // Para servidores offline, o Bedrock também pode usar UUID calculada
        logger.debug('API do GeyserMC não retornou XUID, usando cálculo offline', {
            username: username
        });
        
        return null;
    } catch (error) {
        logger.debug('Erro ao buscar XUID do Bedrock', {
            error: error.message,
            username: username
        });
        return null;
    }
}

/**
 * Converte XUID para UUID no formato usado pelo GeyserMC
 * @param {string} xuid - XUID do jogador
 * @returns {string} - UUID formatada
 */
function convertXUIDToUUID(xuid) {
    // GeyserMC usa um formato específico para UUIDs do Bedrock
    // Formato: 00000000-0000-0000-XXXX-XXXXXXXXXXXX
    // Onde os 16 últimos dígitos em hex são derivados diretamente do XUID
    //
    // Exemplo real:
    //  - XUID em hex: 000901fdfbb92799
    //  - UUID final : 00000000-0000-0000-0009-01fdfbb92799
    //
    // Ou seja:
    //  - Pegamos o XUID em hex, preenchido à ESQUERDA até 16 dígitos
    //  - Os 4 primeiros dígitos viram o 4º bloco
    //  - Os 12 restantes viram o 5º bloco
    
    // Converter XUID para hex e preencher com zeros até 16 dígitos
    const xuidHex = BigInt(xuid).toString(16).padStart(16, '0');
    
    // Montar a UUID no formato esperado pelo Geyser/Bedrock
    const uuid = `00000000-0000-0000-${xuidHex.substring(0, 4)}-${xuidHex.substring(4)}`;
    
    return uuid;
}

/**
 * Calcula UUID offline para Bedrock (fallback)
 * @param {string} username - Nome de usuário do Bedrock
 * @returns {string} - UUID calculada
 */
function calculateBedrockOfflineUUID(username) {
    // Para Bedrock offline, usar algoritmo similar ao Java mas com namespace diferente
    const stringToHash = 'BedrockPlayer:' + username.trim();
    
    // Gerar MD5 hash
    const hash = crypto.createHash('md5').update(stringToHash, 'utf8').digest();
    
    // Converter para UUID v3
    hash[6] = (hash[6] & 0x0f) | 0x30; // Versão 3
    hash[8] = (hash[8] & 0x3f) | 0x80; // Variante RFC 4122
    
    // Converter bytes para UUID formatado
    const hex = Array.from(hash)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    
    return formatUUID(hex);
}

/**
 * Formata UUID removendo hífens e adicionando novamente no formato correto
 * @param {string} uuid - UUID sem ou com hífens
 * @returns {string} - UUID formatado com hífens
 */
function formatUUID(uuid) {
    // Remove hífens se existirem
    const cleanUUID = uuid.replace(/-/g, '');
    
    // Adiciona hífens no formato: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    return `${cleanUUID.substring(0, 8)}-${cleanUUID.substring(8, 12)}-${cleanUUID.substring(12, 16)}-${cleanUUID.substring(16, 20)}-${cleanUUID.substring(20)}`;
}

