import Client from 'ssh2-sftp-client';
import logger from './logger.js';

// Configurações SFTP via variáveis de ambiente (.env)
const SFTP_CONFIG = {
    host: process.env.SFTP_HOST,
    port: Number(process.env.SFTP_PORT) || 22,
    username: process.env.SFTP_USERNAME,
    password: process.env.SFTP_PASSWORD
};

// Caminho do arquivo de whitelist no servidor
// IMPORTANTE: Ajuste este caminho conforme a estrutura do seu servidor Minecraft
// Exemplos comuns:
// - /home/username/server/whitelist.json
// - /opt/minecraft/server/whitelist.json
// - ./whitelist.json (diretório atual do servidor)
// - /whitelist.json (raiz do servidor)
// Para servidores Minecraft, geralmente está na pasta do servidor, não na raiz
const WHITELIST_FILE_PATH = './whitelist.json'; // Tente primeiro o diretório atual

/**
 * Conecta ao servidor SFTP
 * @returns {Promise<Client>} - Cliente SFTP conectado
 */
async function connectSFTP() {
    const sftp = new Client();
    try {
        // Validação básica das configs
        if (!SFTP_CONFIG.host || !SFTP_CONFIG.username || !SFTP_CONFIG.password) {
            logger.error('Configurações SFTP ausentes. Verifique as variáveis de ambiente SFTP_HOST, SFTP_PORT, SFTP_USERNAME e SFTP_PASSWORD.');
            throw new Error('Configurações SFTP inválidas ou ausentes');
        }

        await sftp.connect(SFTP_CONFIG);
        logger.info('Conectado ao servidor SFTP', {
            host: SFTP_CONFIG.host,
            port: SFTP_CONFIG.port
        });
        return sftp;
    } catch (error) {
        logger.error('Erro ao conectar ao servidor SFTP', {
            error: error.message,
            host: SFTP_CONFIG.host,
            port: SFTP_CONFIG.port
        });
        throw error;
    }
}

/**
 * Tenta encontrar o arquivo de whitelist no servidor
 * @param {Client} sftp - Cliente SFTP conectado
 * @returns {Promise<string|null>} - Caminho do arquivo encontrado ou null
 */
async function findWhitelistFile(sftp) {
    const possiblePaths = [
        './whitelist.json',
        '/whitelist.json',
        './server/whitelist.json',
        './minecraft/whitelist.json',
        './plugins/whitelist.json',
        '/home/*/server/whitelist.json',
        '/opt/minecraft/server/whitelist.json'
    ];
    
    for (const path of possiblePaths) {
        try {
            const exists = await sftp.exists(path);
            if (exists) {
                logger.info('Arquivo de whitelist encontrado', {
                    path: path
                });
                return path;
            }
        } catch (error) {
            // Continuar tentando outros caminhos
            continue;
        }
    }
    
    return null;
}

/**
 * Lê o arquivo de whitelist do servidor
 * @returns {Promise<Array>} - Array de objetos com uuid e name
 */
export async function readWhitelist() {
    let sftp = null;
    try {
        sftp = await connectSFTP();
        
        // Tentar encontrar o arquivo
        let filePath = WHITELIST_FILE_PATH;
        const foundPath = await findWhitelistFile(sftp);
        if (foundPath) {
            filePath = foundPath;
        }
        
        // Verificar se o arquivo existe
        const exists = await sftp.exists(filePath);
        if (!exists) {
            logger.warning('Arquivo de whitelist não encontrado, retornando array vazio', {
                path: filePath,
                triedPath: WHITELIST_FILE_PATH
            });
            return [];
        }

        // Ler o arquivo
        const fileContent = await sftp.get(filePath);
        const contentString = fileContent.toString('utf-8');
        
        // Parsear JSON
        const whitelist = JSON.parse(contentString);
        
        if (!Array.isArray(whitelist)) {
            logger.error('Arquivo de whitelist não é um array válido', {
                path: WHITELIST_FILE_PATH,
                content: contentString.substring(0, 200)
            });
            return [];
        }

        logger.info('Whitelist lida com sucesso', {
            path: filePath,
            count: whitelist.length,
            sample: whitelist.slice(0, 2) // Mostrar primeiros 2 para debug
        });

        return whitelist;
    } catch (error) {
        logger.error('Erro ao ler whitelist do servidor', {
            error: error.message,
            path: WHITELIST_FILE_PATH,
            stack: error.stack
        });
        throw error;
    } finally {
        if (sftp) {
            try {
                await sftp.end();
            } catch (closeError) {
                logger.warning('Erro ao fechar conexão SFTP', {
                    error: closeError.message
                });
            }
        }
    }
}

