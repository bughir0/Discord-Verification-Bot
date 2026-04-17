import https from 'https';
import { URL } from 'url';
import { buildEmbedMessageV2 } from './embedBuilderV2.js';

// Mantém referência para os métodos originais
const originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug
};

let forwardingEnabled = true;

function truncate(str, max) {
    if (!str) return '';
    if (str.length <= max) return str;
    return str.slice(0, max - 3) + '...';
}

/**
 * Envia uma mensagem para o webhook de console
 * @param {URL} webhookUrl
 * @param {'log'|'info'|'warn'|'error'|'debug'} level
 * @param {any[]} args
 */
function sendToWebhook(webhookUrl, level, args) {
    if (!forwardingEnabled) {
        return;
    }
    try {
        const colorMap = {
            log: 0x95a5a6,   // cinza
            info: 0x3498db,  // azul
            warn: 0xf1c40f,  // amarelo
            error: 0xe74c3c, // vermelho
            debug: 0x9b59b6  // roxo
        };

        // Serializar argumentos em uma string legível
        const text = args.map(arg => {
            if (arg instanceof Error) {
                return `${arg.name}: ${arg.message}\n${arg.stack || ''}`;
            }
            if (typeof arg === 'string') return arg;
            try {
                return JSON.stringify(arg, null, 2);
            } catch {
                return String(arg);
            }
        }).join(' ');

        if (!text) return;

        const content = truncate(text, 3900); // margem para o código e formatação

        const isError = level === 'error';
        const v2 = buildEmbedMessageV2({
            title: `Console ${level.toUpperCase()}`,
            description: '```ansi\n' + content + '\n```',
            color: colorMap[level] ?? colorMap.log,
            timestamp: new Date().toISOString()
        }, {});
        const payload = JSON.stringify({
            content: isError ? '<@380475076174282753>' : undefined,
            components: v2.components,
            flags: v2.flags
        });

        const options = {
            method: 'POST',
            hostname: webhookUrl.hostname,
            path: webhookUrl.pathname + webhookUrl.search,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        const req = https.request(options, res => {
            // Verificar status da resposta
            if (res.statusCode !== 200 && res.statusCode !== 204) {
                // Log apenas uma vez para evitar spam (usando uma flag estática)
                if (!req._errorLogged) {
                    req._errorLogged = true;
                    originalConsole.warn(`⚠️ Webhook retornou status ${res.statusCode}. Verifique se a URL do webhook está correta.`);
                }
            }
            // Consumir a resposta para não vazar socket
            res.on('data', () => {});
        });

        req.on('error', (error) => {
            // Log apenas uma vez para evitar spam
            if (!req._errorLogged) {
                req._errorLogged = true;
                originalConsole.warn('⚠️ Erro ao enviar log para webhook:', error.message);
                originalConsole.warn('   Verifique se DISCORD_CONSOLE_WEBHOOK está correto no .env');
            }
        });

        req.write(payload);
        req.end();
    } catch {
        // Nunca lançar erro daqui
    }
}

/**
 * Inicializa o sistema que replica tudo que cai no console para o webhook
 * Le o webhook de process.env.DISCORD_CONSOLE_WEBHOOK
 */
export function initConsoleWebhookLogger() {
    const url = process.env.DISCORD_CONSOLE_WEBHOOK;
    if (!url) {
        // Se não houver webhook configurado, não altera o console
        originalConsole.warn('⚠️ DISCORD_CONSOLE_WEBHOOK não configurado. Logs não serão enviados para webhook.');
        return;
    }

    let webhookUrl;
    try {
        webhookUrl = new URL(url);
        
        // Verificar se é uma URL de webhook do Discord válida
        if (!webhookUrl.hostname.includes('discord.com') && !webhookUrl.hostname.includes('discordapp.com')) {
            originalConsole.warn('⚠️ DISCORD_CONSOLE_WEBHOOK: URL não parece ser um webhook do Discord. Hostname:', webhookUrl.hostname);
        }
        
        // Verificar se tem o pathname correto (/api/webhooks/)
        if (!webhookUrl.pathname.includes('/api/webhooks/')) {
            originalConsole.warn('⚠️ DISCORD_CONSOLE_WEBHOOK: URL não parece ter o formato correto de webhook. Path:', webhookUrl.pathname);
        }
    } catch (error) {
        // URL inválida, não inicializa
        originalConsole.error('❌ DISCORD_CONSOLE_WEBHOOK: URL inválida. Erro:', error.message);
        originalConsole.error('   Formato esperado: https://discord.com/api/webhooks/ID/TOKEN');
        return;
    }

    // Sobrescrever métodos do console mantendo saída original + envio ao webhook
    console.log = (...args) => {
        originalConsole.log(...args);
        sendToWebhook(webhookUrl, 'log', args);
    };
    console.info = (...args) => {
        originalConsole.info(...args);
        sendToWebhook(webhookUrl, 'info', args);
    };
    console.warn = (...args) => {
        originalConsole.warn(...args);
        sendToWebhook(webhookUrl, 'warn', args);
    };
    console.error = (...args) => {
        originalConsole.error(...args);
        sendToWebhook(webhookUrl, 'error', args);
    };
    console.debug = (...args) => {
        originalConsole.debug(...args);
        sendToWebhook(webhookUrl, 'debug', args);
    };
    
    originalConsole.info('✅ Console webhook logger inicializado com sucesso');
}

export function disableConsoleWebhookForwarding() {
    forwardingEnabled = false;
}

export function enableConsoleWebhookForwarding() {
    forwardingEnabled = true;
}

