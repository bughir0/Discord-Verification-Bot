/**
 * Sistema de Cooldown para comandos
 */

const cooldowns = new Map();

/**
 * Configurações de cooldown por comando (em segundos)
 */
const cooldownConfig = {
    'ban': 5,
    'kick': 5,
    'unban': 5,
    'pd': 10,
    'config': 3,
    'clear-database': 30,
    'verification-stats': 5,
    'setup-verification': 10
};

/**
 * Verifica se um usuário está em cooldown
 * @param {string} userId - ID do usuário
 * @param {string} commandName - Nome do comando
 * @returns {number|null} Tempo restante em segundos ou null se não está em cooldown
 */
export function checkCooldown(userId, commandName) {
    const key = `${userId}_${commandName}`;
    const cooldownTime = cooldownConfig[commandName] || 0;

    if (cooldownTime === 0) {
        return null; // Sem cooldown para este comando
    }

    const cooldownEnd = cooldowns.get(key);
    const now = Date.now();

    if (cooldownEnd && now < cooldownEnd) {
        const remaining = Math.ceil((cooldownEnd - now) / 1000);
        return remaining;
    }

    // Definir novo cooldown
    cooldowns.set(key, now + (cooldownTime * 1000));
    
    // Limpar cooldown após expirar
    setTimeout(() => {
        cooldowns.delete(key);
    }, cooldownTime * 1000);

    return null;
}

/**
 * Remove o cooldown de um usuário (útil para testes ou admin)
 * @param {string} userId - ID do usuário
 * @param {string} commandName - Nome do comando
 */
export function clearCooldown(userId, commandName) {
    const key = `${userId}_${commandName}`;
    cooldowns.delete(key);
}

/**
 * Formata o tempo restante de cooldown
 * @param {number} seconds - Segundos restantes
 * @returns {string} Tempo formatado
 */
export function formatCooldown(seconds) {
    if (seconds < 60) {
        return `${seconds} segundo${seconds !== 1 ? 's' : ''}`;
    } else if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${minutes} minuto${minutes !== 1 ? 's' : ''}${secs > 0 ? ` e ${secs} segundo${secs !== 1 ? 's' : ''}` : ''}`;
    } else {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours} hora${hours !== 1 ? 's' : ''}${minutes > 0 ? ` e ${minutes} minuto${minutes !== 1 ? 's' : ''}` : ''}`;
    }
}

