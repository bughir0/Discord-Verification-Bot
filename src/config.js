import { database as db } from './database/database.js';
import { remove } from './utils/cache.js';

// Configurações que não dependem do servidor (cores, token, etc)
const staticConfig = {
    colors: {
        primary: 0x3498db,
        success: 0x2ecc71,
        warning: 0xf39c12,
        danger: 0xe74c3c,
        info: 0x3498db
    }
};

/**
 * Obtém as configurações do servidor do banco de dados
 * @param {string} guildId - ID do servidor
 * @returns {Object} Configurações do servidor
 */
function getServerConfig(guildId) {
    const configs = db.getAllConfigs(guildId);
    
    const channels = {};
    const roles = {};
    
    // Mapear configurações de canais
    const channelKeys = ['verification', 'notification', 'log', 'logFicha', 'modLogs', 'logCall', 'logRole', 'memberLogs', 'logUsername', 'logAvatar', 'logDisplayName', 'logMessage', 'boostLog'];
    channelKeys.forEach(key => {
        const value = configs[`channel_${key}`];
        if (value) channels[key] = value;
    });
    
    // Mapear configurações de cargos
    const roleKeys = ['verified', 'staff', 'firstLadyGiver', 'firstLady'];
    roleKeys.forEach(key => {
        const value = configs[`role_${key}`];
        if (value) roles[key] = value;
    });
    
    return {
        channels,
        roles
    };
}

/**
 * Obtém uma configuração específica do servidor
 * @param {string} guildId - ID do servidor
 * @param {string} type - Tipo de configuração ('channel' ou 'role')
 * @param {string} key - Chave da configuração
 * @returns {string|null} Valor da configuração ou null se não encontrado
 */
function getConfigValue(guildId, type, key) {
    return db.getConfig(guildId, `${type}_${key}`);
}

/**
 * Obtém todos os cargos staff configurados
 * @param {string} guildId - ID do servidor
 * @returns {string[]} Array de IDs dos cargos staff
 */
function getStaffRoleIds(guildId) {
    const configs = db.getAllConfigs(guildId);
    const staffRoleIds = [];
    
    // Buscar todos os cargos staff (role_staff, role_staff_1, role_staff_2, etc)
    for (const [key, value] of Object.entries(configs)) {
        if (key === 'role_staff' || key.startsWith('role_staff_')) {
            if (value) staffRoleIds.push(value);
        }
    }
    
    return staffRoleIds;
}

/**
 * Adiciona um cargo staff
 * @param {string} guildId - ID do servidor
 * @param {string} roleId - ID do cargo a adicionar
 * @returns {boolean} True se foi adicionado com sucesso
 */
function addStaffRole(guildId, roleId) {
    const existingIds = getStaffRoleIds(guildId);
    
    // Se já existe, não adicionar novamente
    if (existingIds.includes(roleId)) {
        return false;
    }
    
    // Se não há nenhum cargo staff, usar role_staff como primeiro
    if (existingIds.length === 0) {
        db.setConfig(guildId, 'role_staff', roleId);
    } else {
        // Adicionar como role_staff_N
        db.setConfig(guildId, `role_staff_${existingIds.length}`, roleId);
    }
    
    invalidateCache(guildId);
    return true;
}

/**
 * Remove um cargo staff
 * @param {string} guildId - ID do servidor
 * @param {string} roleId - ID do cargo a remover
 * @returns {boolean} True se foi removido com sucesso
 */
function removeStaffRole(guildId, roleId) {
    const configs = db.getAllConfigs(guildId);
    let removed = false;
    let removedKey = null;
    
    // Encontrar e remover o cargo
    for (const [key, value] of Object.entries(configs)) {
        if ((key === 'role_staff' || key.startsWith('role_staff_')) && value === roleId) {
            db.deleteConfig(guildId, key);
            removed = true;
            removedKey = key;
            break;
        }
    }
    
    if (removed) {
        // Obter IDs restantes ANTES de remover tudo
        const allStaffIds = getStaffRoleIds(guildId);
        const remainingIds = allStaffIds.filter(id => id !== roleId);
        
        // Remover todos os role_staff_* e role_staff
        for (const [key] of Object.entries(configs)) {
            if (key === 'role_staff' || key.startsWith('role_staff_')) {
                db.deleteConfig(guildId, key);
            }
        }
        
        // Reinserir os restantes na ordem correta
        remainingIds.forEach((id, index) => {
            if (index === 0) {
                db.setConfig(guildId, 'role_staff', id);
            } else {
                db.setConfig(guildId, `role_staff_${index}`, id);
            }
        });
        
        invalidateCache(guildId);
    }
    
    return removed;
}

