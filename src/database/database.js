import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database(path.join(process.cwd(), 'verification.db'));

// Inicializar o banco de dados
function initDatabase() {
    // Tabela de verificações
    db.prepare(`
        CREATE TABLE IF NOT EXISTS verifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            referralSource TEXT,
            additionalInfo TEXT,
            submittedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(userId) ON CONFLICT REPLACE
        )
    `).run();

    // Tabela de whitelist do Minecraft
    db.prepare(`
        CREATE TABLE IF NOT EXISTS minecraft_whitelist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId TEXT NOT NULL,
            minecraftUsername TEXT NOT NULL,
            platform TEXT DEFAULT 'java',
            status TEXT NOT NULL DEFAULT 'pending',
            reason TEXT,
            submittedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(userId) ON CONFLICT REPLACE
        )
    `).run();
    
    // Migração: adicionar coluna platform se não existir
    try {
        db.prepare('ALTER TABLE minecraft_whitelist ADD COLUMN platform TEXT DEFAULT "java"').run();
    } catch (err) {
        // Coluna já existe ou erro na migração - ignorar
        if (!err.message.includes('duplicate column')) {
            console.warn('Erro ao migrar tabela minecraft_whitelist:', err.message);
        }
    }

    // Tabela de primeiras damas
    db.prepare(`
        CREATE TABLE IF NOT EXISTS first_ladies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guildId TEXT NOT NULL,
            giverId TEXT NOT NULL,
            receiverId TEXT NOT NULL,
            assignedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(guildId, giverId) ON CONFLICT REPLACE,
            UNIQUE(guildId, receiverId) ON CONFLICT REPLACE
        )
    `).run();
    
    // Migração: adicionar coluna guildId se não existir (para bancos antigos)
    try {
        db.prepare('ALTER TABLE first_ladies ADD COLUMN guildId TEXT').run();
        // Se a coluna foi adicionada, atualizar registros existentes com um valor padrão
        // (isso é temporário, registros antigos serão removidos ou precisam ser migrados manualmente)
        db.prepare('UPDATE first_ladies SET guildId = ? WHERE guildId IS NULL').run('MIGRATION_NEEDED');
    } catch (err) {
        // Coluna já existe ou erro na migração - ignorar
        if (!err.message.includes('duplicate column')) {
            console.warn('Erro ao migrar tabela first_ladies:', err.message);
        }
    }
    
    // Migração: remover constraint UNIQUE(guildId, giverId) para permitir múltiplas Primeiras Damas
    try {
        // Verificar se a constraint ainda existe tentando criar um índice único
        // Se falhar, significa que a constraint ainda existe e precisamos recriar a tabela
        const tableInfo = db.prepare("PRAGMA table_info(first_ladies)").all();
        const hasGuildId = tableInfo.some(col => col.name === 'guildId');
        
        if (hasGuildId) {
            // Verificar se já existe uma tabela temporária (indica que a migração já foi feita)
            const tempTableExists = db.prepare(`
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name='first_ladies_new'
            `).get();
            
            if (!tempTableExists) {
                // Criar nova tabela sem a constraint UNIQUE(guildId, giverId)
                db.prepare(`
                    CREATE TABLE IF NOT EXISTS first_ladies_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        guildId TEXT NOT NULL,
                        giverId TEXT NOT NULL,
                        receiverId TEXT NOT NULL,
                        assignedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE(guildId, receiverId) ON CONFLICT REPLACE
                    )
                `).run();
                
                // Copiar dados
                db.prepare(`
                    INSERT INTO first_ladies_new (id, guildId, giverId, receiverId, assignedAt)
                    SELECT id, guildId, giverId, receiverId, assignedAt FROM first_ladies
                `).run();
                
                // Remover tabela antiga
                db.prepare('DROP TABLE first_ladies').run();
                
                // Renomear nova tabela
                db.prepare('ALTER TABLE first_ladies_new RENAME TO first_ladies').run();
            }
        }
    } catch (err) {
        // Erro na migração - pode ser que a constraint já não exista ou a tabela já foi migrada
        console.warn('Erro ao migrar constraint UNIQUE de first_ladies:', err.message);
    }

    // Tabela de configurações do servidor
    db.prepare(`
        CREATE TABLE IF NOT EXISTS server_config (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guildId TEXT NOT NULL,
            configKey TEXT NOT NULL,
            configValue TEXT,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(guildId, configKey) ON CONFLICT REPLACE
        )
    `).run();

    // Tabela de embeds salvos
    db.prepare(`
        CREATE TABLE IF NOT EXISTS saved_embeds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guildId TEXT NOT NULL,
            userId TEXT NOT NULL,
            embedName TEXT NOT NULL,
            embedData TEXT NOT NULL,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(guildId, userId, embedName) ON CONFLICT REPLACE
        )
    `).run();

    // Sessões do construtor de embed (Components V2 — sem embeds na mensagem)
    db.prepare(`
        CREATE TABLE IF NOT EXISTS embed_builder_sessions (
            messageId TEXT PRIMARY KEY NOT NULL,
            guildId TEXT NOT NULL,
            userId TEXT NOT NULL,
            embedData TEXT NOT NULL,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `).run();

    console.log('Database initialized');
}

