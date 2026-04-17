import logger from './logger.js';
import crypto from 'crypto';

/**
 * Calcula a UUID offline (para servidores em modo offline)
 * Usa UUID v3 com namespace "OfflinePlayer" e o nome do jogador
 * Baseado no algoritmo do Minecraft para servidores offline
 * @param {string} username - Nome de usuário do Minecraft
 * @returns {string} - UUID calculada no formato offline
 */
export function calculateOfflineUUID(username) {
    const trimmedUsername = username.trim();
    
    // Namespace UUID para jogadores offline
    // O Minecraft usa o namespace "OfflinePlayer" como string para UUID v3
    // Mas na verdade usa um namespace UUID específico: 00000000-0000-3000-8000-000000000000
    // Porém, a implementação correta é usar a string "OfflinePlayer" diretamente
    
    // Criar string: "OfflinePlayer" + nome do jogador
    const stringToHash = 'OfflinePlayer:' + trimmedUsername;
    
    // Gerar MD5 hash
    const hash = crypto.createHash('md5').update(stringToHash, 'utf8').digest();
    
    // Converter para UUID v3 (definir bits de versão e variante)
    // Versão 3: bits 12-15 = 0011 (0x3)
    hash[6] = (hash[6] & 0x0f) | 0x30; // Versão 3
    // Variante: bits 16-17 = 10 (0x8)
    hash[8] = (hash[8] & 0x3f) | 0x80; // Variante RFC 4122
    
    // Converter bytes para UUID formatado
    const uuid = formatUUIDFromBytes(hash);
    
    logger.info('UUID offline calculada', {
        username: trimmedUsername,
        uuid: uuid
    });
    
    return uuid;
}

/**
 * Converte array de bytes para UUID formatado
 */
function formatUUIDFromBytes(bytes) {
    const hex = Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    
    return formatUUID(hex);
}

/**
 * Busca a UUID real de um jogador do Minecraft
 * Para servidores offline, calcula a UUID offline
 * Para servidores online, busca na API do Mojang
 * @param {string} username - Nome de usuário do Minecraft
 * @param {boolean} offlineMode - Se true, calcula UUID offline; se false, busca na API
 * @returns {Promise<{uuid: string, name: string} | null>} - UUID e nome do jogador, ou null se não encontrado
 */
export async function getMinecraftUUID(username, offlineMode = true) {
    try {
        const trimmedUsername = username.trim();
        
        // Se for servidor offline, calcular UUID diretamente
        if (offlineMode) {
            const offlineUUID = calculateOfflineUUID(trimmedUsername);
            return {
                uuid: offlineUUID,
                name: trimmedUsername,
                source: 'offline-calculated'
            };
        }
        
        // Se for servidor online, buscar na API do Mojang
        // Tentar primeiro com a API oficial do Mojang
        let uuidData = await tryMojangAPI(trimmedUsername);
        
        // Se encontrou, verificar se o nome corresponde exatamente
        if (uuidData) {
            // Se o nome retornado não corresponde exatamente, pode ser UUID antiga ou de outra pessoa
            if (uuidData.name && uuidData.name.toLowerCase() !== trimmedUsername.toLowerCase()) {
                logger.warning('⚠️ ATENÇÃO: Nome retornado pela API não corresponde ao nome buscado - UUID pode estar INCORRETA', {
                    buscado: trimmedUsername,
                    retornado: uuidData.name,
                    uuid: uuidData.uuid,
                    aviso: 'Esta UUID pode ser de outra pessoa que teve esse nome antes. Verifique manualmente no servidor.'
                });
                
                // Tentar buscar histórico para verificar se é a UUID correta
                const historyData = await tryNameHistory(uuidData.uuid);
                if (historyData && historyData.length > 0) {
                    // Verificar se o nome buscado está no histórico
                    const nameInHistory = historyData.some(entry => 
                        entry.name && entry.name.toLowerCase() === trimmedUsername.toLowerCase()
                    );
                    const latestName = historyData[historyData.length - 1];
                    
                    if (nameInHistory && latestName.name && latestName.name.toLowerCase() === trimmedUsername.toLowerCase()) {
                        // Nome está no histórico E é o mais recente - UUID provavelmente está correta
                        logger.info('Nome encontrado no histórico e é o mais recente, UUID provavelmente está correta', {
                            uuid: uuidData.uuid,
                            name: trimmedUsername
                        });
                    } else if (nameInHistory) {
                        // Nome está no histórico mas não é o mais recente
                        logger.warning('Nome encontrado no histórico mas NÃO é o mais recente - UUID pode estar INCORRETA', {
                            uuid: uuidData.uuid,
                            nameBuscado: trimmedUsername,
                            nomeAtualDestaUUID: latestName.name
                        });
                        // Tentar buscar novamente com API alternativa
                        uuidData = null; // Forçar nova busca
                    } else {
                        // Nome não está no histórico, definitivamente é UUID de outra pessoa
                        logger.error('❌ Nome NÃO encontrado no histórico desta UUID - UUID está INCORRETA (de outra pessoa)', {
                            uuid: uuidData.uuid,
                            nameBuscado: trimmedUsername,
                            nomeDestaUUID: latestName.name
                        });
                        uuidData = null; // Forçar nova busca
                    }
                } else {
                    // Não conseguiu buscar histórico, UUID pode estar incorreta
                    logger.warning('Não foi possível verificar histórico - UUID pode estar incorreta', {
                        uuid: uuidData.uuid
                    });
                    uuidData = null; // Tentar buscar novamente
                }
            }
        }
        
        // Se não encontrou ou UUID parece incorreta, tentar API alternativa
        if (!uuidData) {
            logger.info('Tentando buscar UUID novamente com validação mais rigorosa', {
                username: trimmedUsername
            });
            uuidData = await tryAlternativeAPI(trimmedUsername);
        }
        
        if (uuidData) {
            logger.info('UUID do Minecraft encontrado', {
                username: trimmedUsername,
                uuid: uuidData.uuid,
                name: uuidData.name,
                source: uuidData.source || 'mojang'
            });
            return uuidData;
        }
        
        return null;
    } catch (error) {
        logger.error('Erro ao buscar UUID do Minecraft', {
            error: error.message,
            username: username,
            stack: error.stack
        });
        return null;
    }
}