/**
 * Escreve o arquivo de whitelist no servidor
 * @param {Array} whitelist - Array de objetos com uuid e name
 * @returns {Promise<void>}
 */
export async function writeWhitelist(whitelist) {
    let sftp = null;
    try {
        sftp = await connectSFTP();
        
        // Validar e normalizar cada entrada
        const normalizedWhitelist = whitelist.map(entry => {
            // Garantir que UUID está no formato correto (com hífens)
            let uuid = entry.uuid || '';
            // Remover hífens se existirem e adicionar novamente no formato correto
            uuid = uuid.replace(/-/g, '');
            if (uuid.length === 32) {
                uuid = `${uuid.substring(0, 8)}-${uuid.substring(8, 12)}-${uuid.substring(12, 16)}-${uuid.substring(16, 20)}-${uuid.substring(20)}`;
            }
            
            // Garantir que name está presente e limpo
            const name = (entry.name || '').trim();
            
            return {
                uuid: uuid,
                name: name
            };
        });
        
        // Tentar ler o arquivo atual primeiro para preservar o formato exato
        let existingContent = null;
        let existingFormat = null;
        try {
            const foundPath = await findWhitelistFile(sftp);
            if (foundPath) {
                const existingFile = await sftp.get(foundPath);
                existingContent = existingFile.toString('utf-8');
                // Tentar detectar o formato (espaçamento, ordem dos campos, etc)
                const parsed = JSON.parse(existingContent);
                if (parsed.length > 0) {
                    existingFormat = {
                        hasSpaces: existingContent.includes('  '), // 2 espaços de indentação
                        hasTabs: existingContent.includes('\t'),
                        fieldOrder: Object.keys(parsed[0]), // Ordem dos campos
                        lineEnding: existingContent.includes('\r\n') ? '\r\n' : '\n'
                    };
                    logger.info('Formato do arquivo existente detectado', {
                        format: existingFormat
                    });
                }
            }
        } catch (error) {
            logger.debug('Não foi possível ler arquivo existente para preservar formato', {
                error: error.message
            });
        }
        
        // Converter para JSON - usar o mesmo formato do arquivo existente se possível
        let jsonContent;
        if (existingFormat) {
            // Tentar replicar o formato exato
            const indent = existingFormat.hasTabs ? '\t' : (existingFormat.hasSpaces ? 2 : 2);
            jsonContent = JSON.stringify(normalizedWhitelist, null, indent);
            // Ajustar line ending se necessário
            if (existingFormat.lineEnding === '\r\n') {
                jsonContent = jsonContent.replace(/\n/g, '\r\n');
            }
        } else {
            // Formato padrão (2 espaços, sem BOM)
            jsonContent = JSON.stringify(normalizedWhitelist, null, 2);
        }
        
        // Log detalhado do conteúdo que será salvo
        logger.info('Conteúdo da whitelist que será salvo', {
            path: WHITELIST_FILE_PATH,
            count: normalizedWhitelist.length,
            sample: normalizedWhitelist.slice(0, 3), // Mostrar primeiros 3 para debug
            fullContent: jsonContent.substring(0, 500), // Primeiros 500 caracteres
            formatPreserved: existingFormat !== null
        });
        
        // Criar buffer sem BOM (Minecraft não gosta de BOM)
        const buffer = Buffer.from(jsonContent, 'utf-8');
        
        // Tentar encontrar o arquivo existente primeiro
        let targetPath = WHITELIST_FILE_PATH;
        const foundPath = await findWhitelistFile(sftp);
        if (foundPath) {
            targetPath = foundPath;
            logger.info('Usando caminho do arquivo existente', {
                path: targetPath
            });
        }
        
        // Tentar escrever o arquivo
        // Se falhar, tentar caminhos alternativos
        let writeSuccess = false;
        const possiblePaths = [
            targetPath,
            './whitelist.json',
            '/whitelist.json',
            './server/whitelist.json',
            './minecraft/whitelist.json'
        ];
        
        for (const path of possiblePaths) {
            try {
                await sftp.put(buffer, path);
                logger.info('Arquivo escrito com sucesso', {
                    path: path,
                    count: normalizedWhitelist.length,
                    fileSize: buffer.length,
                    contentPreview: jsonContent.substring(0, 300) // Primeiros 300 caracteres
                });
                writeSuccess = true;
                
                // Verificar se o arquivo foi salvo corretamente (ler de volta para confirmar)
                try {
                    const verifyContent = await sftp.get(path);
                    const verifyString = verifyContent.toString('utf-8');
                    const verifyParsed = JSON.parse(verifyString);
                    
                    // Log detalhado da primeira entrada para debug
                    const firstEntry = normalizedWhitelist[0];
                    logger.info('Whitelist escrita e verificada com sucesso', {
                        path: path,
                        count: normalizedWhitelist.length,
                        verifiedCount: verifyParsed.length,
                        fileSize: buffer.length,
                        firstEntry: firstEntry || null,
                        firstEntryUUID: firstEntry?.uuid || null,
                        firstEntryName: firstEntry?.name || null,
                        uuidFormat: firstEntry?.uuid?.includes('-') ? 'com hífens' : 'sem hífens'
                    });
                } catch (verifyError) {
                    logger.warning('Não foi possível verificar o arquivo salvo', {
                        error: verifyError.message,
                        path: path
                    });
                }
                
                break; // Se conseguiu escrever, para de tentar outros caminhos
            } catch (writeError) {
                logger.debug('Tentativa de escrever em caminho falhou', {
                    path: path,
                    error: writeError.message
                });
                continue; // Tenta próximo caminho
            }
        }
        
        if (!writeSuccess) {
            throw new Error(`Não foi possível escrever o arquivo em nenhum dos caminhos tentados: ${possiblePaths.join(', ')}`);
        }
        
        // IMPORTANTE: O servidor Minecraft precisa recarregar a whitelist após salvar
        // Nota: A maioria dos servidores recarrega automaticamente, mas alguns precisam do comando manual
        logger.info('Arquivo de whitelist salvo com sucesso', {
            path: targetPath,
            note: 'Se o jogador não conseguir entrar, execute /whitelist reload no console do servidor'
        });
    } catch (error) {
        logger.error('Erro ao escrever whitelist no servidor', {
            error: error.message,
            path: WHITELIST_FILE_PATH,
            count: whitelist.length,
            stack: error.stack
        });
        throw error;
    } finally {
        if (sftp) {
            try {
                await sftp.end();
            } catch (closeError) {
                logger.warning('Erro ao fechar conexão SFTP', {
                    error: closeError.message
                });
            }
        }
    }
}

