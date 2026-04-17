import { REST, Routes } from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';

// Importar comandos de moderação
import * as banCommand from '../commands/moderation/ban.js';
import * as kickCommand from '../commands/moderation/kick.js';
import * as unbanCommand from '../commands/moderation/unban.js';
import * as firstLadyCommand from '../commands/moderation/firstLady.js';
import * as nukeCommand from '../commands/moderation/nuke.js';
// Importar comandos de administração
import * as configCommand from '../commands/admin/config.js';
import * as configValidateCommand from '../commands/admin/configValidate.js';
import * as testLogsCommand from '../commands/admin/testLogs.js';
import * as verificationToggleCommand from '../commands/admin/verificationToggle.js';
import * as whitelistToggleCommand from '../commands/admin/whitelistToggle.js';
import * as whitelistConfigCommand from '../commands/admin/whitelistConfig.js';
import * as createEmbedCommand from '../commands/admin/createEmbed.js';
import * as sayCommand from '../commands/admin/say.js';
// Importar comandos de informação
import * as helpCommand from '../commands/info/help.js';
import * as statusCommand from '../commands/info/status.js';
// Importar comandos de mídia
import * as youtubeCommand from '../commands/media/youtube.js';

/**
 * Registra os comandos slash no Discord
 * @param {string} token - Token do bot
 * @param {string} clientId - ID do cliente (bot)
 */
async function registerCommands(token, clientId) {
    try {
        // Comandos de verificação
        const verificationCommands = [
            new SlashCommandBuilder()
                .setName('setup-verification')
                .setDescription('Configura a mensagem de verificação no canal atual')
                .toJSON(),
            new SlashCommandBuilder()
                .setName('verification-stats')
                .setDescription('Mostra estatísticas das verificações')
                .toJSON(),
            new SlashCommandBuilder()
                .setName('clear-database')
                .setDescription('[ADMIN] Limpa todos os dados de verificação')
                .toJSON()
        ];

        // Comandos de whitelist
        const whitelistCommands = [
            new SlashCommandBuilder()
                .setName('setup-whitelist')
                .setDescription('Configura a mensagem de whitelist no canal atual')
                .toJSON(),
            new SlashCommandBuilder()
                .setName('wl')
                .setDescription('Configura a mensagem de whitelist no canal atual')
                .toJSON(),
            new SlashCommandBuilder()
                .setName('wl-list')
                .setDescription('Mostra a lista de whitelists aprovadas com seus nicks do Minecraft')
                .toJSON(),
            new SlashCommandBuilder()
                .setName('wl-info')
                .setDescription('Mostra as informações de whitelist de um usuário')
                .addUserOption(option =>
                    option.setName('usuário')
                        .setDescription('Usuário para consultar (padrão: você)')
                        .setRequired(false))
                .toJSON(),
            new SlashCommandBuilder()
                .setName('wl-remove')
                .setDescription('Remove a whitelist de um usuário específico')
                .addUserOption(option =>
                    option.setName('usuário')
                        .setDescription('O usuário que terá a whitelist removida')
                        .setRequired(true))
                .toJSON(),
            new SlashCommandBuilder()
                .setName('wl-clear')
                .setDescription('⚠️ Limpa TODAS as whitelists do servidor (banco de dados e servidor Minecraft)')
                .toJSON()
        ];

        // Adicionar comandos de moderação
        // Os comandos já são definidos como JSON nos arquivos de comando
        const moderationCommands = [
            banCommand.data,
            kickCommand.data,
            unbanCommand.data,
            firstLadyCommand.data,
            nukeCommand.data
        ];

        // Adicionar comandos de administração
        const adminCommands = [
            configCommand.data,
            configValidateCommand.data,
            testLogsCommand.data,
            verificationToggleCommand.data,
            whitelistToggleCommand.data,
            whitelistConfigCommand.data,
            createEmbedCommand.data,
            sayCommand.data
        ];

        // Adicionar comandos de informação
        const infoCommands = [
            helpCommand.data,
            statusCommand.data
        ];

        // Adicionar comandos de mídia
        const mediaCommands = [
            youtubeCommand.data
        ];

        // Combinar todos os comandos
        const commands = [...verificationCommands, ...whitelistCommands, ...moderationCommands, ...adminCommands, ...infoCommands, ...mediaCommands];

        const rest = new REST({ version: '10' }).setToken(token);

        console.log('🔁 Registrando comandos globalmente...');
        
        // Registrar comandos globalmente (isso substitui automaticamente os comandos antigos)
        // Adicionar timeout e retry logic
        let data;
        let retries = 3;
        let lastError;
        
        while (retries > 0) {
            try {
                data = await Promise.race([
                    rest.put(Routes.applicationCommands(clientId), { body: commands }),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Timeout ao registrar comandos (30s)')), 30000)
                    )
                ]);
                
                console.log(`✅ ${data.length} comandos registrados com sucesso!`);
                return true;
            } catch (retryError) {
                lastError = retryError;
                retries--;
                
                // Verificar se é erro de timeout ou conexão
                const isTimeoutError = retryError.code === 'UND_ERR_CONNECT_TIMEOUT' || 
                                      retryError.code === 'ETIMEDOUT' ||
                                      retryError.message?.includes('Timeout') ||
                                      retryError.message?.includes('timeout');
                
                if (isTimeoutError && retries > 0) {
                    console.warn(`⚠️ Timeout ao registrar comandos. Tentando novamente... (${retries} tentativas restantes)`);
                    // Aguardar um pouco antes de tentar novamente
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    continue;
                }
                
                // Se não for timeout ou não houver mais tentativas, lançar o erro
                throw retryError;
            }
        }
        
        // Se chegou aqui, todas as tentativas falharam
        throw lastError;
    } catch (error) {
        // Tratar diferentes tipos de erro
        const isTimeoutError = error.code === 'UND_ERR_CONNECT_TIMEOUT' || 
                              error.code === 'ETIMEDOUT' ||
                              error.message?.includes('Timeout') ||
                              error.message?.includes('timeout');
        
        const isNetworkError = error.code === 'ECONNRESET' ||
                              error.code === 'ENOTFOUND' ||
                              error.code === 'ECONNREFUSED' ||
                              error.name === 'ConnectTimeoutError';
        
        if (isTimeoutError || isNetworkError) {
            console.warn('⚠️ Erro de conexão ao registrar comandos (timeout/rede). O bot continuará funcionando, mas os comandos podem não estar atualizados.');
            console.warn('   Tente reiniciar o bot mais tarde ou verifique sua conexão com a internet.');
            // Não fazer o bot crashear por problemas de rede
            return false;
        }
        
        console.error('❌ Erro ao registrar comandos:', error.message || error);
        if (error.stack) {
            console.error('Stack trace:', error.stack);
        }
        return false;
    }
}

export { registerCommands };
