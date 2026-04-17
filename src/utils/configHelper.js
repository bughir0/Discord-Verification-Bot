import config from '../config.js';
import { getOrCompute } from './cache.js';

/**
 * Obtém as configurações do servidor de forma conveniente
 * @param {string} guildId - ID do servidor
 * @returns {Object} Configurações do servidor
 */
export function getGuildConfig(guildId) {
    return config.createConfig(guildId);
}

/**
 * Obtém as configurações do servidor com cache
 * @param {string} guildId - ID do servidor
 * @returns {Promise<Object>} Configurações do servidor
 */
export async function getGuildConfigCached(guildId) {
    return await getOrCompute(
        `guild_config_${guildId}`,
        () => Promise.resolve(config.createConfig(guildId)),
        2 * 60 * 1000 // Cache por 2 minutos
    );
}

/**
 * Obtém um canal específico do servidor
 * @param {string} guildId - ID do servidor
 * @param {string} channelType - Tipo de canal (verification, notification, etc)
 * @returns {string|null} ID do canal ou null
 */
export function getChannelId(guildId, channelType) {
    return config.getConfigValue(guildId, 'channel', channelType);
}

/**
 * Obtém um canal específico do servidor com cache
 * @param {string} guildId - ID do servidor
 * @param {string} channelType - Tipo de canal (verification, notification, etc)
 * @returns {Promise<string|null>} ID do canal ou null
 */
export async function getChannelIdCached(guildId, channelType) {
    return await getOrCompute(
        `channel_${guildId}_${channelType}`,
        () => Promise.resolve(config.getConfigValue(guildId, 'channel', channelType)),
        2 * 60 * 1000 // Cache por 2 minutos
    );
}

/**
 * Obtém um cargo específico do servidor
 * @param {string} guildId - ID do servidor
 * @param {string} roleType - Tipo de cargo (verified, staff, etc)
 * @returns {string|null} ID do cargo ou null
 */
export function getRoleId(guildId, roleType) {
    return config.getConfigValue(guildId, 'role', roleType);
}

/**
 * Obtém todos os cargos staff configurados
 * @param {string} guildId - ID do servidor
 * @returns {string[]} Array de IDs dos cargos staff
 */
export function getStaffRoleIds(guildId) {
    return config.getStaffRoleIds(guildId);
}

/**
 * Verifica se um membro tem qualquer cargo staff
 * @param {import('discord.js').GuildMember} member - Membro a verificar
 * @returns {boolean} True se o membro tem qualquer cargo staff
 */
export function hasStaffRole(member) {
    if (!member || !member.guild) return false;
    const staffRoleIds = getStaffRoleIds(member.guild.id);
    if (staffRoleIds.length === 0) return false;
    return staffRoleIds.some(roleId => member.roles.cache.has(roleId));
}

/**
 * Obtém menções de todos os cargos staff
 * @param {string} guildId - ID do servidor
 * @param {import('discord.js').Guild} guild - Servidor Discord
 * @returns {string} String com menções de todos os cargos staff
 */
export function getStaffMentions(guildId, guild) {
    const staffRoleIds = getStaffRoleIds(guildId);
    if (staffRoleIds.length === 0) return '@Staff';
    
    return staffRoleIds
        .map(roleId => {
            const role = guild.roles.cache.get(roleId);
            return role ? `<@&${roleId}>` : null;
        })
        .filter(Boolean)
        .join(' ') || '@Staff';
}

/**
 * Obtém um cargo específico do servidor com cache
 * @param {string} guildId - ID do servidor
 * @param {string} roleType - Tipo de cargo (verified, staff, etc)
 * @returns {Promise<string|null>} ID do cargo ou null
 */
export async function getRoleIdCached(guildId, roleType) {
    return await getOrCompute(
        `role_${guildId}_${roleType}`,
        () => Promise.resolve(config.getConfigValue(guildId, 'role', roleType)),
        2 * 60 * 1000 // Cache por 2 minutos
    );
}

/**
 * Obtém as cores padrão
 * @returns {Object} Cores padrão
 */
export function getColors() {
    return config.colors;
}

/**
 * Obtém todos os cargos de doador de Primeira Dama configurados
 * @param {string} guildId - ID do servidor
 * @returns {string[]} Array de IDs dos cargos de doador
 */
export function getFirstLadyGiverRoleIds(guildId) {
    // Importação dinâmica para evitar dependência circular
    return import('../database/database.js').then(({ database }) => {
        return database.getFirstLadyGiverRoles(guildId);
    });
}

/**
 * Verifica se um membro tem qualquer cargo de doador de Primeira Dama
 * @param {import('discord.js').GuildMember} member - Membro a verificar
 * @returns {boolean} True se o membro tem qualquer cargo de doador
 */
export async function hasFirstLadyGiverRole(member) {
    if (!member || !member.guild) return false;
    const { database } = await import('../database/database.js');
    const giverRoleIds = database.getFirstLadyGiverRoles(member.guild.id);
    if (giverRoleIds.length === 0) return false;
    return giverRoleIds.some(roleId => member.roles.cache.has(roleId));
}

/**
 * Obtém todos os cargos de boost removíveis configurados
 * @param {string} guildId - ID do servidor
 * @returns {string[]} Array de IDs dos cargos de boost removíveis
 */
export function getBoostRemovableRoleIds(guildId) {
    return config.getBoostRemovableRoleIds(guildId);
}