/**
 * Adiciona um jogador à whitelist
 * @param {string} uuid - UUID do jogador
 * @param {string} name - Nome do jogador
 * @returns {Promise<boolean>} - true se adicionado com sucesso, false se já existe
 */
export async function addToWhitelist(uuid, name) {
    try {
        // Validar parâmetros
        if (!uuid || !name) {
            throw new Error('UUID e nome são obrigatórios para adicionar à whitelist');
        }
        
        // Limpar e validar nome
        const cleanName = name.trim();
        if (cleanName.length === 0) {
            throw new Error('Nome do jogador não pode estar vazio');
        }
        
        // Ler whitelist atual
        const whitelist = await readWhitelist();
        
        // Verificar se já existe (por UUID ou por nome)
        const exists = whitelist.some(entry => 
            entry.uuid === uuid || 
            entry.name.toLowerCase() === cleanName.toLowerCase()
        );
        
        if (exists) {
            logger.warning('Jogador já está na whitelist', {
                uuid: uuid,
                name: cleanName
            });
            return false;
        }
        
        // Normalizar UUID (garantir formato correto)
        let normalizedUUID = uuid.replace(/-/g, '');
        if (normalizedUUID.length === 32) {
            normalizedUUID = `${normalizedUUID.substring(0, 8)}-${normalizedUUID.substring(8, 12)}-${normalizedUUID.substring(12, 16)}-${normalizedUUID.substring(16, 20)}-${normalizedUUID.substring(20)}`;
        }
        
        // Adicionar novo jogador com UUID e nome
        whitelist.push({
            uuid: normalizedUUID,
            name: cleanName
        });
        
        // Escrever whitelist atualizada
        await writeWhitelist(whitelist);
        
        logger.info('Jogador adicionado à whitelist', {
            uuid: normalizedUUID,
            name: cleanName,
            totalEntries: whitelist.length,
            uuidFormat: 'com hífens'
        });
        
        return true;
    } catch (error) {
        logger.error('Erro ao adicionar jogador à whitelist', {
            error: error.message,
            uuid: uuid,
            name: name,
            stack: error.stack
        });
        throw error;
    }
}