// Adicionar ou atualizar uma verificação
function upsertVerification(userId, data) {
    const { status = 'pending', referralSource = null, additionalInfo = null } = data;
    
    return db.prepare(`
        INSERT INTO verifications (userId, status, referralSource, additionalInfo, updatedAt)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(userId) DO UPDATE SET
            status = excluded.status,
            referralSource = excluded.referralSource,
            additionalInfo = excluded.additionalInfo,
            updatedAt = CURRENT_TIMESTAMP
    `).run(userId, status, referralSource, additionalInfo);
}

// Obter verificação por ID de usuário
function getVerification(userId) {
    return db.prepare('SELECT * FROM verifications WHERE userId = ?').get(userId);
}

// Excluir uma verificação
function deleteVerification(userId) {
    return db.prepare('DELETE FROM verifications WHERE userId = ?').run(userId);
}

// Obter todas as verificações pendentes
function getPendingVerifications() {
    return db.prepare('SELECT * FROM verifications WHERE status = ?').all('pending');
}

// Obter estatísticas de verificação
function getVerificationStats() {
    const result = db.prepare(`
        SELECT 
            SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
            SUM(CASE WHEN status = 'denied' THEN 1 ELSE 0 END) as denied,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
        FROM verifications
    `).get();
    
    return {
        approved: result.approved || 0,
        denied: result.denied || 0,
        pending: result.pending || 0
    };
}

// Atualizar status de verificação
function updateVerificationStatus(userId, status) {
    return db.prepare('UPDATE verifications SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE userId = ?').run(status, userId);
}

// Funções para whitelist do Minecraft
function upsertWhitelist(userId, data) {
    const { minecraftUsername, platform = 'java', status = 'pending', reason = null } = data;
    
    return db.prepare(`
        INSERT INTO minecraft_whitelist (userId, minecraftUsername, platform, status, reason, updatedAt)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(userId) DO UPDATE SET
            minecraftUsername = excluded.minecraftUsername,
            platform = excluded.platform,
            status = excluded.status,
            reason = excluded.reason,
            updatedAt = CURRENT_TIMESTAMP
    `).run(userId, minecraftUsername, platform, status, reason);
}

function getWhitelist(userId) {
    return db.prepare('SELECT * FROM minecraft_whitelist WHERE userId = ?').get(userId);
}

function deleteWhitelist(userId) {
    return db.prepare('DELETE FROM minecraft_whitelist WHERE userId = ?').run(userId);
}

function getPendingWhitelists() {
    return db.prepare('SELECT * FROM minecraft_whitelist WHERE status = ?').all('pending');
}

function getApprovedWhitelists() {
    return db.prepare('SELECT * FROM minecraft_whitelist WHERE status = ? ORDER BY updatedAt DESC').all('approved');
}

function updateWhitelistStatus(userId, status) {
    return db.prepare('UPDATE minecraft_whitelist SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE userId = ?').run(status, userId);
}