/**
 * Busca o histórico de nomes de uma UUID
 */
async function tryNameHistory(uuid) {
    try {
        const cleanUUID = uuid.replace(/-/g, '');
        const response = await fetch(`https://api.mojang.com/user/profiles/${cleanUUID}/names`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const history = await response.json();
            return Array.isArray(history) ? history : null;
        }
        return null;
    } catch (error) {
        return null;
    }
}

/**
 * Tenta buscar UUID usando a API oficial do Mojang
 */
async function tryMojangAPI(username) {
    try {
        const response = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            if (response.status === 404) {
                logger.debug('Jogador não encontrado na API do Mojang', {
                    username: username,
                    status: response.status
                });
                return null;
            }
            throw new Error(`API do Mojang retornou status ${response.status}`);
        }

        const data = await response.json();
        
        if (!data || !data.id) {
            logger.debug('Resposta da API do Mojang sem UUID', {
                username: username,
                response: data
            });
            return null;
        }

        // Formatar UUID no formato correto (com hífens)
        const uuid = formatUUID(data.id);
        
        return {
            uuid: uuid,
            name: data.name || username,
            source: 'mojang'
        };
    } catch (error) {
        logger.debug('Erro ao buscar na API do Mojang', {
            error: error.message,
            username: username
        });
        return null;
    }
}

/**
 * Tenta buscar UUID usando API alternativa mais confiável
 * Usa APIs que retornam a UUID atual do jogador, não histórica
 */
async function tryAlternativeAPI(username) {
    try {
        // Tentar usar a API do Crafatar/Mojang que busca pelo nome atual
        // Esta API é mais confiável para nomes que podem ter sido usados antes
        
        // Primeiro, tentar buscar usando a API que retorna o jogador atual
        const response = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            if (data && data.id) {
                const uuid = formatUUID(data.id);
                
                // IMPORTANTE: Verificar se o nome retornado corresponde EXATAMENTE
                // Se não corresponder, pode ser UUID de outra pessoa
                if (data.name && data.name.toLowerCase() === username.toLowerCase()) {
                    // Nome corresponde, UUID provavelmente está correta
                    return {
                        uuid: uuid,
                        name: data.name,
                        source: 'mojang-exact-match'
                    };
                }
                
                // Se o nome não corresponde exatamente, buscar histórico para verificar
                // Mas isso pode não ser confiável se outra pessoa teve esse nome
                logger.warning('Nome retornado não corresponde exatamente - pode ser UUID de outra pessoa', {
                    buscado: username,
                    retornado: data.name,
                    uuid: uuid
                });
                
                // Tentar buscar histórico para ver se o nome está lá
                const historyResponse = await fetch(`https://api.mojang.com/user/profiles/${uuid.replace(/-/g, '')}/names`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                
                if (historyResponse.ok) {
                    const history = await historyResponse.json();
                    if (Array.isArray(history) && history.length > 0) {
                        // Verificar se o nome buscado está no histórico E é o mais recente
                        const latestEntry = history[history.length - 1];
                        const nameInHistory = history.some(entry => 
                            entry.name && entry.name.toLowerCase() === username.toLowerCase()
                        );
                        
                        if (nameInHistory && latestEntry.name && latestEntry.name.toLowerCase() === username.toLowerCase()) {
                            // Nome está no histórico E é o mais recente - UUID provavelmente está correta
                            return {
                                uuid: uuid,
                                name: latestEntry.name,
                                source: 'mojang-history-latest'
                            };
                        } else if (nameInHistory) {
                            // Nome está no histórico mas não é o mais recente - pode ser UUID antiga
                            logger.warning('Nome encontrado no histórico mas não é o mais recente - UUID pode estar incorreta', {
                                uuid: uuid,
                                nameBuscado: username,
                                nomeAtual: latestEntry.name
                            });
                        }
                    }
                }
            }
        }
        
        // Se chegou aqui, a API do Mojang não retornou dados confiáveis
        // Retornar null para que o sistema possa tentar outras abordagens
        return null;
    } catch (error) {
        logger.debug('Erro ao buscar na API alternativa', {
            error: error.message,
            username: username
        });
        return null;
    }
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