/**
 * Obtém todos os cargos de doador de Primeira Dama configurados
 * @param {string} guildId - ID do servidor
 * @returns {string[]} Array de IDs dos cargos de doador
 */
function getFirstLadyGiverRoleIds(guildId) {
    const configs = db.getAllConfigs(guildId);
    const giverRoleIds = [];
    
    // Buscar todos os cargos de doador (role_firstLadyGiver, role_firstLadyGiver_1, role_firstLadyGiver_2, etc)
    for (const [key, value] of Object.entries(configs)) {
        if (key === 'role_firstLadyGiver' || key.startsWith('role_firstLadyGiver_')) {
            if (value) giverRoleIds.push(value);
        }
    }
    
    return giverRoleIds;
}

/**
 * Adiciona um cargo de doador de Primeira Dama
 * @param {string} guildId - ID do servidor
 * @param {string} roleId - ID do cargo a adicionar
 * @returns {boolean} True se foi adicionado com sucesso
 */
function addFirstLadyGiverRole(guildId, roleId) {
    const existingIds = getFirstLadyGiverRoleIds(guildId);
    
    // Se já existe, não adicionar novamente
    if (existingIds.includes(roleId)) {
        return false;
    }
    
    // Se não há nenhum cargo, usar role_firstLadyGiver como primeiro
    if (existingIds.length === 0) {
        db.setConfig(guildId, 'role_firstLadyGiver', roleId);
    } else {
        // Adicionar como role_firstLadyGiver_N
        db.setConfig(guildId, `role_firstLadyGiver_${existingIds.length}`, roleId);
    }
    
    invalidateCache(guildId);
    return true;
}

/**
 * Remove um cargo de doador de Primeira Dama
 * @param {string} guildId - ID do servidor
 * @param {string} roleId - ID do cargo a remover
 * @returns {boolean} True se foi removido com sucesso
 */
function removeFirstLadyGiverRole(guildId, roleId) {
    const configs = db.getAllConfigs(guildId);
    let removed = false;
    
    // Encontrar e remover o cargo
    for (const [key, value] of Object.entries(configs)) {
        if ((key === 'role_firstLadyGiver' || key.startsWith('role_firstLadyGiver_')) && value === roleId) {
            db.deleteConfig(guildId, key);
            removed = true;
            break;
        }
    }
    
    if (removed) {
        // Obter IDs restantes ANTES de remover tudo
        const allGiverIds = getFirstLadyGiverRoleIds(guildId);
        const remainingIds = allGiverIds.filter(id => id !== roleId);
        
        // Remover todos os role_firstLadyGiver_* e role_firstLadyGiver
        for (const [key] of Object.entries(configs)) {
            if (key === 'role_firstLadyGiver' || key.startsWith('role_firstLadyGiver_')) {
                db.deleteConfig(guildId, key);
            }
        }
        
        // Reinserir os restantes na ordem correta
        remainingIds.forEach((id, index) => {
            if (index === 0) {
                db.setConfig(guildId, 'role_firstLadyGiver', id);
            } else {
                db.setConfig(guildId, `role_firstLadyGiver_${index}`, id);
            }
        });
        
        invalidateCache(guildId);
    }
    
    return removed;
}

/**
 * Obtém todos os cargos de boost removíveis configurados
 * @param {string} guildId - ID do servidor
 * @returns {string[]} Array de IDs dos cargos de boost removíveis
 */
function getBoostRemovableRoleIds(guildId) {
    const configs = db.getAllConfigs(guildId);
    const boostRoleIds = [];
    
    // Buscar todos os cargos de boost removíveis (role_boostRemovable, role_boostRemovable_1, etc)
    for (const [key, value] of Object.entries(configs)) {
        if (key === 'role_boostRemovable' || key.startsWith('role_boostRemovable_')) {
            if (value) boostRoleIds.push(value);
        }
    }
    
    return boostRoleIds;
}

