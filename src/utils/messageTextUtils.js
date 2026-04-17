/**
 * Valida e trunca campos de mensagem (embed / cartão V2).
 * @param {Array} fields
 * @returns {Array<{name: string, value: string, inline: boolean}>}
 */
export function validateFields(fields = []) {
    if (!Array.isArray(fields) || fields.length === 0) return [];

    const MAX_FIELDS = 25;
    const MAX_FIELD_NAME = 256;
    const MAX_FIELD_VALUE = 1024;

    return fields
        .slice(0, MAX_FIELDS)
        .map(field => {
            if (!field || typeof field !== 'object') return null;
            return {
                name: String(field.name || '\u200b').slice(0, MAX_FIELD_NAME),
                value: String(field.value || '\u200b').slice(0, MAX_FIELD_VALUE),
                inline: field.inline !== undefined ? field.inline : false
            };
        })
        .filter(Boolean);
}

/**
 * @param {string} text
 * @param {number} maxLength
 * @returns {string}
 */
export function truncateText(text, maxLength) {
    if (!text) return '';
    const str = String(text);
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength - 3) + '...';
}
