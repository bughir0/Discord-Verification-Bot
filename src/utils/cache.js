/**
 * Sistema de Cache simples para melhorar performance
 */

const cache = new Map();
const cacheTimestamps = new Map();

// Tempo de expiração padrão (5 minutos)
const DEFAULT_TTL = 5 * 60 * 1000;

/**
 * Obtém um valor do cache
 * @param {string} key - Chave do cache
 * @returns {any|null} Valor do cache ou null se não existe ou expirou
 */
export function get(key) {
    const timestamp = cacheTimestamps.get(key);
    if (!timestamp) {
        return null;
    }

    const now = Date.now();
    if (now > timestamp) {
        // Cache expirado
        cache.delete(key);
        cacheTimestamps.delete(key);
        return null;
    }

    return cache.get(key);
}

/**
 * Define um valor no cache
 * @param {string} key - Chave do cache
 * @param {any} value - Valor a ser armazenado
 * @param {number} ttl - Tempo de vida em milissegundos (padrão: 5 minutos)
 */
export function set(key, value, ttl = DEFAULT_TTL) {
    cache.set(key, value);
    cacheTimestamps.set(key, Date.now() + ttl);
}

/**
 * Remove um valor do cache
 * @param {string} key - Chave do cache
 */
export function remove(key) {
    cache.delete(key);
    cacheTimestamps.delete(key);
}

/**
 * Limpa todo o cache
 */
export function clear() {
    cache.clear();
    cacheTimestamps.clear();
}

/**
 * Verifica se uma chave existe no cache
 * @param {string} key - Chave do cache
 * @returns {boolean} True se existe e não expirou
 */
export function has(key) {
    return get(key) !== null;
}

/**
 * Obtém ou calcula um valor (get-or-compute pattern)
 * @param {string} key - Chave do cache
 * @param {Function} computeFn - Função para calcular o valor se não estiver no cache
 * @param {number} ttl - Tempo de vida em milissegundos
 * @returns {Promise<any>} Valor do cache ou valor calculado
 */
export async function getOrCompute(key, computeFn, ttl = DEFAULT_TTL) {
    const cached = get(key);
    if (cached !== null) {
        return cached;
    }

    const value = await computeFn();
    set(key, value, ttl);
    return value;
}