/**
 * Adiciona um cargo de boost removível
 * @param {string} guildId - ID do servidor
 * @param {string} roleId - ID do cargo a adicionar
 * @returns {boolean} True se foi adicionado com sucesso
 */
function addBoostRemovableRole(guildId, roleId) {
    const existingIds = getBoostRemovableRoleIds(guildId);
    
    // Se já existe, não adicionar novamente
    if (existingIds.includes(roleId)) {
        return false;
    }
    
    // Se não há nenhum cargo, usar role_boostRemovable como primeiro
    if (existingIds.length === 0) {
        db.setConfig(guildId, 'role_boostRemovable', roleId);
    } else {
        // Adicionar como role_boostRemovable_N
        db.setConfig(guildId, `role_boostRemovable_${existingIds.length}`, roleId);
    }
    
    invalidateCache(guildId);
    return true;
}

/**
 * Remove um cargo de boost removível
 * @param {string} guildId - ID do servidor
 * @param {string} roleId - ID do cargo a remover
 * @returns {boolean} True se foi removido com sucesso
 */
function removeBoostRemovableRole(guildId, roleId) {
    const configs = db.getAllConfigs(guildId);
    let removed = false;
    
    // Encontrar e remover o cargo
    for (const [key, value] of Object.entries(configs)) {
        if ((key === 'role_boostRemovable' || key.startsWith('role_boostRemovable_')) && value === roleId) {
            db.deleteConfig(guildId, key);
            removed = true;
            break;
        }
    }
    
    if (removed) {
        // Obter IDs restantes ANTES de remover tudo
        const allBoostIds = getBoostRemovableRoleIds(guildId);
        const remainingIds = allBoostIds.filter(id => id !== roleId);
        
        // Remover todos os role_boostRemovable_* e role_boostRemovable
        for (const [key] of Object.entries(configs)) {
            if (key === 'role_boostRemovable' || key.startsWith('role_boostRemovable_')) {
                db.deleteConfig(guildId, key);
            }
        }
        
        // Reinserir os restantes na ordem correta
        remainingIds.forEach((id, index) => {
            if (index === 0) {
                db.setConfig(guildId, 'role_boostRemovable', id);
            } else {
                db.setConfig(guildId, `role_boostRemovable_${index}`, id);
            }
        });
        
        invalidateCache(guildId);
    }
    
    return removed;
}

/**
 * Invalida o cache de configurações de um servidor
 * @param {string} guildId - ID do servidor
 */
function invalidateCache(guildId) {
    // Remover cache de configurações gerais
    remove(`guild_config_${guildId}`);
    
    // Remover cache de canais
    const channelKeys = ['verification', 'notification', 'log', 'logFicha', 'modLogs', 'logCall', 'logRole', 'memberLogs', 'logUsername', 'logAvatar', 'logDisplayName', 'logMessage', 'boostLog'];
    channelKeys.forEach(key => {
        remove(`channel_${guildId}_${key}`);
    });
    
    // Remover cache de cargos
    const roleKeys = ['verified', 'firstLadyGiver', 'firstLady'];
    roleKeys.forEach(key => {
        remove(`role_${guildId}_${key}`);
    });
    
    // Cache de staff é gerenciado separadamente através do getStaffRoleIds
}

/**
 * Cria um objeto de configuração completo para um servidor
 * @param {string} guildId - ID do servidor
 * @returns {Object} Configuração completa
 */
function createConfig(guildId) {
    const serverConfig = getServerConfig(guildId);
    
    return {
        ...staticConfig,
        channels: serverConfig.channels,
        roles: serverConfig.roles
    };
}

// Exportar funções e configuração estática
export default {
    ...staticConfig,
    getServerConfig,
    getConfigValue,
    createConfig,
    invalidateCache,
    getStaffRoleIds,
    addStaffRole,
    removeStaffRole,
    getFirstLadyGiverRoleIds,
    addFirstLadyGiverRole,
    removeFirstLadyGiverRole,
    getBoostRemovableRoleIds,
    addBoostRemovableRole,
    removeBoostRemovableRole
};
