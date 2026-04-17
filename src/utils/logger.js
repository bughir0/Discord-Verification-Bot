// Função para formatar a data
function getTimestamp() {
    const now = new Date();
    return now.toLocaleTimeString('pt-BR', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        hour12: false
    });
}

function serializeDetails(details) {
    if (!details) return '';
    if (typeof details === 'string') return details;
    try {
        const json = JSON.stringify(details);
        // Evitar logs gigantes no console / webhook
        if (json.length > 600) {
            return json.slice(0, 597) + '...';
        }
        return json;
    } catch {
        return String(details);
    }
}

// Função principal de log (uma linha só, com cores ANSI)
function log(type, message, details = '') {
    const timestamp = `[${getTimestamp()}]`;
    const typeMap = {
        info:  'ℹ️ [INFO]',
        success: '✅ [SUCESSO]',
        warning: '⚠️ [AVISO]',
        error: '❌ [ERRO]',
        debug: '🐛 [DEBUG]'
    };
    
    const typePrefix = typeMap[type.toLowerCase()] || `[${type.toUpperCase()}]`;

    // Cores ANSI para deixar a saída mais legível no terminal
    const colors = {
        reset: '\x1b[0m',
        dim: '\x1b[90m',
        info: '\x1b[36m',    // ciano
        success: '\x1b[32m', // verde
        warning: '\x1b[33m', // amarelo
        error: '\x1b[31m',   // vermelho
        debug: '\x1b[35m'    // magenta
    };

    const levelColor = {
        info: colors.info,
        success: colors.success,
        warning: colors.warning,
        error: colors.error,
        debug: colors.debug
    }[type.toLowerCase()] || colors.reset;

    const tsColored = `${colors.dim}${timestamp}${colors.reset}`;
    const prefixColored = `${levelColor}${typePrefix}${colors.reset}`;

    let line = `${tsColored} ${prefixColored} ${message}`;

    const extra = serializeDetails(details);
    if (extra) {
        line += ` ${colors.dim}| ${extra}${colors.reset}`;
    }
    
    console.log(line);
}

// Funções auxiliares para cada tipo de log
const logger = {
    info: (message, details) => log('info', message, details),
    success: (message, details) => log('success', message, details),
    warning: (message, details) => log('warning', message, details),
    error: (message, details) => log('error', message, details),
    debug: (message, details) => log('debug', message, details)
};

export { logger };
export default logger;