function getWhitelistStats() {
    const result = db.prepare(`
        SELECT 
            SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
            SUM(CASE WHEN status = 'denied' THEN 1 ELSE 0 END) as denied,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
        FROM minecraft_whitelist
    `).get();
    
    return {
        approved: result.approved || 0,
        denied: result.denied || 0,
        pending: result.pending || 0
    };
}

function clearAllWhitelists() {
    return db.prepare('DELETE FROM minecraft_whitelist').run();
}

// Limpar todos os dados de verificação
function clearDatabase() {
    return db.prepare('DELETE FROM verifications').run();
}

// Funções para Primeira Dama
function assignFirstLady(guildId, giverId, receiverId) {
    return db.prepare(`
        INSERT INTO first_ladies (guildId, giverId, receiverId)
        VALUES (?, ?, ?)
    `).run(guildId, giverId, receiverId);
}

function removeFirstLady(guildId, giverId, receiverId = null) {
    if (receiverId) {
        // Remover uma Primeira Dama específica
        return db.prepare('DELETE FROM first_ladies WHERE guildId = ? AND giverId = ? AND receiverId = ?').run(guildId, giverId, receiverId);
    }
    // Remover todas as Primeiras Damas de um doador (compatibilidade com código antigo)
    return db.prepare('DELETE FROM first_ladies WHERE guildId = ? AND giverId = ?').run(guildId, giverId);
}

function getFirstLadyByGiver(guildId, giverId) {
    return db.prepare('SELECT * FROM first_ladies WHERE guildId = ? AND giverId = ?').get(guildId, giverId);
}

function getAllFirstLadiesByGiver(guildId, giverId) {
    return db.prepare('SELECT * FROM first_ladies WHERE guildId = ? AND giverId = ?').all(guildId, giverId);
}

function getFirstLadyByReceiver(guildId, receiverId) {
    return db.prepare('SELECT * FROM first_ladies WHERE guildId = ? AND receiverId = ?').get(guildId, receiverId);
}

function getAllFirstLadies(guildId) {
    return db.prepare('SELECT * FROM first_ladies WHERE guildId = ?').all(guildId);
}

function clearFirstLadies(guildId) {
    return db.prepare('DELETE FROM first_ladies WHERE guildId = ?').run(guildId);
}

// Funções para configurações do servidor
function setConfig(guildId, key, value) {
    const result = db.prepare(`
        INSERT INTO server_config (guildId, configKey, configValue, updatedAt)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(guildId, configKey) DO UPDATE SET
            configValue = excluded.configValue,
            updatedAt = CURRENT_TIMESTAMP
    `).run(guildId, key, value);
    
    // Invalidar cache quando configuração é alterada
    invalidateConfigCache(guildId);
    
    return result;
}

// Função auxiliar para invalidar cache (evita dependência circular)
function invalidateConfigCache(guildId) {
    try {
        // Usar import dinâmico para evitar dependência circular
        import('../utils/cache.js').then(({ remove }) => {
            // Remover cache de configurações gerais
            remove(`guild_config_${guildId}`);
            
            // Remover cache de canais
            const channelKeys = ['verification', 'notification', 'log', 'logFicha', 'modLogs', 'logCall', 'logRole', 'memberLogs', 'whitelist', 'whitelistSolicitacao', 'whitelistLog', 'whitelistResult'];
            channelKeys.forEach(channelKey => {
                remove(`channel_${guildId}_${channelKey}`);
            });
            
            // Remover cache de cargos
            const roleKeys = ['verified', 'firstLadyGiver', 'firstLady', 'wl'];
            roleKeys.forEach(roleKey => {
                remove(`role_${guildId}_${roleKey}`);
            });
            
            // Remover cache de cargos staff (múltiplos)
            // Não há cache específico para staff, mas invalidar o cache geral resolve
        }).catch(() => {
            // Ignorar erro se módulo não estiver disponível
        });
    } catch (error) {
        // Ignorar erro
    }
}

function getConfig(guildId, key) {
    const result = db.prepare('SELECT configValue FROM server_config WHERE guildId = ? AND configKey = ?').get(guildId, key);
    return result ? result.configValue : null;
}