/**
 * Remove um jogador da whitelist
 * @param {string} uuid - UUID do jogador (opcional, pode usar name)
 * @param {string} name - Nome do jogador (opcional, pode usar uuid)
 * @returns {Promise<boolean>} - true se removido com sucesso, false se não encontrado
 */
export async function removeFromWhitelist(uuid = null, name = null) {
    try {
        if (!uuid && !name) {
            throw new Error('É necessário fornecer uuid ou name para remover da whitelist');
        }
        
        // Ler whitelist atual
        const whitelist = await readWhitelist();
        
        // Encontrar e remover o jogador
        const initialLength = whitelist.length;
        const filtered = whitelist.filter(entry => {
            if (uuid && entry.uuid === uuid) return false;
            if (name && entry.name.toLowerCase() === name.toLowerCase()) return false;
            return true;
        });
        
        if (filtered.length === initialLength) {
            logger.warning('Jogador não encontrado na whitelist', {
                uuid: uuid,
                name: name
            });
            return false;
        }
        
        // Escrever whitelist atualizada
        await writeWhitelist(filtered);
        
        logger.info('Jogador removido da whitelist', {
            uuid: uuid,
            name: name,
            totalEntries: filtered.length,
            removed: initialLength - filtered.length
        });
        
        return true;
    } catch (error) {
        logger.error('Erro ao remover jogador da whitelist', {
            error: error.message,
            uuid: uuid,
            name: name,
            stack: error.stack
        });
        throw error;
    }
}

/**
 * Verifica se um jogador está na whitelist
 * @param {string} uuid - UUID do jogador (opcional)
 * @param {string} name - Nome do jogador (opcional)
 * @returns {Promise<boolean>} - true se está na whitelist
 */
export async function isInWhitelist(uuid = null, name = null) {
    try {
        if (!uuid && !name) {
            return false;
        }
        
        const whitelist = await readWhitelist();
        
        return whitelist.some(entry => {
            if (uuid && entry.uuid === uuid) return true;
            if (name && entry.name.toLowerCase() === name.toLowerCase()) return true;
            return false;
        });
    } catch (error) {
        logger.error('Erro ao verificar se jogador está na whitelist', {
            error: error.message,
            uuid: uuid,
            name: name
        });
        return false;
    }
}