// Funções para modo do servidor Minecraft (online/offline)
function setWhitelistMode(guildId, mode) {
    return setConfig(guildId, 'whitelist_mode', mode);
}

function getWhitelistMode(guildId) {
    const mode = getConfig(guildId, 'whitelist_mode');
    return mode || 'offline'; // Padrão: offline
}

function getAllConfigs(guildId) {
    const results = db.prepare('SELECT configKey, configValue FROM server_config WHERE guildId = ?').all(guildId);
    const config = {};
    results.forEach(row => {
        config[row.configKey] = row.configValue;
    });
    return config;
}

function deleteConfig(guildId, key) {
    const result = db.prepare('DELETE FROM server_config WHERE guildId = ? AND configKey = ?').run(guildId, key);
    
    // Invalidar cache quando configuração é removida
    invalidateConfigCache(guildId);
    
    return result;
}

function clearAllConfigs(guildId) {
    const result = db.prepare('DELETE FROM server_config WHERE guildId = ?').run(guildId);
    
    // Invalidar cache quando todas as configurações são removidas
    invalidateConfigCache(guildId);
    
    return result;
}

// Inicializar o banco de dados
initDatabase();

// Funções para embeds salvos
function saveEmbed(guildId, userId, embedName, embedData) {
    return db.prepare(`
        INSERT INTO saved_embeds (guildId, userId, embedName, embedData, updatedAt)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(guildId, userId, embedName) DO UPDATE SET
            embedData = excluded.embedData,
            updatedAt = CURRENT_TIMESTAMP
    `).run(guildId, userId, embedName, JSON.stringify(embedData));
}

function getEmbed(guildId, userId, embedName) {
    const result = db.prepare('SELECT * FROM saved_embeds WHERE guildId = ? AND userId = ? AND embedName = ?').get(guildId, userId, embedName);
    if (result) {
        result.embedData = JSON.parse(result.embedData);
    }
    return result;
}

function getAllEmbeds(guildId, userId) {
    const results = db.prepare('SELECT * FROM saved_embeds WHERE guildId = ? AND userId = ? ORDER BY updatedAt DESC').all(guildId, userId);
    return results.map(r => ({
        ...r,
        embedData: JSON.parse(r.embedData)
    }));
}

function deleteEmbed(guildId, userId, embedName) {
    return db.prepare('DELETE FROM saved_embeds WHERE guildId = ? AND userId = ? AND embedName = ?').run(guildId, userId, embedName);
}

function deleteAllEmbeds(guildId, userId) {
    return db.prepare('DELETE FROM saved_embeds WHERE guildId = ? AND userId = ?').run(guildId, userId);
}

function upsertEmbedBuilderSession(messageId, guildId, userId, embedData) {
    const json = typeof embedData === 'string' ? embedData : JSON.stringify(embedData);
    return db.prepare(`
        INSERT INTO embed_builder_sessions (messageId, guildId, userId, embedData, updatedAt)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(messageId) DO UPDATE SET
            guildId = excluded.guildId,
            userId = excluded.userId,
            embedData = excluded.embedData,
            updatedAt = CURRENT_TIMESTAMP
    `).run(messageId, guildId, userId, json);
}

function getEmbedBuilderSession(messageId) {
    const row = db.prepare('SELECT * FROM embed_builder_sessions WHERE messageId = ?').get(messageId);
    if (row) {
        row.embedData = JSON.parse(row.embedData);
    }
    return row;
}

function deleteEmbedBuilderSession(messageId) {
    return db.prepare('DELETE FROM embed_builder_sessions WHERE messageId = ?').run(messageId);
}

// Funções para gerenciar múltiplos cargos de doador de Primeira Dama
function addFirstLadyGiverRole(guildId, roleId) {
    // Obter cargos existentes
    const existingRoles = getFirstLadyGiverRoles(guildId);
    if (existingRoles.includes(roleId)) {
        return { success: false, message: 'Este cargo já está configurado como doador de Primeira Dama.' };
    }
    
    existingRoles.push(roleId);
    setConfig(guildId, 'firstLadyGiverRoles', JSON.stringify(existingRoles));
    invalidateConfigCache(guildId);
    return { success: true, message: 'Cargo adicionado com sucesso.' };
}

function removeFirstLadyGiverRole(guildId, roleId) {
    const existingRoles = getFirstLadyGiverRoles(guildId);
    const filteredRoles = existingRoles.filter(id => id !== roleId);
    
    if (existingRoles.length === filteredRoles.length) {
        return { success: false, message: 'Este cargo não está configurado como doador de Primeira Dama.' };
    }
    
    if (filteredRoles.length === 0) {
        deleteConfig(guildId, 'firstLadyGiverRoles');
    } else {
        setConfig(guildId, 'firstLadyGiverRoles', JSON.stringify(filteredRoles));
    }
    invalidateConfigCache(guildId);
    return { success: true, message: 'Cargo removido com sucesso.' };
}

function getFirstLadyGiverRoles(guildId) {
    const configValue = getConfig(guildId, 'firstLadyGiverRoles');
    if (!configValue) {
        // Fallback para o sistema antigo (um único cargo)
        const oldRoleId = getConfig(guildId, 'role_firstLadyGiver');
        return oldRoleId ? [oldRoleId] : [];
    }
    try {
        return JSON.parse(configValue);
    } catch {
        return [];
    }
}

function getFirstLadyLimit(guildId) {
    const limit = getConfig(guildId, 'firstLadyLimit');
    return limit ? parseInt(limit, 10) : null; // null = sem limite
}

function setFirstLadyLimit(guildId, limit) {
    if (limit === null || limit === undefined) {
        deleteConfig(guildId, 'firstLadyLimit');
    } else {
        const limitNum = parseInt(limit, 10);
        if (isNaN(limitNum) || limitNum < 0) {
            return { success: false, message: 'O limite deve ser um número positivo ou 0 para desabilitar.' };
        }
        setConfig(guildId, 'firstLadyLimit', limitNum.toString());
    }
    invalidateConfigCache(guildId);
    return { success: true, message: `Limite ${limit === null || limit === 0 ? 'desabilitado' : `definido para ${limit}`}.` };
}

function getFirstLadyCount(guildId) {
    return db.prepare('SELECT COUNT(*) as count FROM first_ladies WHERE guildId = ?').get(guildId)?.count || 0;
}

// Funções para gerenciar estado de sistemas (ativado/desativado)
function setSystemEnabled(guildId, systemName, enabled) {
    return setConfig(guildId, `system_${systemName}_enabled`, enabled ? 'true' : 'false');
}

function isSystemEnabled(guildId, systemName) {
    const value = getConfig(guildId, `system_${systemName}_enabled`);
    // Por padrão, se não estiver configurado, considera como ativado (true)
    return value === null ? true : value === 'true';
}

export const database = {
    initDatabase,
    upsertVerification,
    getVerification,
    deleteVerification,
    getPendingVerifications,
    getVerificationStats,
    updateVerificationStatus,
    clearDatabase,
    assignFirstLady,
    removeFirstLady,
    getFirstLadyByGiver,
    getAllFirstLadiesByGiver,
    getFirstLadyByReceiver,
    getAllFirstLadies,
    clearFirstLadies,
    setConfig,
    getConfig,
    getAllConfigs,
    deleteConfig,
    clearAllConfigs,
    saveEmbed,
    getEmbed,
    getAllEmbeds,
    deleteEmbed,
    deleteAllEmbeds,
    upsertEmbedBuilderSession,
    getEmbedBuilderSession,
    deleteEmbedBuilderSession,
    addFirstLadyGiverRole,
    removeFirstLadyGiverRole,
    getFirstLadyGiverRoles,
    getFirstLadyLimit,
    setFirstLadyLimit,
    getFirstLadyCount,
    setSystemEnabled,
    isSystemEnabled,
    upsertWhitelist,
    getWhitelist,
    deleteWhitelist,
    getPendingWhitelists,
    getApprovedWhitelists,
    updateWhitelistStatus,
    getWhitelistStats,
    clearAllWhitelists,
    setWhitelistMode,
    getWhitelistMode
};

export default database;
